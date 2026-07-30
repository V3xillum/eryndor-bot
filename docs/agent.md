# Discord Weather Bot — West Marches

## Project Goal
Build a Discord bot for a West Marches D&D server that makes the world feel alive between sessions. The bot automatically posts atmospheric weather updates to a configured channel (or thread), gives authorized users full manual control during sessions through slash commands, and exposes Eryndor calendar info (`/world today`, `/world fullmoon`) from the static Calendar of Eryndor JSON API.

## Tech Stack
- Node.js
- TypeScript (strict mode)
- discord.js
- better-sqlite3
- dotenv

Avoid introducing unnecessary dependencies. No job queues, no ORMs — the scope doesn't need them.

## Configuration (`.env`)

All secrets and environment-specific settings live in `.env`. Never commit `.env` — ship a `.env.example` with empty/placeholder values.

Required keys:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
# Comma-separated Discord user snowflake IDs allowed to use admin commands
ALLOWED_USER_IDS=
```

Optional:

```env
# Random delay between automatic updates, in minutes (defaults: 360–1080 = 6–18h).
WEATHER_UPDATE_MIN_MINUTES=360
WEATHER_UPDATE_MAX_MINUTES=1080

# Automatic posts only inside this same-day window (defaults below).
# Manual /weather roll and /weather set still work outside the window.
# Set WEATHER_ACTIVE_WINDOW_ENABLED=false for 24/7 auto-updates (useful overnight testing).
WEATHER_ACTIVE_WINDOW_ENABLED=true
WEATHER_ACTIVE_START=06:00
WEATHER_ACTIVE_END=23:00
WEATHER_TIMEZONE=Europe/Amsterdam

# Calendar of Eryndor static JSON (public). Used by /world today and /world fullmoon.
# DOY for “today” uses WEATHER_TIMEZONE (default Europe/Amsterdam).
ERYNDOR_CALENDAR_BASE_URL=https://v3xillum.github.io/eryndor
ERYNDOR_CALENDAR_FALLBACK_URL=https://raw.githubusercontent.com/V3xillum/eryndor/main
```

**Active window behaviour:** the scheduler never auto-posts outside the window. If `next_update_at` falls overnight, it waits until the next `WEATHER_ACTIVE_START`. When scheduling the next update, candidates outside the window are clamped to the next window start. Half-open interval: `[start, end)` in `WEATHER_TIMEZONE`.

`guild` destination is still per server via `/weather setup` (not via `.env`). Changing the update interval requires a bot restart; existing `next_update_at` values in SQLite stay until they elapse or weather is rolled/set/resumed.

`guild_id` is a real Discord concept: a *guild* is a Discord server. Each server has a unique snowflake ID. The bot stores one weather state row per guild so the same bot can later run in multiple servers without a rewrite. Slash commands receive `interaction.guildId` from Discord — operators do not need to know or type it during setup.

## General Principles
- Keep the project simple. Choose the simplest solution that satisfies the current requirement, not the most extensible one.
- Prefer readable code over clever code.
- Separate weather logic from Discord entirely — the weather system must work if you swapped discord.js for something else tomorrow.
- No hardcoded weather tables, message text, or image paths. All of that lives in `content/`.
- Calendar data comes from the public Eryndor static JSON API — do **not** scrape HTML or invent Harptos/moon values.
- Design for extension, but don't pre-build the extensions (see Future Extensions).

## Project Structure
```text
src/
  commands/       # thin slash command handlers (weather.ts, world.ts)
  events/         # discord.js event listeners (ready, interactionCreate, etc.)
  services/       # WeatherService, SchedulerService, EryndorCalendarService
  utils/          # helpers, activeWindow, harptos DOY helpers
  db/             # SQLite connection + queries
  content/        # loaders for JSON content and images
  register-commands.ts
  index.ts

storage/
  world.sqlite

content/
  weather-table.json
  weather-rules.json
  messages.json   # NL bot/UI strings (weather + calendar)
  images/
    clear.png
    cloudy.png
    rain.png
    storm.png
    # one file per weather type — filename matches the `image` field in weather-table.json
```

Feature specs (implementation guides for agents): `docs/feature-*.md` (e.g. `feature-eryndor-calendar.md`).

## Data Storage (SQLite via better-sqlite3)

One row per guild (`guild_id` = Discord server ID). Multi-server support later is then a non-breaking extension rather than a rewrite.

```sql
CREATE TABLE world_state (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,                -- set via /weather setup
  thread_id TEXT,                 -- optional; NULL = post in channel
  current_weather_type TEXT,
  current_weather_rolled_at DATETIME,
  next_update_at DATETIME,
  paused_until DATETIME,          -- NULL = not paused
  season TEXT DEFAULT 'spring',   -- reserved for future use
  updated_at DATETIME,
  severity_min INTEGER,           -- dial band (nullable); additive ALTER
  severity_max INTEGER,
  severity_override_until DATETIME,
  magical_mode TEXT,              -- 'only' | 'none' (nullable); additive ALTER
  magical_override_until DATETIME
);

CREATE TABLE weather_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  weather_type TEXT,
  posted_at DATETIME,
  forced BOOLEAN DEFAULT 0        -- true when set via /weather set, not a roll
);
```

On restart: if `next_update_at` is in the past and the guild isn't paused, post immediately and reschedule. This means state never needs a separate "missed update" recovery path.

Automated posts go to `thread_id` when set, otherwise to `channel_id`. If neither is configured, skip posting for that guild (log a warning) until `/weather setup` has been run.

## Content Format

`content/weather-table.json` — a d100 table as **ranges**. There are not 100 weather types; there are ~5–15 types mapped onto rolls 1–100. Common weather gets wide ranges; rare magical effects get narrow ones.

Each entry has a numeric **`severity`** (1 = mild … 5 = catastrophic), a boolean **`magical`**, and points to **exactly one** image under `content/images/`. Optional **`durationMinHours` / `durationMaxHours`** override the global `.env` interval while that type is current. Flavor text lives **in the image** — not in JSON.

```json
[
  {
    "min": 1,
    "max": 20,
    "type": "clear",
    "image": "clear.png",
    "severity": 1,
    "magical": false
  },
  {
    "min": 87,
    "max": 94,
    "type": "storm",
    "image": "storm.png",
    "severity": 4,
    "magical": false,
    "durationMinHours": 2,
    "durationMaxHours": 6
  },
  {
    "min": 95,
    "max": 100,
    "type": "arcane_storm",
    "image": "arcane_storm.png",
    "severity": 5,
    "magical": true,
    "durationMinHours": 1,
    "durationMaxHours": 3
  }
]
```

`content/weather-rules.json` — severity cooldown thresholds (data-driven, no type-name special cases):

```json
{
  "cooldownAfterSeverity": 4,
  "cooldownMaxNextSeverity": 2
}
```

After current weather with `severity >= cooldownAfterSeverity`, the next scheduler/`/weather roll` filters to `severity <= cooldownMaxNextSeverity`. If that pool is empty (e.g. an all-evil table), the ceiling rises (3, 4, …) until at least one entry matches. `/weather set` bypasses the filter. See [`feature-weather-severity-duration.md`](./feature-weather-severity-duration.md).

**Roll pool order:** severity dial → magical dial → severity cooldown (within that intersection) → one weighted pick. Setting either dial rejects empty pools and empty **intersections** with the other active dial (no silent fallback). See [`feature-weather-magical-dial.md`](./feature-weather-magical-dial.md).

A DM (or content editor) should be able to add a new weather type or new artwork by editing this file and placing a single image at `content/images/<filename>` — never by touching source code.

Ship a sensible starter table with placeholder images; real art can be swapped later.

## Weather Service (Discord-agnostic)

Expose a small service interface that commands and the scheduler both call into:

- `getCurrentWeather(guildId)`
- `getAdminStatus(guildId)` — severity, magical flag, schedule, cooldown, severity/magical dials, duration source (for `/weather status`)
- `setSeverityDial` / `clearSeverityDial` — temporary min/max band for rolls
- `setMagicalDial` / `clearMagicalDial` — temporary `only` / `none` magical filter for rolls
- `rollWeather(guildId)` — weighted pick (severity dial + magical dial + severity cooldown when applicable), updates state, returns the result
- `setWeather(guildId, type)` / `setFromInput` — forces a type or physical d100; marks `forced` for type sets; **bypasses** dials/cooldown
- `scheduleNextUpdate(guildId)` — per-type duration range if present, else `WEATHER_UPDATE_*_MINUTES`; stores `next_update_at`
- `pause(guildId, until)`
- `resume(guildId)` — clears the pause and recalculates `next_update_at`
- `setup(guildId, channelId, threadId | null)` — stores where to post

Discord commands should only parse input, call the service, and format the reply — no scheduling or weather logic inside a command handler.

## Eryndor Calendar Service

`EryndorCalendarService` fetches public static JSON (no secrets). The calendar site is GitHub Pages; there is no live “today” API — the bot computes Harptos day-of-year (DOY) in `WEATHER_TIMEZONE`, capped at **365** (no leap day), then fetches:

- `/world today` → `{BASE}/data/days/{doy}.json` (3-digit zero-padded DOY)
- `/world fullmoon` → `{BASE}/data/full-moons.json` → `nextByFromDoy[String(doy)]` (exact Full Moon only)

Fetch order: Pages base URL first; on persistent 404, optional raw.githubusercontent.com fallback. Do not scrape HTML.

Replies are Dutch Discord embeds (`content/messages.json` for labels/errors). Today embed: Harptos title, moon phase, NL-formatted Gregorian date under the moon, events list — **no** next-full-moon footer on today (full moon is only via `/world fullmoon`).

UI calendar: [Calendar of Eryndor](https://v3xillum.github.io/eryndor/). Spec detail: [`docs/feature-eryndor-calendar.md`](./feature-eryndor-calendar.md).

## Permissions

- `/weather current` — available to everyone in the guild.
- All other `/weather` subcommands (including `status`, `next`) — only users whose Discord user ID appears in `ALLOWED_USER_IDS`.
- `/world today` and `/world fullmoon` — available to everyone in the guild (world info; no weather-timer spoilers).

Do **not** require Discord “Manage Server” or a DM role. The operator may not have those permissions; user-ID allowlist is the intended gate. Later this can be extended with role IDs; do not build role support now unless trivial.

Unauthorized users get a short ephemeral denial.

## Slash Commands

There is **no** `/weather post`. Anything that changes weather also broadcasts to the configured channel/thread. A separate “post current again” command is redundant with `current` and with the channel history.

### Weather
- `/weather setup <channel> [thread]` — configure where weather updates are sent (scheduler, `roll`, and `set`). `thread` is optional. Uses the current guild’s `guildId` from the interaction.
- `/weather current` — show the current weather **to the invoking user** (ephemeral or command reply). Does **not** post to the weather channel — if the bot is working, the latest update is already visible there; this is a quiet status check (e.g. DM mid-session without spamming the channel).
- `/weather status` — allowlist-only admin view: type, severity, magical flag, forced flag, since-when, remaining/next update, duration source (per-type vs env), severity dial, magical dial, and whether severity cooldown applies to the next roll. Ephemeral; does not post to the channel.
- `/weather severity set <min> <max> <duration>` — temporary severity band for auto-roll / `/weather roll` (e.g. min 1, max 4, `1d`). Lazy-expires; then default table + cooldown. Rejects empty bands and empty intersection with an active magical dial. Allowlist only. Does not change current weather or post.
- `/weather severity clear` — clear the dial early. Allowlist only.
- `/weather magical set <only|none> <duration>` — temporary magical filter for auto-roll / `/weather roll` (`only` = magical types only; `none` = non-magical only). Lazy-expires. Rejects empty pools and empty intersection with an active severity dial. Allowlist only. Does not change current weather or post.
- `/weather magical clear` — clear the magical dial early. Allowlist only.
- `/weather next` — show when the next **automatic** update is scheduled (ephemeral). Also reports pause state and when an update is due but waiting for the active posting window. **Allowlist only** (players should not see when weather will change). Does not post to the weather channel.
- `/weather roll` — roll against the table (with severity dial + magical dial + cooldown when applicable), set that as current weather, **and** post the update to the configured channel/thread. Also reply to the invoker with the result (roll value + type).
- `/weather set <value> [duration]` — set weather by **type** (`storm`) or **physical d100** (`81`), then post. Type → `forced = true`; numeric 1–100 → table lookup, `forced = false` (external die). Optional `duration` as before. Bypasses dials and cooldown.
- `/weather schedule <duration>` — keep the **current** weather; only change when the next automatic roll happens. Same duration format. Clears pause. Allowlist only. Does not post to the channel.
- `/weather pause <duration>` — pause automatic updates. Duration format: `30m`, `2h`, or `1d` (minutes / hours / days). Reject invalid input with a clear ephemeral error.
- `/weather resume` — resume automatic updates.

### World / calendar
- `/world today` — current Harptos day, moon phase, events (embed). Everyone.
- `/world fullmoon` — next exact Full Moon from `full-moons.json` (embed). Everyone.

Slash commands are registered globally via `npm run register-commands` (`Routes.applicationCommands`). Global commands can take up to ~1 hour to appear in Discord clients; guild-scoped registration is faster for single-server testing if needed later.

## Post format
When posting weather (scheduler, `/weather roll`, or `/weather set`):
- **Image-only** — attach the single image for that weather type
- All flavor, stats, and atmosphere are in the image (like DM weather cards)
- No Discord embed body / description pools / flavor text from JSON
- Optionally include the weather `type` as a short title; nothing more
- Bot/UI strings that are not weather flavor (errors, confirmations, calendar copy) live in `messages.json`

## Scheduler
Responsible for:
- checking, on an interval (**30 seconds** — close enough for weather without a precise timer), whether `next_update_at` has passed and the guild isn't paused
- rolling new weather and posting it to the configured channel/thread when it's time
- recalculating and storing the next `next_update_at` from the current type’s duration range when set, otherwise the configured minute range from `.env`

Keep this logic entirely out of command handlers — commands trigger immediate one-off actions (`/weather roll`, `/weather set`); the scheduler owns the recurring automatic updates.

**Choice:** global min/max and the active posting window live in `.env`, not in SQLite / a slash command. That keeps v1 simple and makes short test intervals easy. A per-guild config command can come later if DMs need to change the cadence without host access.

## Deploy & GitHub

- GitHub holds the **code and content**, not secrets. Use `.gitignore` for `.env` and `storage/*.sqlite` (or document how local DB files are treated).
- The bot is a **long-running Node process**. GitHub Actions alone is not a host — Actions jobs are short-lived.
- Target workflow: develop and test on a personal machine or private VPS (`git pull` + `node` / PM2 / Docker), with `.env` filled locally. Later the same repo can deploy to a PaaS that connects to GitHub (e.g. Railway, Render, Fly.io) using environment variables there.
- One Discord application/bot token can be invited to multiple guilds; each guild runs `/weather setup` independently. No second codebase needed for a second server.

## Code Style
- TypeScript strict mode.
- Small functions, composition over large classes.
- async/await consistently, no mixed callback styles.
- Descriptive names over comments where possible.

## Future Extensions
Architecture should allow these without major refactoring, but **none should be built now**. Documented here so v1 does not paint us into a corner (especially: pure d100 luck must not leave the world stuck on dangerous weather forever).

### Already listed
- Multiple regions
- Seasons
- Random world events
- Encounter tables
- Forecast system (preview upcoming weather)
- Role-based allowlists (in addition to user IDs)
- Multiple Discord servers (the `guild_id` keying already supports this)
- Structured `descriptions` (or similar) in `weather-table.json` — only if text outside the card image becomes useful later; v1 keeps posts image-only
- Daily automatic channel post of calendar “today” (via existing scheduler) — optional; `/world` commands already cover on-demand use
- Guild-scoped slash command registration for faster iteration on a single server

### Weather duration (per type) — implemented
Each weather type may define `durationMinHours` / `durationMaxHours`. When present, that range schedules the next auto-update after the type becomes current; otherwise the global `.env` interval applies. Explicit DM duration (`/weather set … duration`, `/weather schedule`) always wins. Optional later: per-guild override via slash command + DB.

### Severity & transition rules — implemented
Each entry has numeric **severity**. After weather at or above `cooldownAfterSeverity`, the next auto-roll / `/weather roll` must resolve to `severity <= cooldownMaxNextSeverity` (filter + one weighted pick; empty pools escalate the ceiling). Thresholds live in `content/weather-rules.json`. `/weather set` bypasses the filter.

### DM severity dial — implemented
`/weather severity set <min> <max> <duration>` stores a temporary inclusive band on `world_state` (`severity_min` / `severity_max` / `severity_override_until`). Auto-roll and `/weather roll` filter to that band first, then apply magical dial (if any) and cooldown within the intersection. Lazy expiry (checked at roll time). `/weather severity clear` removes it early. Visible on `/weather status`. `/weather set` still bypasses filters. Setting rejects empty bands and empty intersection with an active magical dial.

### DM magical dial — implemented
Each weather entry has boolean **`magical`**. `/weather magical set <only|none> <duration>` stores a temporary filter on `world_state` (`magical_mode` / `magical_override_until`). Roll order: severity dial → magical dial → cooldown → weighted pick. Lazy expiry. `/weather magical clear` removes it early. Visible on `/weather status`. `/weather set` bypasses. Setting rejects empty magical pools and empty intersection with an active severity dial (no silent fallback / escalate on magical).

## Non-Goals
Do not introduce:
- Firebase, MongoDB, Redis
- Microservices or worker processes
- Complex abstractions or premature generalization
- Running the bot solely via GitHub Actions
- Scraping the Eryndor calendar HTML / inventing Harptos or moon data client-side

If a simpler solution satisfies today's requirement, use it over one that anticipates tomorrow's.
