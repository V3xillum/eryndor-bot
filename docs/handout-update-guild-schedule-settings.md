# Handout-update: guild schedule settings

Korte briefing voor een agent die [`docs/handout/index.html`](./handout/index.html) bijwerkt. Feature is **implemented** in de bot; de handout moet DMs informeren.

Zie ook: [`agent.md`](./agent.md) (Scheduler + Slash Commands), [`README.md`](../README.md).

---

## Wat is er nieuw?

DMs kunnen **per Discord-server** het auto-update interval en het actieve postvenster instellen, zonder `.env` of bot-restart.

`.env` blijft de **default** (en timezone). Guild-overrides staan in SQLite (`world_state`).

---

## Commands om in de handout te zetten

Allowlist only (zelfde als andere admin weather-commands).

| Command | Wat het doet |
|---|---|
| `/weather settings show` | Toont effectief interval + postvenster (guild of `.env`) |
| `/weather settings interval <min> <max>` | Guild-fallback interval in **minuten** (als het current type geen `duration*Hours` heeft). Plant meteen opnieuw. |
| `/weather settings window <enabled> [start] [end]` | Actief postvenster aan/uit; optioneel `HH:mm` start/eind (zelfde dag). Timezone blijft `WEATHER_TIMEZONE` uit `.env`. Plant meteen opnieuw. |
| `/weather settings clear scope:schedule\|cooldown\|all` | Wis guild-overrides per scope → terug naar defaults; schedule/all plant opnieuw |

Voorbeelden:

- Testen lokaal: `/weather settings interval min:1 max:5`
- Productie-achtig: `/weather settings interval min:360 max:1080`
- Venster: `/weather settings window enabled:True start:06:00 end:23:00`
- 24/7: `/weather settings window enabled:False`
- Alles resetten: `/weather settings clear scope:all` (of alleen schedule: `scope:schedule`)

---

## Wat moet de handout uitleggen?

1. **Interval vs type-duration** — types met `durationMinHours`/`durationMaxHours` in content winnen van het guild/`.env`-interval. Expliciete DM-duur (`/weather set … duration`, `/weather schedule`) wint altijd.
2. **Postvenster** — alleen **automatische** posts wachten op het venster. Handmatige `/weather roll` en `/weather set` werken ook daarbuiten.
3. **Timezone** — niet via Discord instelbaar; host-config (`WEATHER_TIMEZONE`).
4. **Status** — `/weather status` toont nu ook intervalbron (guild / `.env`) en postvenster; handout-regel over status mag dat noemen.

---

## Waar in de handout (hints)

- Command-lijst / cheat sheet (waar `/weather status`, dials, enz. staan)
- Eventuele “planning / auto-roll”-sectie
- Niet nodig: technische DB-kolomnamen of migratie-details

---

## Out of scope voor de handout

- Implementatiedetails (`world_state` columns, `dueGuilds`)
- Host-only `.env`-keys behalve “defaults komen uit de serverconfig / timezone staat vast”
