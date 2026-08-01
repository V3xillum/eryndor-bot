# Feature: Calendar events channel

Automatische posts naar een **apart** kanaal (niet het weerkanaal):
- **Ochtend:** today-embed alleen op dagen mét calendar events (`@everyone`)
- **Avond:** Full Moon (Rising) stil, exacte Full Moon met `@everyone`

**Status:** implemented.

**Doel:** Spelers zien birthdays / festivals / memorials en (voor lycantropie e.d.) de Rising-/volle-maan-avonden zonder dat de DM elke keer handmatig hoeft te posten — zonder dagelijkse spam op gewone dagen.

Zie ook: [`agent.md`](./agent.md), [`feature-eryndor-calendar.md`](./feature-eryndor-calendar.md), Discord [slash commands](https://discord.com/developers/docs/interactions/application-commands), [Message Flags](https://discord.com/developers/docs/resources/message#message-object-message-flags) (`SUPPRESS_NOTIFICATIONS`).

---

## Gedrag

| Command | Effect |
|---|---|
| `/world setup channel` | Zet `calendar_channel_id` |
| `/world clear` | Zet `calendar_channel_id` op null |
| `/world today` / `fullmoon` | Ongewijzigd (iedereen) |

### Ochtend (events)

- Posttijd: `CALENDAR_EVENTS_POST_TIME` (default `08:30`) in `WEATHER_TIMEZONE`.
- `events.length === 0` → **geen** bericht.
- anders → `@everyone` + zelfde embed als `/world today`.

### Avond (volle maan)

- Posttijd: `CALENDAR_FULLMOON_POST_TIME` (default `20:00`).
- `moon.phase === "Full Moon (Rising)"` → moon-night embed, **geen** `@everyone`, `MessageFlags.SuppressNotifications`.
- `moon.isExactFullMoon` → moon-night embed + `@everyone`.
- anders → stil die avond.
- Geen roulerende sfeerteksten — de kalenderfase is de boodschap.

Allowlist only voor setup/clear. Los van weather destination, pause en active window. Scheduler pollt elke **30s**; missed slot na restart → catch-up.

---

## DB (additive)

```sql
ALTER TABLE world_state ADD COLUMN calendar_channel_id TEXT;
ALTER TABLE world_state ADD COLUMN calendar_events_last_handled_date TEXT; -- YYYY-MM-DD local
ALTER TABLE world_state ADD COLUMN calendar_fullmoon_last_handled_date TEXT; -- YYYY-MM-DD local
```

Geen Database:Refresh.

---

## Env

```env
CALENDAR_EVENTS_POST_TIME=08:30
CALENDAR_FULLMOON_POST_TIME=20:00
```

Timezone blijft `WEATHER_TIMEZONE`. Restart nodig om tijden te wijzigen.

---

## Code

| Stuk | Rol |
|---|---|
| `src/commands/world.ts` | `setup` / `clear` + today/fullmoon |
| `src/services/SchedulerService.ts` | `tickCalendarEvents`, `tickCalendarFullMoon` |
| `src/services/EryndorCalendarService.ts` | `buildTodayEmbed`, `buildMoonNightEmbed` |
| `src/services/WeatherService.ts` | calendar channel + last-handled helpers |
| `src/db/index.ts` | additive columns + updates |
| `content/messages.json` | NL strings |

---

## Testplan

1. Bot herstarten (geen nieuwe slash nodig als setup al bestaat).
2. Ochtend: dag mét events → embed + `@everyone`; lege dag → stil.
3. Avond Rising: tijdelijk `CALENDAR_FULLMOON_POST_TIME` in het verleden + mock/check op een Rising-dag → stil post (geen ping).
4. Avond exact Full Moon → post + `@everyone`.
5. `/world clear` → geen posts meer.
