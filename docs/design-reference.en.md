# Design reference

[Deutsche Version](design-reference.md)

Binding template: reference image "Incidents Management / Analytics Dashboard" (supplied by the user, 2026-10-15).

## Adopted

| Area | Reference | Portal |
|---|---|---|
| Background | dark petrol gradient, near-black panels with thin border | tokens `--color-bg`, `--color-panel`, `--color-border` in `web/src/styles/tokens.css` |
| Navigation | narrow icon sidebar, logo on top, settings at the bottom | `Shell.tsx`, tooltip per icon; expandable with labels, state remembered |
| Header | filter pills (team, region, time range, MITRE), search on the right | global filter bar: time range, host, severity, MITRE, search |
| Title row | large page title, subtitle, refresh/export buttons | `PageHeader` with "Daten aktualisieren" |
| Left column | incident health score half gauge + metric list | gauge from real open incidents; formula in tooltip |
| Center | network topology with glowing nodes, legend attack path/normal | React Flow, nodes from live status, attack paths from Splunk source IPs |
| KPI strip | four connected figures below the topology | open, critical/high, resolved, mean time to resolve |
| Right column | incident timeline with status chips | change history of the latest incident |
| Trend | area chart new/received/escalated | event analytics (Splunk) and incident activity |
| Table | "Global Threat Radar" with severity chips | incident queue |
| Bottom left | AI investigation / threat attribution | replaced by MITRE detection coverage (no AI component exists) |

## Deliberately not adopted

- "AI Summary": there is no AI component in the homelab; it is not faked.
- "SLA Compliance": no SLA defined, therefore no value.
- Avatars/assignees: single-user system.
