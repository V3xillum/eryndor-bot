# Handout-update: DM-handout rework (compact)

**Status:** verwerkt (Intro + Commando’s; Discord-first).

**Doel:** DM-handout rustig en kort — Discord-first, hubs, geen catalogus-grid.

**Bot-waarheid:** [`agent.md`](./agent.md) + feature-docs.  
**Stijl / toon:** [`handout-agent.md`](./handout-agent.md).  
**Speler-handout:** niet herschrijven tenzij footer/links.

---

## Locked beslissingen (actueel)

| Gat | Keuze |
|---|---|
| Tabs | **2**: Intro + Commando’s (geen Setup-tab) |
| Framing | Discord-first; live tafel alleen bij pause |
| Startchecklist | Kort op Intro (`/dm setup menu` + economy starten) |
| `/dm setup menu` | Alleen Intro — niet in COMMANDS |
| Economy-hubs | Wel in Commando’s (doorlopend) |
| Spelercommands | Default-filter `dm` |
| Nieuw weertype | `<details>`, geen JSON |
| Severity | `.severity-scale` op Intro |
| Help-copy | `helpEmbedDescription` zonder weertypes-catalogus |
| Dode JS | Geen `WEATHER_TYPES` / `typeGrid` |

---

## Tabs

| Tab | Rol |
|---|---|
| **Intro** | Wat doet de bot op Discord? Wie? Startchecklist. Zwaarte. GC. Live-tafel aside. |
| **Commando’s** | Zoekbare naslag; hubs; default DM. |

---

## Acceptatiechecklist

- [x] Exact 2 tabs  
- [x] Discord-first toon  
- [x] Setup-tab weg; checklist op Intro  
- [x] `/dm setup menu` niet in COMMANDS  
- [x] Economy-hubs in COMMANDS  
- [x] Default `cmdWho === "dm"`  
- [x] Severity-schaal op Intro  
- [x] Geen typeGrid / WEATHER_TYPES  
- [x] `handout-agent.md` gesynct  
