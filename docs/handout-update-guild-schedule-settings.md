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
| `/dm weather-settings menu` | Hub: overzicht + dropdown voor interval, venster, afkoeling, limieten, clear |

Voorbeelden (via menu):

- Testen lokaal: Ritme → min 1 / max 5
- Productie-achtig: Ritme → 360–1080
- Venster: Berichtenvenster → aan, 06:00–23:00
- 24/7: Berichtenvenster → uit
- Alles resetten: Terugzetten → Alles

---

## Wat moet de handout uitleggen?

1. **Interval vs type-duration** — types met `durationMinMinutes`/`durationMaxMinutes` in content winnen van het guild/`.env`-interval. Expliciete DM-duur (`/dm weather set … duration`, `/dm weather schedule`) wint altijd.
2. **Postvenster** — alleen **automatische** posts wachten op het venster. Handmatige `/dm weather roll` en `/dm weather set` werken ook daarbuiten.
3. **Timezone** — niet via Discord instelbaar; host-config (`WEATHER_TIMEZONE`).
4. **Status** — `/dm weather status` en het settings-menu tonen intervalbron (guild / `.env`) en postvenster.

---

## Waar in de handout (hints)

- Command-lijst: `/dm weather-settings menu` (geen aparte interval/window/show-subcommands meer)
- Eventuele “planning / auto-roll”-sectie

---

## Out of scope voor de handout

- Implementatiedetails (`world_state` columns, `dueGuilds`)
- Host-only `.env`-keys behalve “defaults komen uit de serverconfig / timezone staat vast”
