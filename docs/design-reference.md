# Designvorlage

[English version](design-reference.en.md)

Verbindliche Vorlage: Referenzbild „Incidents Management / Analytics Dashboard“ (vom Nutzer geliefert, 15.10.2026).

## Übernommene Merkmale

| Bereich | Vorlage | Umsetzung im Portal |
|---|---|---|
| Hintergrund | dunkler Petrol-Verlauf, Panels fast schwarz mit feinem Rand | Tokens `--color-bg`, `--color-panel`, `--color-border` in `web/src/styles/tokens.css` |
| Navigation | schmale Icon-Sidebar mit Logo oben, Einstellungen unten | `Shell.tsx`, Tooltips je Icon; ausklappbar mit Beschriftung, Zustand bleibt gespeichert |
| Kopfzeile | Filter-Pills (Team, Region, Zeitraum, MITRE), Suche rechts | globale Filterleiste: Zeitraum, Host, Severity, MITRE, Suche |
| Titelzeile | großer Seitentitel, Untertitel, Refresh-/Export-Buttons | `PageHeader` mit „Daten aktualisieren“ |
| Linke Spalte | Incident Health Score als Halbkreis-Gauge + Kennzahlliste | Gauge aus echten offenen Incidents; Formel im Tooltip |
| Mitte | Netzwerktopologie mit leuchtenden Knoten, Legende Angriffspfad/Normal | React Flow, Knoten aus Live-Status, Angriffspfade aus Splunk-Quell-IPs |
| KPI-Leiste | vier verbundene Kennzahlen unter der Topologie | Offen, Kritisch/Hoch, Gelöst, Mittlere Lösungszeit |
| Rechte Spalte | Incident-Timeline mit Status-Chips | Änderungsverlauf des neuesten Incidents |
| Trend | Flächendiagramm New/Received/Escalated | Event Analytics (Splunk) und Incident-Volumen |
| Tabelle | „Global Threat Radar“ mit Severity-Chips | neueste Incidents |
| Unten links | AI Investigation / Threat Attribution | ersetzt durch MITRE Detection Coverage (keine KI-Funktion vorhanden) |

## Bewusst nicht übernommen

- „AI Summary“: keine KI-Komponente im Homelab, wird nicht vorgetäuscht.
- „SLA Compliance“: keine SLA definiert, daher kein Wert.
- Avatare/Bearbeiter: Single-User-System.
