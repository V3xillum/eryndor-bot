# Eryndor bot

## Project Goal
Build **Eryndor bot** — a Discord bot for the Eryndor (West Marches) D&D server that makes the world feel alive between sessions. The bot automatically posts atmospheric weather updates to a configured channel (or thread), gives authorized users full manual control during sessions through slash commands, exposes Eryndor calendar info (`/eryndor today`, `/eryndor fullmoon`) from the static Calendar of Eryndor JSON API, and can post that same “today” embed each morning to a separate channel **only on days with calendar events** (`/dm calendar setup`).

**DM handout:** static site under [`docs/handout/`](./handout/). Style and update rules for agents: [`handout-agent.md`](./handout-agent.md). Bot behaviour remains defined in **this** file.

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
# Default random delay between automatic updates, in minutes (defaults: 360–1080 = 6–18h).
# Per-guild override via `/dm weather-settings interval` (stored in SQLite; no restart).
WEATHER_UPDATE_MIN_MINUTES=360
WEATHER_UPDATE_MAX_MINUTES=1080

# Default automatic posts only inside this same-day window (defaults below).
# Manual /dm weather roll and `/dm weather set` still work outside the window.
# Set WEATHER_ACTIVE_WINDOW_ENABLED=false for 24/7 auto-updates (useful overnight testing).
# Per-guild override via `/dm weather-settings window` (timezone always from WEATHER_TIMEZONE).
WEATHER_ACTIVE_WINDOW_ENABLED=true
WEATHER_ACTIVE_START=06:00
WEATHER_ACTIVE_END=23:00
WEATHER_TIMEZONE=Europe/Amsterdam

# Calendar of Eryndor static JSON (public). Used by /eryndor today and /eryndor fullmoon.
# DOY for “today” uses WEATHER_TIMEZONE (default Europe/Amsterdam).
ERYNDOR_CALENDAR_BASE_URL=https://v3xillum.github.io/eryndor
ERYNDOR_CALENDAR_FALLBACK_URL=https://raw.githubusercontent.com/V3xillum/eryndor/main
# Morning auto-post of /eryndor today embed — only when events exist (local WEATHER_TIMEZONE).
CALENDAR_EVENTS_POST_TIME=08:30
# Evening Full Moon (Rising) + exact Full Moon posts to the same /dm calendar setup channel.
CALENDAR_FULLMOON_POST_TIME=20:00

# Daily guild production summary on the resource channel (silent). Local WEATHER_TIMEZONE.
PRODUCTION_POST_TIME=17:00

# DM handout (GitHub Pages). Linked from /eryndor help.
HANDOUT_URL=https://v3xillum.github.io/eryndor-bot/handout/

# Optional status-report DMs (comma-separated user IDs; empty = off).
# Snapshot: weather active/paused only (no next-update spoilers), usage counts, last issues.
STATUS_REPORT_USER_ID=
STATUS_REPORT_TIME=10:00
STATUS_REPORT_CADENCE=daily
```

**Active window behaviour:** the scheduler never auto-posts outside the **effective** window for that guild (guild override, else `.env`). If `next_update_at` falls overnight, it waits until the next window start. When scheduling the next update, candidates outside the window are clamped to the next window start. Half-open interval: `[start, end)` in `WEATHER_TIMEZONE`.

`guild` destination is per server via `/dm weather setup`. Interval and active window **defaults** live in `.env` (restart required to change defaults). Per-guild overrides via `/dm weather-settings` live in SQLite and take effect immediately (next update is rescheduled). Changing only `.env` does not rewrite existing `next_update_at` until weather is rolled/set/resumed/settings-changed.

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
  commands/       # thin slash command handlers (eryndor.ts, weather.ts, announce.ts, …)
  events/         # discord.js event listeners (ready, interactionCreate, etc.)
  services/       # WeatherService, SchedulerService, AnnounceService, EryndorCalendarService, ActivityLogService, StatusReportService, ResourceService, BuildingService, ProductionService
  utils/          # helpers, activeWindow, harptos DOY helpers, statusReportPeriod
  db/             # SQLite connection + queries
  content/        # loaders for JSON content and images
  register-commands.ts
  index.ts

storage/
  world.sqlite    # world_state, weather_log, scheduled_posts, activity_log, bot_meta

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
  channel_id TEXT,                -- set via /dm weather setup
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
  magical_override_until DATETIME,
  update_min_minutes INTEGER,     -- guild schedule override (nullable); additive ALTER
  update_max_minutes INTEGER,
  active_window_enabled INTEGER,  -- NULL = inherit .env; 0 = off; 1 = on
  active_window_start TEXT,       -- HH:mm (nullable)
  active_window_end TEXT,         -- HH:mm (nullable)
  calendar_channel_id TEXT,       -- /eryndor setup; morning event + evening moon posts (nullable)
  calendar_events_last_handled_date TEXT,  -- YYYY-MM-DD local; additive ALTER
  calendar_fullmoon_last_handled_date TEXT -- YYYY-MM-DD local; additive ALTER
);

CREATE TABLE weather_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  weather_type TEXT,
  posted_at DATETIME,
  forced BOOLEAN DEFAULT 0        -- true when set via /dm weather set, not a roll
);

CREATE TABLE scheduled_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  body TEXT NOT NULL,
  post_at DATETIME NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  posted_at DATETIME              -- NULL = pending
);
```

On restart: if `next_update_at` is in the past and the guild isn't paused, post immediately and reschedule. This means state never needs a separate "missed update" recovery path.

Automated posts go to `thread_id` when set, otherwise to `channel_id`. If neither is configured, skip posting for that guild (log a warning) until `/dm weather setup` has been run.

Pending rows in `scheduled_posts` with `post_at` in the past are posted on the next scheduler tick (same 30s loop). Announcements ignore the weather active window and pause.

Morning calendar-event posts use `calendar_channel_id` (from `/dm calendar setup`), independent of the weather destination. Once per local day after `CALENDAR_EVENTS_POST_TIME` (default `08:30` in `WEATHER_TIMEZONE`): fetch today; post `@everyone` + the same embed as `/eryndor today` **only if** `events.length > 0`; otherwise stay silent. `calendar_events_last_handled_date` prevents duplicates (and skips empty days). Missed morning after restart → catch-up on the next tick after the post time.

Evening full-moon posts use the **same** channel after `CALENDAR_FULLMOON_POST_TIME` (default `20:00`):
- `moon.phase === "Full Moon (Rising)"` → moon-night embed, no `@everyone`, `MessageFlags.SuppressNotifications`
- `moon.isExactFullMoon` → moon-night embed + `@everyone`
- otherwise silent for that evening (`calendar_fullmoon_last_handled_date`)
No rotating flavor texts — the calendar phase is the message.

## Content Format

`content/weather-table.json` — a d100 table as **ranges**. There are not 100 weather types; there are ~5–15 types mapped onto rolls 1–100. Common weather gets wide ranges; rare magical effects get narrow ones.

Each entry has a numeric **`severity`** (1 = mild … 5 = catastrophic), a boolean **`magical`**, and points to **exactly one** image under `content/images/`. Optional **`durationMinMinutes` / `durationMaxMinutes`** override the guild/`.env` fallback interval while that type is current. Flavor text lives **in the image** — not in JSON.

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
    "durationMinMinutes": 120,
    "durationMaxMinutes": 360
  },
  {
    "min": 95,
    "max": 100,
    "type": "arcane_storm",
    "image": "arcane_storm.png",
    "severity": 5,
    "magical": true,
    "durationMinMinutes": 15,
    "durationMaxMinutes": 60
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

After current weather with `severity >= cooldownAfterSeverity`, the next scheduler/`/dm weather roll` filters to `severity <= cooldownMaxNextSeverity`. If that pool is empty (e.g. an all-evil table), the ceiling rises (3, 4, …) until at least one entry matches. `/dm weather set` bypasses the filter. Per-guild overrides via `/dm weather-settings cooldown` (null columns inherit these content defaults; guild can also disable cooldown). See [`feature-weather-severity-duration.md`](./feature-weather-severity-duration.md) and [`feature-guild-cooldown-settings.md`](./feature-guild-cooldown-settings.md).

**Roll pool order:** severity dial → magical dial → severity cooldown (within that intersection) → one weighted pick. Setting either dial rejects empty pools and empty **intersections** with the other active dial (no silent fallback). See [`feature-weather-magical-dial.md`](./feature-weather-magical-dial.md).

A DM (or content editor) should be able to add a new weather type or new artwork by editing this file and placing a single image at `content/images/<filename>` — never by touching source code.

Ship a sensible starter table with placeholder images; real art can be swapped later.

## Weather Service (Discord-agnostic)

Expose a small service interface that commands and the scheduler both call into:

- `getCurrentWeather(guildId)`
- `getAdminStatus(guildId)` — severity, magical flag, schedule, cooldown rules + next-roll filter, severity/magical dials, duration source, effective interval/window (for `/dm weather status`)
- `getScheduleSettings(guildId)` — effective interval + active window (guild override or `.env`)
- `getCooldownSettings(guildId)` — effective cooldown enabled/thresholds (guild override or `weather-rules.json`)
- `setSeverityDial` / `clearSeverityDial` — temporary min/max band for rolls
- `setMagicalDial` / `clearMagicalDial` — temporary `only` / `none` magical filter for rolls
- `setUpdateInterval` / `setActiveWindow` / `setCooldownSettings` / `clearSettingsOverrides` — per-guild settings; schedule changes reschedule immediately; cooldown changes apply on the next roll
- `rollWeather(guildId)` — weighted pick (severity dial + magical dial + severity cooldown when applicable), updates state, returns the result
- `setFromInput(guildId, value)` — forces a type or physical d100; marks `forced` for type sets; **bypasses** dials/cooldown
- `scheduleNextUpdate(guildId)` — per-type duration range if present, else guild/env minute range; stores `next_update_at`
- `pause(guildId, until)`
- `resume(guildId)` — clears the pause and recalculates `next_update_at`
- `setup(guildId, channelId, threadId | null)` — stores where to post

Discord commands should only parse input, call the service, and format the reply — no scheduling or weather logic inside a command handler.

## Eryndor Calendar Service

`EryndorCalendarService` fetches public static JSON (no secrets). The calendar site is GitHub Pages; there is no live “today” API — the bot computes Harptos day-of-year (DOY) in `WEATHER_TIMEZONE`, capped at **365** (no leap day), then fetches:

- `/eryndor today` → `{BASE}/data/days/{doy}.json` (3-digit zero-padded DOY)
- `/eryndor fullmoon` → `{BASE}/data/full-moons.json` → `nextByFromDoy[String(doy)]` (exact Full Moon only)

Fetch order: Pages base URL first; on persistent 404, optional raw.githubusercontent.com fallback. Do not scrape HTML.

Replies are Dutch Discord embeds (`content/messages.json` for labels/errors). Today embed: Harptos title, moon phase, NL-formatted Gregorian date under the moon, events list, then a markdown “Bekijk ↗” link to the calendar UI (`ERYNDOR_CALENDAR_BASE_URL`) under Events — **no** next-full-moon footer on today (full moon is only via `/eryndor fullmoon`).

UI calendar: [Calendar of Eryndor](https://v3xillum.github.io/eryndor/). Spec detail: [`docs/feature-eryndor-calendar.md`](./feature-eryndor-calendar.md). Daily auto-post of events: [`docs/feature-calendar-events-channel.md`](./feature-calendar-events-channel.md).

## Permissions

**Player-facing (everyone in the guild):**
- `/weather current`
- `/eryndor help` (players: player commands + link to player handout `…/spelers.html`; allowlist also sees DM cheat-sheet + DM `HANDOUT_URL`)
- `/eryndor today`, `/eryndor fullmoon`
- `/resource donate|buy|stock|personal|*|type list|overview`
- `/building donate|fund|contribute|list|status|cost show` — donate: source *outside* or *personal stock* (+ sell GC); fund: guild stock only (no GC)
- `/production list`

**DM-only:** all under `/dm …` (see Slash Commands). Runtime gate remains `ALLOWED_USER_IDS`.

`/dm` is registered with Discord `default_member_permissions: 0` so it is **hidden from the `/` picker for normal members**. Server admins see it by default. For non-admin DMs: Server Settings → Integrations → bot → enable `/dm` for those users or a DM role ([Command Permissions](https://support-apps.discord.com/hc/en-us/articles/26501869403159-Command-Permissions)). Allowlist still denies execution if someone somehow invokes `/dm` without being listed.

Unauthorized users get a short ephemeral denial.

## Slash Commands

There is **no** `/weather post`. Anything that changes weather also broadcasts to the configured channel/thread.

### Player commands
- `/eryndor help|today|fullmoon` — help + calendar info. Everyone.
- `/weather current` — private current weather. Everyone.
- `/resource donate|buy|stock|personal|*|type list|overview` — stockpile. Everyone.
- `/building donate|fund|contribute|list|status|cost show` — projects. Everyone. Donate chooses source (outside / personal stock, + sell GC); fund uses guild stock (no GC).
- `/production list` — production overview. Everyone.

### `/dm` (allowlist + Discord picker hidden by default)

Groups (Discord nesting: command → group → sub):

- `/dm weather` — `setup`, `status`, `next`, `roll`, `set`, `schedule`, `pause`, `resume`
- `/dm weather-severity` — `set`, `clear` (temporary severity band for auto-roll / `/dm weather roll`)
- `/dm weather-magical` — `set`, `clear` (`only` / `none`)
- `/dm weather-settings` — `show`, `interval`, `window`, `cooldown`, `clear` (per-guild schedule + cooldown)
- `/dm calendar` — `setup`, `clear` (morning events + evening moon posts channel)
- `/dm announce` — `schedule`, `list`, `cancel` (free-text posts; independent of weather channel)
- `/dm resource` — `setup`, `clear`, `adjust`, `cap`
- `/dm resource-type` — `add`, `edit`, `remove`
- `/dm building` — `create`, `cancel`
- `/dm building-cost` — `add`, `buildtime`
- `/dm production` — `add`, `workers`, `yield`, `remove`

Behaviour of each subcommand is unchanged from the former top-level paths (`/dm weather roll` → `/dm weather roll`, `/announce schedule` → `/dm announce schedule`, `/dm calendar setup` → `/dm calendar setup`, etc.). Daily production summary still posts after `PRODUCTION_POST_TIME` on the resource channel.

Slash commands are registered globally via `npm run register-commands` (`Routes.applicationCommands`). Global commands can take up to ~1 hour to appear in Discord clients; guild-scoped registration is faster for single-server testing if needed later.

## Post format
When posting weather (scheduler, `/dm weather roll`, or `/dm weather set`):
- **Image + title + `@everyone`** — attach the single image for that weather type; ping the guild
- Requires bot permission **Mention Everyone** (and channel must not deny it)
- All flavor, stats, and atmosphere are in the image (like DM weather cards)
- No Discord embed body / description pools / flavor text from JSON
- Include the weather `type` as a short markdown title under the ping
- Bot/UI strings that are not weather flavor (errors, confirmations, calendar copy) live in `messages.json`

## Scheduler
Responsible for:
- checking, on an interval (**30 seconds** — close enough for weather without a precise timer), whether `next_update_at` has passed and the guild isn't paused
- rolling new weather and posting it to the configured channel/thread when it's time
- recalculating and storing the next `next_update_at` from the current type’s duration range when set, otherwise the guild override minute range, otherwise `.env` defaults
- honouring each guild’s effective active posting window (guild override or `.env`)
- posting due rows from `scheduled_posts` (DM announcements) to their own `channel_id` — independent of weather destination / pause / active window
- once per day after `CALENDAR_EVENTS_POST_TIME`, posting the calendar today-embed to `calendar_channel_id` when that day has events — independent of weather destination / pause / active window
- once per evening after `CALENDAR_FULLMOON_POST_TIME`, posting a moon-night embed for `Full Moon (Rising)` (silent) or exact Full Moon (`@everyone`) — same channel
- once per day after `PRODUCTION_POST_TIME`, paying due production sources and posting one silent summary on the resource channel (lost overflow shown) — same-day catch-up if the bot starts late
- once per `STATUS_REPORT_CADENCE` after `STATUS_REPORT_TIME`, DM status reports to `STATUS_REPORT_USER_ID` (active/paused + usage counts + recent issues; no next-update spoilers)

Keep this logic entirely out of command handlers — commands trigger immediate one-off actions (`/dm weather roll`, `/dm weather set`); the scheduler owns the recurring automatic updates, due announcements, and morning calendar-event posts.

**Choice:** `.env` holds **defaults** (and timezone). Per-guild cadence and posting window can be overridden in SQLite via `/dm weather-settings` so DMs can change them without host access or a restart. Empty/null guild columns mean “inherit `.env`”.

### Weather duration precedentie (hoog → laag)
1. Expliciete DM-duur (`/dm weather set … duration`, `/dm weather schedule`)
2. Entry `durationMinMinutes` / `durationMaxMinutes`
3. Guild `/dm weather-settings interval`
4. `.env` `WEATHER_UPDATE_*_MINUTES`

## Deploy & GitHub

- GitHub holds the **code and content**, not secrets. Use `.gitignore` for `.env` and `storage/*.sqlite` (or document how local DB files are treated).
- The bot is a **long-running Node process**. GitHub Actions alone is not a host — Actions jobs are short-lived.
- Target workflow: develop and test on a personal machine or private VPS (`git pull` + `node` / PM2 / Docker), with `.env` filled locally. Later the same repo can deploy to a PaaS that connects to GitHub (e.g. Railway, Render, Fly.io) using environment variables there.
- One Discord application/bot token can be invited to multiple guilds; each guild runs `/dm weather setup` independently. No second codebase needed for a second server.

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
- Random world events (ad-hoc DM text scheduling is covered by `/announce`; random tables remain future)
- Encounter tables
- Forecast system (preview upcoming weather)
- Role-based allowlists (in addition to user IDs)
- Multiple Discord servers (the `guild_id` keying already supports this)
- Structured `descriptions` (or similar) in `weather-table.json` — only if text outside the card image becomes useful later; v1 keeps posts image-only
- Guild-scoped slash command registration for faster iteration on a single server

### Guild weather table (DB + wizard) — planned
Per-guild d100 table in SQLite (types + range segments), DM wizard under `/dm weather-table`, switchable source `json` | `db`, default type for gaps, new claim always cuts/splits overlapping segments. Custom images under `storage/`. See [`feature-weather-table-db.md`](./feature-weather-table-db.md).

### Weather duration (per type) — implemented
Each weather type may define `durationMinMinutes` / `durationMaxMinutes`. When present, that range schedules the next auto-update after the type becomes current; otherwise the guild `/dm weather-settings interval` applies when set, else the global `.env` interval. Explicit DM duration (`/dm weather set … duration`, `/dm weather schedule`) always wins.

### Guild schedule settings — implemented
`/dm weather-settings` stores optional per-guild overrides on `world_state`: `update_min_minutes` / `update_max_minutes`, `active_window_enabled` / `active_window_start` / `active_window_end`. Null = inherit `.env`. Timezone stays in `.env` (`WEATHER_TIMEZONE`). Changing settings reschedules `next_update_at` immediately. Visible on `/dm weather status` and `/dm weather-settings show`. Clear via `/dm weather-settings clear scope:schedule|all`.

### Severity & transition rules — implemented
Each entry has numeric **severity**. After weather at or above `cooldownAfterSeverity`, the next auto-roll / `/dm weather roll` must resolve to `severity <= cooldownMaxNextSeverity` (filter + one weighted pick; empty pools escalate the ceiling). Thresholds live in `content/weather-rules.json`. `/dm weather set` bypasses the filter. Per-guild overrides: see guild cooldown settings below.

### DM severity dial — implemented
`/dm weather-severity set <min> <max> <duration>` stores a temporary inclusive band on `world_state` (`severity_min` / `severity_max` / `severity_override_until`). Auto-roll and `/dm weather roll` filter to that band first, then apply magical dial (if any) and cooldown within the intersection. Lazy expiry (checked at roll time). `/dm weather-severity clear` removes it early. Visible on `/dm weather status`. `/dm weather set` still bypasses filters. Setting rejects empty bands and empty intersection with an active magical dial.

### DM magical dial — implemented
Each weather entry has boolean **`magical`**. `/dm weather-magical set <only|none> <duration>` stores a temporary filter on `world_state` (`magical_mode` / `magical_override_until`). Roll order: severity dial → magical dial → cooldown → weighted pick. Lazy expiry. `/dm weather-magical clear` removes it early. Visible on `/dm weather status`. `/dm weather set` bypasses. Setting rejects empty magical pools and empty intersection with an active severity dial (no silent fallback / escalate on magical).

### Guild cooldown settings — implemented
Per-guild overrides on `world_state`: `cooldown_enabled` (`null` = inherit / default on; `0`/`1` = off/on), `cooldown_after_severity`, `cooldown_max_next_severity` (null = inherit `content/weather-rules.json`). Field-level merge. `/dm weather-settings cooldown` patches provided fields; soft-warns when `max_next >= after` or the start pool would be empty (escalate still applies). `/dm weather-settings clear scope:cooldown|all` clears overrides. Visible on `/dm weather status` and `settings show` with source label `guild` | `content`. Does not reschedule. See [`feature-guild-cooldown-settings.md`](./feature-guild-cooldown-settings.md).

### Scheduled announcements — implemented
`/dm announce schedule|list|cancel` stores free-text posts in `scheduled_posts` and posts them via the existing 30s scheduler to a chosen channel (not the weather destination). Relative or absolute `when` in `WEATHER_TIMEZONE`. Modal body max 2000 chars. Allowlist only. See [`feature-scheduled-announcements.md`](./feature-scheduled-announcements.md).

### Guild resources & buildings — implemented
`/resource` (types, donate/buy/stock/personal/overview, setup, cap) and `/building` (create/cost add|buildtime|show/fund/donate/contribute). Flexible resource types per guild, two-phase building projects (materials → build time, default **100**). `/building donate` source: **outside** or **personal stock** (both + sell GC); `/building fund` from guild stock (no GC). Public silent embeds (donate/fund show full material progress), ledger + status-report backup. No player GC balance in DB. Player handout: `docs/handout/spelers.html`. See [`feature-guild-resources.md`](./feature-guild-resources.md).

### Guild production & storage cap — implemented
`/production` (add/list/workers/yield/remove) and `/resource cap`. Per-type `storage_cap` (default 300). Interactive overflow → personal stock; auto production overflow → **lost**, shown clearly on the daily silent post after `PRODUCTION_POST_TIME` (default `17:00`). Same same-day catch-up as calendar posts if the bot starts late. See [`feature-guild-production.md`](./feature-guild-production.md).

### Calendar events channel — implemented
`/dm calendar setup` stores `calendar_channel_id` on `world_state`. Each morning after `CALENDAR_EVENTS_POST_TIME` (default `08:30`, `WEATHER_TIMEZONE`), the scheduler fetches today and posts `@everyone` + the `/eryndor today` embed **only when** `events.length > 0`. Empty days stay silent. `/dm calendar clear` disables. See [`feature-calendar-events-channel.md`](./feature-calendar-events-channel.md).

**Possible adjustment (not built):** post the today-embed **every** morning. Days with events: keep `@everyone` (and normal notifications). Empty days: no `@everyone`, plus Discord `MessageFlags.SuppressNotifications` (no sound/push). Current preference remains “only post on event days” — a daily date post is likely noise; anyone curious can run `/eryndor today` on demand.

### Calendar full moon evening posts — implemented
Same `/dm calendar setup` channel. Each evening after `CALENDAR_FULLMOON_POST_TIME` (default `20:00`):
- **Full Moon (Rising)** (avond vóór exacte volle maan) → moon embed, no ping, `SuppressNotifications`
- **exact Full Moon** (`isExactFullMoon`) → moon embed + `@everyone`
No flavor-text pool — phase + Harptos date + calendar link. See [`feature-calendar-events-channel.md`](./feature-calendar-events-channel.md).

## Non-Goals
Do not introduce:
- Firebase, MongoDB, Redis
- Microservices or worker processes
- Complex abstractions or premature generalization
- Running the bot solely via GitHub Actions
- Scraping the Eryndor calendar HTML / inventing Harptos or moon data client-side

If a simpler solution satisfies today's requirement, use it over one that anticipates tomorrow's.
