# Handout-update: calendar events channel

Korte briefing voor een agent die [`docs/handout/index.html`](./handout/index.html) bijwerkt. Feature is **implemented** in de bot.

**Handout-status:** verwerkt in `docs/handout/index.html` (Overzicht, Commando’s, Sessie) + categorie in [`handout-agent.md`](./handout-agent.md).

Zie ook: [`agent.md`](./agent.md), [`feature-calendar-events-channel.md`](./feature-calendar-events-channel.md).

---

## Commands om toe te voegen

Allowlist only (aangewezen DM’s).

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/dm calendar setup` | Kies in welk kanaal ochtend-kalenderposts komen (alleen op dagen mét events). Los van weerkanaal. | Inrichten | DM |
| `/dm calendar clear` | Zet die automatische ochtendposts uit. | Inrichten | DM |

Posttijd in de handout: **rond 08:30** (Nederlandse tijd). Geen `.env`-keys.

---

## Wat Overzicht kort mag zeggen

- Kalender-tile: handmatig `/eryndor today` / `fullmoon` **én** optioneel ochtendpost bij events.
- Max één setup-command: `` `/dm calendar setup` ``.
- Geen how-to (clear, exacte tijd-config) op Overzicht.

---

## Wat Commando’s / Sessie moeten krijgen

- `/dm calendar setup` + `/dm calendar clear` onder **Inrichten**.
- Optionele sessie-tile of note: events-kanaal inrichten (eenmalig).

---

## Niet in de handout

- DB-kolommen, migraties, scheduler-interval
- `CALENDAR_EVENTS_POST_TIME` / andere env-keys
- Implementatie-details (retry, last_handled_date)
