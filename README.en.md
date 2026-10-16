# Homelab SOC Portal

[Deutsche Version](README.md)

A web portal for my homelab SOC. It shows incidents, detections, hosts, network and the data pipeline in one
place and reads its data live from Splunk and Cribl Stream. Incidents come from the Splunk alerts of my Sigma
rules; their status and history live in SQLite.

The portal runs on `siem-docker` (VM 210) at `http://<VM-IP>:8090` and is only reachable on the LAN. Systems
that are not connected yet (Shuffle, OpenCTI) are labelled "Simuliert" (simulated) in the UI. A missing metric
shows "nicht verfügbar" (not available) instead of a made-up value. The UI itself is in German.

## What it does

- Dashboard with a security index, network topology (React Flow), KPIs, incident queue and timeline, event
  analytics, MITRE coverage, system status and pipeline.
- A global filter bar (time range, host, severity, MITRE technique, search) that lives in the URL and is
  applied server-side to every panel.
- Incidents with search, sorting and a detail view including the Splunk result rows. Status goes from new to
  investigating, resolved and closed, with a note and history. Changing status requires a login.
- Detections imported from the Sigma Detection Lab, local Splunk searches and simulated rules, each with logic,
  fields, MITRE mapping, generated SPL and test status.
- Hosts from the auth logs, Cribl inputs, routes and outputs with counters, a printable report and a settings
  page that only shows URLs and switches.

The security index is a simple heuristic: 100 minus 25 per critical, 10 per high, 4 per medium and 1 per low
open incident, minus 15 per failed core integration (Splunk, Cribl). The formula is shown in the tooltip.

## Data sources

Incidents come from Splunk's fired alerts and are synced into SQLite every 120 seconds. Splunk drops fired
alerts after 24 hours, so the portal stores the result rows on the first sync. Events, hosts, source IPs and the
topology come from `index=homelab_auth` (export search, 30 s cache). For Cribl the portal uses the REST API
(health, inputs, outputs, routes, pipelines). The Sigma rules and their test status are imported from the
`homelab-siem` repository with a script.

Severity and MITRE filters apply to Splunk events through the `event_type`s of the matching Sigma rules. With
`T1110`, for example, only `authentication` events remain.

## Layout

```
Browser --HTTP 8090 (LAN)--> portal (Fastify + React build, SQLite in volume /data)
                               |  Docker network homelab-siem_default
                               +--> splunk:8089  Splunk REST
                               +--> cribl:9000   Cribl API
lab-linux-01 --syslog UDP 9514--> Cribl --HEC--> Splunk --Sigma alerts (5 min)--> fired alerts
```

The backend in `server/` is Node 24 with TypeScript, Fastify 5, Zod and `node:sqlite`. Adapters for Splunk and
Cribl wrap HTTP, timeouts and errors; services, an incident repository and the routes sit on top. The frontend
in `web/` uses React 19, Vite, Tailwind 4, shadcn/ui, Recharts, React Flow and TanStack Query. Design tokens
live in `web/src/styles/tokens.css`, the reference in [docs/design-reference.en.md](docs/design-reference.en.md).

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

The E2E test starts the API itself with a fresh SQLite file, demo incidents and a throwaway password.
As of 2026-10-15: typecheck clean, 30 server and 10 web tests green, E2E green, Docker image `healthy`.

Two bugs only showed up through the tests. Parallel Cribl requests each logged in again; they now share one
login. And Node's built-in `fetch` does not accept a dispatcher from a different undici version, which only
appeared live against Splunk's self-signed certificate. The adapter now uses undici's own `fetch`.

## Deployment

The portal is rolled out from the
[homelab-infrastructure-automation](https://github.com/QuitScope/homelab-infrastructure-automation) repository:
the Ansible role `soc_portal` checks this repository out to `/opt/homelab-soc-portal` on `siem-docker`, fetches
the `.env` from HashiCorp Vault and starts the compose project. Splunk REST (8089) and HEC (8088) stay
unpublished; the portal joins the Docker network `homelab-siem_default`. The SQLite database lives in the volume
`homelab-soc-portal_portal-data` and survives new images.

To deploy without Ansible, copy the repository to the VM, create a `.env` from `.env.example` there and run
`docker compose up -d --build`.

Containers on the VM need a reachable DNS server for `npm ci`. The IPv4 DNS handed out by DHCP on the home
network does not answer, so `/etc/docker/daemon.json` pins `{ "dns": ["<ROUTER-IP>"] }`.

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

Splunk and Cribl need no changes; the portal only reads. Cribl's `GET /system/outputs` returns the HEC token in
plain text, so the adapter only passes on IDs, type, status and numbers, and a test checks that. New Sigma rules
are pulled into `server/data/sigma-import.json` with `npm run import:sigma -- <path to sigma-detection-lab>`.

## Security

Write endpoints require a signed session cookie (`HttpOnly`, `SameSite=Strict`, 8 hours). The login checks a
scrypt hash in constant time; after five failed attempts the IP is locked for five minutes. Reading works on the
LAN without a login. The port is bound to the LAN IP only and not forwarded on the router.

Credentials are managed in the `.env` on the server, which comes from HashiCorp Vault at deployment; the
frontend never sees them. Integration targets only come from the configuration and must be on the
allowlist. Filter values are validated with Zod and quoted in SPL; tests cover injection attempts.

## Limits

- Shuffle, OpenCTI and Wazuh are not connected; SOAR and threat intel show labelled demo data.
- Prometheus and Grafana are only checked through their health endpoint.
- Host data only comes from auth logs; there is no inventory or agent status.
- Cribl counters run since the worker started and do not match the filter range.
- The portal uses the Splunk admin account. A dedicated read-only account would be cleaner.
- Single user, no HTTPS: meant for a home network, not the internet.

## API

`GET /api/health`, `/api/integrations`, `/api/settings`, `/api/dashboard`, `/api/events`, `/api/hosts`,
`/api/topology`, `/api/pipelines`, `/api/incidents`, `/api/incidents/:id`, `/api/detections`,
`/api/detections/:id`, `/api/coverage`, `/api/soar`, `/api/threat-intel`, `GET /api/auth/me`,
`POST /api/auth/login|logout`, `PATCH /api/incidents/:id/status`, `POST /api/incidents/sync`.
The filters `range`, `host`, `severity`, `mitre` and `q` apply to every read endpoint.
