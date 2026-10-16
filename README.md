# Homelab SOC Portal

[English version](README.en.md)

Ein Webportal für mein Homelab-SOC. Es zeigt Incidents, Detections, Hosts, Netzwerk und die Datenpipeline
an einer Stelle und liest die Daten live aus Splunk und Cribl Stream. Incidents entstehen aus den Splunk-Alerts
meiner Sigma-Regeln, ihr Status liegt mit Verlauf in SQLite.

Das Portal läuft auf `siem-docker` (VM 210) unter `http://<VM-IP>:8090` und ist nur im LAN erreichbar.
Systeme, die noch nicht angebunden sind (Shuffle, OpenCTI), erscheinen in der Oberfläche als „Simuliert“.
Fehlt eine Metrik, steht dort „nicht verfügbar“ statt eines erfundenen Werts.

## Was das Portal kann

- Lagebild mit Sicherheitsindex, Netzwerktopologie (React Flow), KPIs, Incident-Warteschlange und -Verlauf,
  Ereignisanalyse, MITRE-Abdeckung, Systemstatus und Pipeline.
- Eine globale Filterleiste (Zeitraum, Host, Severity, MITRE-Technik, Suche), die in der URL steht und
  serverseitig auf alle Panels wirkt.
- Incidents mit Suche, Sortierung und Detailansicht samt Splunk-Ergebniszeilen. Der Status läuft von Neu über
  In Bearbeitung und Gelöst bis Geschlossen, mit Notiz und Verlauf. Status ändern geht nur mit Login.
- Detections aus dem Sigma Detection Lab (importiert), lokale Splunk-Suchen und simulierte Regeln, jeweils mit
  Logik, Feldern, MITRE-Zuordnung, erzeugtem SPL und Teststatus.
- Hosts aus den Auth-Logs, Cribl-Inputs, -Routen und -Outputs mit Zählern, ein druckbarer Report und eine
  Settings-Seite, die nur URLs und Schalter anzeigt.

Der Sicherheitsindex ist eine einfache Heuristik: 100 minus 25 je kritischem, 10 je hohem, 4 je mittlerem und
1 je niedrigem offenen Incident, minus 15 je ausgefallener Kernintegration (Splunk, Cribl). Die Formel steht
im Tooltip.

## Datenquellen

Incidents kommen aus den Fired Alerts von Splunk und werden alle 120 Sekunden nach SQLite übernommen. Weil
Splunk Fired Alerts nach 24 Stunden verwirft, sichert das Portal die Ergebniszeilen beim ersten Sync. Events,
Hosts, Quell-IPs und die Topologie stammen aus `index=homelab_auth` (Export-Suche, 30 s Cache). Für Cribl
nutzt das Portal die REST-API (Health, Inputs, Outputs, Routen, Pipelines). Die Sigma-Regeln und ihr Teststatus
kommen per Import-Skript aus dem Repo `homelab-siem`.

Severity- und MITRE-Filter wirken auf Splunk-Events über die `event_type`s der passenden Sigma-Regeln. Mit
`T1110` bleiben zum Beispiel nur `authentication`-Events übrig.

## Aufbau

```
Browser --HTTP 8090 (LAN)--> portal (Fastify + React-Build, SQLite im Volume /data)
                               |  Docker-Netz homelab-siem_default
                               +--> splunk:8089  Splunk REST
                               +--> cribl:9000   Cribl API
lab-linux-01 --syslog UDP 9514--> Cribl --HEC--> Splunk --Sigma-Alerts (5 min)--> Fired Alerts
```

Das Backend in `server/` ist Node 24 mit TypeScript, Fastify 5, Zod und `node:sqlite`. Adapter für Splunk und
Cribl kapseln HTTP, Timeouts und Fehler, darüber liegen Services, ein Repository für Incidents und die Routen.
Das Frontend in `web/` nutzt React 19, Vite, Tailwind 4, shadcn/ui, Recharts, React Flow und TanStack Query.
Die Design-Tokens liegen in `web/src/styles/tokens.css`, die Vorlage dazu in
[docs/design-reference.md](docs/design-reference.md).

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
Stand 15.10.2026: Typecheck sauber, 30 Server- und 10 Web-Tests grün, E2E grün, Docker-Image `healthy`.

Zwei Fehler sind erst durch die Tests aufgefallen. Parallele Cribl-Anfragen haben sich jeweils neu angemeldet,
jetzt teilen sie sich ein Login. Und Node's eingebautes `fetch` akzeptiert keinen Dispatcher aus einer anderen
undici-Version, was erst live mit Splunks selbstsigniertem Zertifikat auffiel. Der Adapter nutzt jetzt das
`fetch` von undici.

## Deployment

Das Portal wird über das Repo
[homelab-infrastructure-automation](https://github.com/QuitScope/homelab-infrastructure-automation) ausgerollt:
Die Ansible-Rolle `soc_portal` checkt dieses Repo auf `siem-docker` nach `/opt/homelab-soc-portal` aus, holt die
`.env` aus HashiCorp Vault und startet das Compose-Projekt. Splunk REST (8089) und HEC (8088) bleiben dabei
unveröffentlicht, das Portal hängt am Docker-Netz `homelab-siem_default`. Die SQLite-Datenbank liegt im Volume
`homelab-soc-portal_portal-data` und übersteht neue Images.

Wer ohne Ansible deployen will, kopiert das Repo auf die VM, legt dort eine `.env` nach `.env.example` an und
startet `docker compose up -d --build`.

Docker-Container auf der VM brauchen einen erreichbaren DNS-Server für `npm ci`. Weil der per DHCP verteilte
IPv4-DNS im Heimnetz nicht antwortet, steht in `/etc/docker/daemon.json` fest `{ "dns": ["<ROUTER-IP>"] }`.

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

Splunk und Cribl brauchen keine Änderung. Das Portal liest nur. Weil `GET /system/outputs` in Cribl den
HEC-Token im Klartext liefert, reicht der Adapter nur IDs, Typ, Status und Zahlen weiter, ein Test prüft das.
Neue Sigma-Regeln holt `npm run import:sigma -- <Pfad zu sigma-detection-lab>` in
`server/data/sigma-import.json`.

## Sicherheit

Schreibende Endpunkte brauchen ein signiertes Session-Cookie (`HttpOnly`, `SameSite=Strict`, 8 Stunden). Der
Login prüft einen scrypt-Hash in konstanter Zeit, nach fünf Fehlversuchen ist die IP fünf Minuten gesperrt.
Lesen geht im LAN ohne Login. Der Port ist nur an die LAN-IP gebunden und am Router nicht freigegeben.

Zugangsdaten verwaltet die `.env` auf dem Server, die beim Deployment aus HashiCorp Vault kommt; das
Frontend bekommt davon nichts zu sehen. Integrationsziele kommen nur aus der Konfiguration und müssen auf
der Allowlist stehen. Filterwerte werden mit Zod geprüft und in SPL gequotet, Tests decken Injection-Versuche ab.

## Grenzen

- Shuffle, OpenCTI und Wazuh sind nicht angebunden, SOAR und Threat Intel zeigen markierte Demo-Daten.
- Prometheus und Grafana werden nur per Health-Endpunkt geprüft.
- Hostdaten kommen nur aus Auth-Logs, es gibt kein Inventar und keinen Agentenstatus.
- Die Cribl-Zähler laufen seit dem Worker-Start und passen nicht zum Filterzeitraum.
- Das Portal nutzt den Splunk-Admin-Account. Ein eigener Lese-Account wäre sauberer.
- Ein Benutzer, kein HTTPS: gedacht fürs Heimnetz, nicht fürs Internet.

## API

`GET /api/health`, `/api/integrations`, `/api/settings`, `/api/dashboard`, `/api/events`, `/api/hosts`,
`/api/topology`, `/api/pipelines`, `/api/incidents`, `/api/incidents/:id`, `/api/detections`,
`/api/detections/:id`, `/api/coverage`, `/api/soar`, `/api/threat-intel`, `GET /api/auth/me`,
`POST /api/auth/login|logout`, `PATCH /api/incidents/:id/status`, `POST /api/incidents/sync`.
Die Filter `range`, `host`, `severity`, `mitre` und `q` gelten für alle lesenden Endpunkte.
