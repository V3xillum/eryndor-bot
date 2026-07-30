# Feature: Calendar events channel

Automatische ochtendpost van kalender-events naar een **apart** kanaal (niet het weerkanaal). Alleen op dagen met events.

**Status:** implemented.

**Doel:** Spelers zien birthdays / festivals / memorials zonder dat de DM elke ochtend `/world today` hoeft te draaien — en zonder dagelijkse spam op lege dagen.

Zie ook: [`agent.md`](./agent.md), [`feature-eryndor-calendar.md`](./feature-eryndor-calendar.md), Discord [slash commands](https://discord.com/developers/docs/interactions/application-commands).

---

## Gedrag

| Command | Effect |
|---|---|
| `/world setup channel` | Zet `calendar_channel_id` |
| `/world clear` | Zet `calendar_channel_id` op null |
| `/world today` / `fullmoon` | Ongewijzigd (iedereen) |

- Allowlist only voor setup/clear (`ALLOWED_USER_IDS`), guild-only.
- Posttijd: `CALENDAR_EVENTS_POST_TIME` (default `08:30`) in `WEATHER_TIMEZONE`.
- Na die tijd, 1× per lokale dag: fetch today-JSON.
  - `events.length === 0` → **geen** bericht (ook geen “Geen events vandaag”).
  - anders → `@everyone` + zelfde embed als `/world today`.
- Los van weather destination, pause en active window.
- Scheduler pollt elke **30s**. Missed ochtend na restart → catch-up bij eerstvolgende tick na posttijd.
- Transient Discord-/fetch-fouten: opnieuw proberen. Permanente kanaalfouten (geen View/Send, Unknown Channel): afvinken voor die dag + warn-log.

---

## DB (additive)

```sql
ALTER TABLE world_state ADD COLUMN calendar_channel_id TEXT;
ALTER TABLE world_state ADD COLUMN calendar_events_last_handled_date TEXT; -- YYYY-MM-DD local
```

Geen Database:Refresh. Bestaande rijen krijgen `NULL` (= uitgeschakeld tot `/world setup`).

---

## Env

```env
CALENDAR_EVENTS_POST_TIME=08:30
```

Timezone blijft `WEATHER_TIMEZONE`. Restart nodig om de tijd te wijzigen.

---

## Code

| Stuk | Rol |
|---|---|
| `src/commands/world.ts` | `setup` / `clear` + bestaande today/fullmoon |
| `src/services/SchedulerService.ts` | `tickCalendarEvents` |
| `src/services/WeatherService.ts` | calendar channel CRUD helpers |
| `src/db/index.ts` | additive columns + updates |
| `content/messages.json` | NL strings |

---

## Testplan

1. `npm run register-commands` (global: tot ~1u delay).
2. `/world setup` → kies een ander kanaal dan weer.
3. Optioneel: tijdelijk `CALENDAR_EVENTS_POST_TIME` op een tijd net in het verleden zetten, bot herstarten, en een dag met events in de calendar API checken → embed verschijnt ≤ ~30s.
4. Op een dag zonder events: geen post; `calendar_events_last_handled_date` wel gezet.
5. `/world clear` → geen verdere posts.
6. `/world today` blijft handmatig werken (ook “Geen events vandaag”).
