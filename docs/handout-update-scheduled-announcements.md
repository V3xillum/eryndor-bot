# Handout-update: scheduled announcements

Korte briefing voor een agent die [`docs/handout/index.html`](./handout/index.html) bijwerkt. Feature is **implemented** in de bot.

**Handout-status:** verwerkt in `docs/handout/index.html` (Overzicht, Commando’s, Sessie) + categorie in [`handout-agent.md`](./handout-agent.md).

Zie ook: [`agent.md`](./agent.md), [`feature-scheduled-announcements.md`](./feature-scheduled-announcements.md).

---

## Commands om toe te voegen

Allowlist only (aangewezen DM’s).

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/announce schedule` | Kies kanaal + wanneer; vul tekst in een venster. Bot post later. Los van weerkanaal. | Berichten | DM |
| `/announce list` | Toont openstaande geplande berichten (id, kanaal, tijd). | Berichten | DM |
| `/announce cancel` | Annuleer een openstaand bericht op id. | Berichten | DM |

`when`: `30m` / `2h` / `1d`, of `YYYY-MM-DD HH:mm` (Nederlandse tijd / server-tijdzone). Geen `.env`-keys in de handout.

---

## Wat Overzicht kort mag zeggen

- Lead of tile: geplande **tekstberichten** naar een **ander kanaal** dan het weer.
- Max één command: `` `/announce schedule` ``.
- Geen how-to (modal, list/cancel, tijdsformaten) op Overzicht.

---

## Wat Commando’s / Sessie moeten krijgen

- Nieuwe categorie **Berichten** (filter + `CATEGORIES`).
- Drie `/announce`-commands met what/when.
- Sessie-tile: bericht voor later klaarzetten.

---

## Niet in de handout

- DB (`scheduled_posts`), migraties, scheduler-interval
- `WEATHER_TIMEZONE` / andere env-keys
- Implementatie-details (retry bij Discord-fouten)
