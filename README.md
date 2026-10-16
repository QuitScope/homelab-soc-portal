# Homelab SOC Portal

[English version](README.en.md)

Nachdem mein [Homelab-SIEM](https://github.com/QuitScope/homelab-siem) lief, hatte ich zwei Oberflächen offen:
Splunk für Suchen und Alerts, Cribl für die Pipeline. Was fehlte, war der Blick, den ein SOC-Analyst hat: Welche
Alerts sind offen, wer kümmert sich darum, welche Regeln decken welche Angriffstechniken ab, und läuft die
Datenzufuhr überhaupt? Dieses Portal ist mein Versuch, genau das an einer Stelle zu zeigen.

Aus jedem Splunk-Alert meiner Sigma-Regeln wird ein Incident, den ich durch einen kleinen Workflow schicken kann
(Neu, In Bearbeitung, Gelöst, Geschlossen). Dazu kommen ein Lagebild mit Netzwerktopologie, die Detections mit
MITRE-Zuordnung, die Hosts aus den Auth-Logs und der Zustand der Cribl-Pipeline. Die Oberfläche ist auf Deutsch.

Das Portal läuft auf `siem-docker` (VM 210) unter `http://<VM-IP>:8090` und ist nur im LAN erreichbar.

## Warum so und nicht anders

- **Ein kleines eigenes Portal statt einer fertigen SOC-Plattform:** Die VM teilt sich ihre 8 GB schon mit Splunk
  und Cribl. Das Portal braucht im Betrieb rund 35 MB RAM, eine Plattform wie TheHive oder Wazuh hätte dort keinen
  Platz. Außerdem wollte ich die Schnittstellen von Splunk und Cribl selbst kennenlernen.
- **Nur lesen:** Das Portal ändert nichts an Splunk oder Cribl. Den Status der Incidents führt es selbst in
  SQLite, mit vollständigem Verlauf.
- **Ehrlich bei fehlenden Daten:** Systeme, die ich noch nicht angebunden habe (Shuffle, OpenCTI), erscheinen als
  „Simuliert“. Fehlt eine Metrik, steht dort „nicht verfügbar“ statt einer erfundenen Zahl.
- **Am Docker-Netz des SIEM:** Das Portal spricht Splunk REST und die Cribl-API direkt im Docker-Netz an. Dafür
  musste ich keinen zusätzlichen Port nach außen öffnen.
- **`node:sqlite` statt eines nativen SQLite-Moduls:** Kein Kompilieren beim Docker-Build, das Image bleibt klein.

## Was das Portal zeigt

- Lagebild mit Sicherheitsindex, Netzwerktopologie (React Flow), Kennzahlen, Incident-Warteschlange und -Verlauf,
  Ereignisanalyse, MITRE-Abdeckung, Systemstatus und Pipeline.
- Eine globale Filterleiste (Zeitraum, Host, Severity, MITRE-Technik, Suche), die in der URL steht und
  serverseitig auf alle Panels wirkt.
- Incidents mit Suche, Sortierung und Detailansicht samt den Splunk-Ergebniszeilen. Status ändern geht nur mit
  Login.
- Detections aus dem Sigma Detection Lab mit Logik, Feldern, MITRE-Zuordnung, erzeugtem SPL und Teststatus.
- Hosts aus den Auth-Logs, Cribl-Inputs, -Routen und -Outputs mit Zählern, ein druckbarer Report und eine
  Settings-Seite, die nur URLs und Schalter anzeigt.

Der Sicherheitsindex ist bewusst simpel: 100 minus 25 je kritischem, 10 je hohem, 4 je mittlerem und 1 je
niedrigem offenen Incident, minus 15 je ausgefallener Kernintegration (Splunk, Cribl). Die Formel steht im
Tooltip, damit niemand sie für einen Standard hält.

## Woher die Daten kommen

Incidents kommen aus den Fired Alerts von Splunk und werden alle 120 Sekunden nach SQLite übernommen. Events,
Hosts, Quell-IPs und die Topologie stammen aus `index=homelab_auth` (Export-Suche, 30 s Cache). Für Cribl nutzt
das Portal die REST-API. Die Sigma-Regeln und ihr Teststatus kommen per Import-Skript aus dem Repo
`homelab-siem`. Severity- und MITRE-Filter wirken auf die Splunk-Events über die `event_type`s der passenden
Sigma-Regeln, mit `T1110` bleiben zum Beispiel nur `authentication`-Events übrig.

```
Browser --HTTP 8090 (LAN)--> portal (Fastify + React-Build, SQLite im Volume /data)
                               |  Docker-Netz homelab-siem_default
                               +--> splunk:8089  Splunk REST
                               +--> cribl:9000   Cribl API
lab-linux-01 --syslog UDP 9514--> Cribl --HEC--> Splunk --Sigma-Alerts (5 min)--> Fired Alerts
```

Das Backend in `server/` ist Node 24 mit TypeScript, Fastify 5 und Zod. Adapter für Splunk und Cribl kapseln
HTTP, Timeouts und Fehler, darüber liegen Services, ein Repository für Incidents und die Routen. Das Frontend in
`web/` nutzt React 19, Vite, Tailwind 4, shadcn/ui, Recharts, React Flow und TanStack Query. Die Design-Tokens
liegen in `web/src/styles/tokens.css`, die Vorlage dazu in [docs/design-reference.md](docs/design-reference.md).

## Lokal starten

```bash
npm install
cp .env.example .env        # SESSION_SECRET setzen
npm run hash-password -- '<Passwort, mind. 12 Zeichen>'   # Ergebnis in ADMIN_PASSWORD_HASH
npm run dev                 # API auf :8080, Vite auf :5173
```

Ohne Splunk und Cribl startet das Portal trotzdem, die Panels zeigen dann „Nicht konfiguriert“. Mit
`SEED_DEMO=true` gibt es vier Demo-Incidents. Für echte Daten vom Arbeitsplatz aus reicht ein SSH-Tunnel:

```bash
ssh -N -L 18089:<SPLUNK-CONTAINER-IP>:8089 -L 29000:<CRIBL-CONTAINER-IP>:9000 root@<VM-IP>
```

Dazu `SPLUNK_URL=https://127.0.0.1:18089`, `CRIBL_URL=http://127.0.0.1:29000` und
`INTEGRATION_ALLOWLIST=127.0.0.1` setzen.

## Tests

```bash
npm run typecheck
npm test               # Vitest für Server und Web
npm run build
npx playwright install chromium
npm run e2e            # Dashboard, Incident öffnen, Status ändern, neu laden
```

Der E2E-Test startet die API mit frischer SQLite-Datei, Demo-Incidents und einem Wegwerf-Passwort selbst.
Aktueller Stand: Typecheck sauber, 31 Server- und 10 Web-Tests grün, E2E grün, Docker-Image `healthy`.

## Deployment

Ausgerollt wird das Portal über mein Repo
[homelab-infrastructure-automation](https://github.com/QuitScope/homelab-infrastructure-automation): Die
Ansible-Rolle `soc_portal` checkt dieses Repo auf `siem-docker` aus, holt die `.env` aus HashiCorp Vault und
startet das Compose-Projekt. Die SQLite-Datenbank liegt im Volume `homelab-soc-portal_portal-data` und übersteht
neue Images. Ohne Ansible geht es auch: Repo auf die VM kopieren, `.env` nach `.env.example` anlegen und
`docker compose up -d --build` ausführen.

Das Admin-Passwort wurde beim ersten Deployment zufällig erzeugt und liegt nur auf der VM in
`/root/soc-portal-admin-password.txt`. In der `.env` steht nur der scrypt-Hash.

## Konfiguration

Die wichtigsten Variablen (vollständig in `.env.example`):

| Variable | Bedeutung |
|---|---|
| `SESSION_SECRET` | signiert das Session-Cookie, mindestens 32 Zeichen |
| `ADMIN_USER`, `ADMIN_PASSWORD_HASH` | Login; ohne Hash ist das Portal nur lesbar |
| `SPLUNK_URL`, `SPLUNK_USER`, `SPLUNK_PASSWORD` | Splunk REST, Standard `https://splunk:8089` |
| `SPLUNK_VERIFY_TLS` | `false` nur für das selbstsignierte Zertifikat im internen Netz |
| `CRIBL_URL`, `CRIBL_USER`, `CRIBL_PASSWORD` | Cribl API, Standard `http://cribl:9000` |
| `INTEGRATION_ALLOWLIST` | erlaubte Hosts für Integrations-URLs (Schutz gegen SSRF) |
| `INCIDENT_SYNC_INTERVAL_SEC` | Sync-Intervall für Fired Alerts, `0` schaltet ihn ab |
| `EXCLUDE_HOST_PATTERNS`, `EXCLUDE_SOURCES` | Testhosts und synthetische Quellen ausblenden |
| `SEED_DEMO` | Demo-Incidents für Entwicklung und E2E |
| `PORTAL_BIND`, `PORTAL_PORT` | Bind-Adresse und Port für docker compose |

Neue Sigma-Regeln holt `npm run import:sigma -- <Pfad zu sigma-detection-lab>` in
`server/data/sigma-import.json`.

## Sicherheit

Schreibende Endpunkte brauchen ein signiertes Session-Cookie (`HttpOnly`, `SameSite=Strict`, 8 Stunden). Der
Login prüft einen scrypt-Hash in konstanter Zeit, nach fünf Fehlversuchen ist die IP fünf Minuten gesperrt.
Lesen geht im LAN ohne Login, der Port ist nur an die LAN-IP gebunden und am Router nicht freigegeben.

Zugangsdaten verwaltet die `.env` auf dem Server, die beim Deployment aus HashiCorp Vault kommt; das Frontend
bekommt davon nichts zu sehen. Integrationsziele kommen nur aus der Konfiguration und müssen auf der Allowlist
stehen. Filterwerte werden mit Zod geprüft und in SPL gequotet, Tests decken Injection-Versuche ab.

## Was schiefging und was ich daraus gelernt habe

- **Parallele Logins bei Cribl:** Das Dashboard fragt mehrere Cribl-Endpunkte gleichzeitig ab, und jede Anfrage
  hat sich zunächst neu angemeldet. Jetzt teilen sich alle Anfragen ein gemeinsames Login-Promise.
- **`fetch` und undici passen nicht immer zusammen:** Node's eingebautes `fetch` akzeptiert keinen Dispatcher
  aus einer anderen undici-Version. Lokal mit Mocks lief alles, der Fehler kam erst live gegen Splunks
  selbstsigniertes Zertifikat. Der Adapter nutzt jetzt das `fetch` von undici selbst.
- **Cribl liefert Secrets mit aus:** `GET /system/outputs` gibt den HEC-Token im Klartext zurück. Der Adapter
  reicht deshalb nur IDs, Typ, Status und Zahlen weiter, ein Test sorgt dafür, dass das so bleibt.
- **Fired Alerts sind vergänglich:** Splunk verwirft sie nach 24 Stunden. Das Portal speichert die
  Ergebniszeilen deshalb beim ersten Sync, sonst wäre ein älterer Incident leer.
- **Docker-Builds ohne DNS:** Auf der VM scheiterte `npm ci` mit `EAI_AGAIN`. Der per DHCP verteilte IPv4-DNS
  antwortet nicht, der Host weicht auf IPv6 aus, die Container können das nicht. Seitdem steht in
  `/etc/docker/daemon.json` fest `{ "dns": ["<ROUTER-IP>"] }`.

## Grenzen

- Shuffle, OpenCTI und Wazuh sind nicht angebunden, SOAR und Threat Intel zeigen markierte Demo-Daten.
- Prometheus und Grafana werden nur per Health-Endpunkt geprüft.
- Hostdaten kommen nur aus Auth-Logs, es gibt kein Inventar und keinen Agentenstatus.
- Die Cribl-Zähler laufen seit dem Worker-Start und passen nicht zum Filterzeitraum.
- Das Portal nutzt den Splunk-Admin-Account. Ein eigener Lese-Account wäre sauberer und steht auf meiner Liste.
- Ein Benutzer, kein HTTPS: gedacht fürs Heimnetz, nicht fürs Internet.

## API

`GET /api/health`, `/api/integrations`, `/api/settings`, `/api/dashboard`, `/api/events`, `/api/hosts`,
`/api/topology`, `/api/pipelines`, `/api/incidents`, `/api/incidents/:id`, `/api/detections`,
`/api/detections/:id`, `/api/coverage`, `/api/soar`, `/api/threat-intel`, `GET /api/auth/me`,
`POST /api/auth/login|logout`, `PATCH /api/incidents/:id/status`, `POST /api/incidents/sync`.
Die Filter `range`, `host`, `severity`, `mitre` und `q` gelten für alle lesenden Endpunkte.
