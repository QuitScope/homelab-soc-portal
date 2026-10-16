# Homelab SOC Portal

[Deutsche Version](README.md)

Once my [homelab SIEM](https://github.com/QuitScope/homelab-siem) was running, I had two UIs open: Splunk for
searches and alerts, Cribl for the pipeline. What was missing was the view a SOC analyst has: which alerts are
open, who is working on them, which rules cover which attack techniques, and is data still coming in at all?
This portal is my attempt to show exactly that in one place.

Every Splunk alert from my Sigma rules becomes an incident that I can move through a small workflow (new,
investigating, resolved, closed). On top of that there is a dashboard with a network topology, the detections
with their MITRE mapping, the hosts from the auth logs and the state of the Cribl pipeline. The UI is in German.

The portal runs on `siem-docker` (VM 210) at `http://<VM-IP>:8090` and is only reachable on the LAN.

## Why it is built this way

- **A small portal of my own instead of a full SOC platform:** the VM already shares its 8 GB with Splunk and
  Cribl. The portal needs about 35 MB of RAM; a platform like TheHive or Wazuh would not fit there. I also wanted
  to get to know the Splunk and Cribl APIs myself.
- **Read-only:** the portal changes nothing in Splunk or Cribl. It keeps the incident status itself in SQLite,
  with a full history.
- **Honest about missing data:** systems I have not connected yet (Shuffle, OpenCTI) show up as "Simuliert"
  (simulated). A missing metric shows "nicht verfügbar" (not available) instead of a made-up number.
- **On the SIEM's Docker network:** the portal talks to Splunk REST and the Cribl API directly inside the Docker
  network, so I did not have to open any extra port to the outside.
- **`node:sqlite` instead of a native SQLite module:** no compiling during the Docker build, and the image stays
  small.

## What the portal shows

- Dashboard with a security index, network topology (React Flow), key figures, incident queue and timeline,
  event analytics, MITRE coverage, system status and pipeline.
- A global filter bar (time range, host, severity, MITRE technique, search) that lives in the URL and is applied
  server-side to every panel.
- Incidents with search, sorting and a detail view including the Splunk result rows. Changing status requires
  a login.
- Detections from the Sigma Detection Lab with logic, fields, MITRE mapping, generated SPL and test status.
- Hosts from the auth logs, Cribl inputs, routes and outputs with counters, a printable report and a settings
  page that only shows URLs and switches.

The security index is deliberately simple: 100 minus 25 per critical, 10 per high, 4 per medium and 1 per low
open incident, minus 15 per failed core integration (Splunk, Cribl). The formula is shown in the tooltip so
nobody mistakes it for a standard.

## Where the data comes from

Incidents come from Splunk's fired alerts and are synced into SQLite every 120 seconds. Events, hosts, source IPs
and the topology come from `index=homelab_auth` (export search, 30 s cache). For Cribl the portal uses the REST
API. The Sigma rules and their test status are imported from the `homelab-siem` repository with a script.
Severity and MITRE filters apply to the Splunk events through the `event_type`s of the matching Sigma rules;
with `T1110`, for example, only `authentication` events remain.

```
Browser --HTTP 8090 (LAN)--> portal (Fastify + React build, SQLite in volume /data)
                               |  Docker network homelab-siem_default
                               +--> splunk:8089  Splunk REST
                               +--> cribl:9000   Cribl API
lab-linux-01 --syslog UDP 9514--> Cribl --HEC--> Splunk --Sigma alerts (5 min)--> fired alerts
```

The backend in `server/` is Node 24 with TypeScript, Fastify 5 and Zod. Adapters for Splunk and Cribl wrap HTTP,
timeouts and errors; services, an incident repository and the routes sit on top. The frontend in `web/` uses
React 19, Vite, Tailwind 4, shadcn/ui, Recharts, React Flow and TanStack Query. Design tokens live in
`web/src/styles/tokens.css`, the reference in [docs/design-reference.en.md](docs/design-reference.en.md).

## Running locally

```bash
npm install
cp .env.example .env        # set SESSION_SECRET
npm run hash-password -- '<password, at least 12 characters>'   # result goes into ADMIN_PASSWORD_HASH
npm run dev                 # API on :8080, Vite on :5173
```

Without Splunk and Cribl the portal still starts; the panels then show "Nicht konfiguriert" (not configured).
`SEED_DEMO=true` adds four demo incidents. For real data from a workstation an SSH tunnel is enough:

```bash
ssh -N -L 18089:<SPLUNK-CONTAINER-IP>:8089 -L 29000:<CRIBL-CONTAINER-IP>:9000 root@<VM-IP>
```

Then set `SPLUNK_URL=https://127.0.0.1:18089`, `CRIBL_URL=http://127.0.0.1:29000` and
`INTEGRATION_ALLOWLIST=127.0.0.1`.

## Tests

```bash
npm run typecheck
npm test               # Vitest for server and web
npm run build
npx playwright install chromium
npm run e2e            # dashboard, open an incident, change status, reload
```

The E2E test starts the API itself with a fresh SQLite file, demo incidents and a throwaway password. Current
state: typecheck clean, 31 server and 10 web tests green, E2E green, Docker image `healthy`.

## Deployment

The portal is rolled out from my
[homelab-infrastructure-automation](https://github.com/QuitScope/homelab-infrastructure-automation) repository:
the Ansible role `soc_portal` checks this repository out on `siem-docker`, fetches the `.env` from HashiCorp
Vault and starts the compose project. The SQLite database lives in the volume `homelab-soc-portal_portal-data`
and survives new images. It also works without Ansible: copy the repository to the VM, create a `.env` from
`.env.example` and run `docker compose up -d --build`.

The admin password was generated randomly on the first deployment and only exists on the VM in
`/root/soc-portal-admin-password.txt`. The `.env` only holds the scrypt hash.

## Configuration

The main variables (full list in `.env.example`):

| Variable | Meaning |
|---|---|
| `SESSION_SECRET` | signs the session cookie, at least 32 characters |
| `ADMIN_USER`, `ADMIN_PASSWORD_HASH` | login; without a hash the portal is read-only |
| `SPLUNK_URL`, `SPLUNK_USER`, `SPLUNK_PASSWORD` | Splunk REST, default `https://splunk:8089` |
| `SPLUNK_VERIFY_TLS` | `false` only for the self-signed certificate on the internal network |
| `CRIBL_URL`, `CRIBL_USER`, `CRIBL_PASSWORD` | Cribl API, default `http://cribl:9000` |
| `INTEGRATION_ALLOWLIST` | allowed hosts for integration URLs (SSRF protection) |
| `INCIDENT_SYNC_INTERVAL_SEC` | fired alert sync interval, `0` turns it off |
| `EXCLUDE_HOST_PATTERNS`, `EXCLUDE_SOURCES` | hide test hosts and synthetic sources |
| `SEED_DEMO` | demo incidents for development and E2E |
| `PORTAL_BIND`, `PORTAL_PORT` | bind address and port for docker compose |

New Sigma rules are pulled into `server/data/sigma-import.json` with
`npm run import:sigma -- <path to sigma-detection-lab>`.

## Security

Write endpoints require a signed session cookie (`HttpOnly`, `SameSite=Strict`, 8 hours). The login checks a
scrypt hash in constant time; after five failed attempts the IP is locked for five minutes. Reading works on the
LAN without a login; the port is bound to the LAN IP only and not forwarded on the router.

Credentials are managed in the `.env` on the server, which comes from HashiCorp Vault at deployment; the
frontend never sees them. Integration targets only come from the configuration and must be on the allowlist.
Filter values are validated with Zod and quoted in SPL; tests cover injection attempts.

## What went wrong and what I learned

- **Parallel logins against Cribl:** the dashboard queries several Cribl endpoints at once, and at first every
  request logged in again. All requests now share one login promise.
- **`fetch` and undici do not always fit together:** Node's built-in `fetch` does not accept a dispatcher from a
  different undici version. Everything worked locally with mocks; the error only showed up live against Splunk's
  self-signed certificate. The adapter now uses undici's own `fetch`.
- **Cribl hands out secrets:** `GET /system/outputs` returns the HEC token in plain text. The adapter therefore
  only passes on IDs, type, status and numbers, and a test makes sure it stays that way.
- **Fired alerts are short-lived:** Splunk drops them after 24 hours. The portal stores the result rows on the
  first sync, otherwise an older incident would be empty.
- **Docker builds without DNS:** on the VM, `npm ci` failed with `EAI_AGAIN`. The IPv4 DNS handed out by DHCP does
  not answer, the host falls back to IPv6, and the containers cannot. Since then `/etc/docker/daemon.json` pins
  `{ "dns": ["<ROUTER-IP>"] }`.

## Limits

- Shuffle, OpenCTI and Wazuh are not connected; SOAR and threat intel show labelled demo data.
- Prometheus and Grafana are only checked through their health endpoint.
- Host data only comes from auth logs; there is no inventory or agent status.
- Cribl counters run since the worker started and do not match the filter range.
- The portal uses the Splunk admin account. A dedicated read-only account would be cleaner and is on my list.
- Single user, no HTTPS: meant for a home network, not the internet.

## API

`GET /api/health`, `/api/integrations`, `/api/settings`, `/api/dashboard`, `/api/events`, `/api/hosts`,
`/api/topology`, `/api/pipelines`, `/api/incidents`, `/api/incidents/:id`, `/api/detections`,
`/api/detections/:id`, `/api/coverage`, `/api/soar`, `/api/threat-intel`, `GET /api/auth/me`,
`POST /api/auth/login|logout`, `PATCH /api/incidents/:id/status`, `POST /api/incidents/sync`.
The filters `range`, `host`, `severity`, `mitre` and `q` apply to every read endpoint.
