# Discord Weather Bot — West Marches

## Project Goal
Build a Discord bot for a West Marches D&D server that makes the world feel alive between sessions. The bot automatically posts atmospheric weather updates to a configured channel (or thread), and gives authorized users full manual control during sessions through slash commands.

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
```

**Active window behaviour:** the scheduler never auto-posts outside the window. If `next_update_at` falls overnight, it waits until the next `WEATHER_ACTIVE_START`. When scheduling the next update, candidates outside the window are clamped to the next window start. Half-open interval: `[start, end)` in `WEATHER_TIMEZONE`.

`guild` destination is still per server via `/weather setup` (not via `.env`). Changing the update interval requires a bot restart; existing `next_update_at` values in SQLite stay until they elapse or weather is rolled/set/resumed.

`guild_id` is a real Discord concept: a *guild* is a Discord server. Each server has a unique snowflake ID. The bot stores one weather state row per guild so the same bot can later run in multiple servers without a rewrite. Slash commands receive `interaction.guildId` from Discord — operators do not need to know or type it during setup.

## General Principles
- Keep the project simple. Choose the simplest solution that satisfies the current requirement, not the most extensible one.
- Prefer readable code over clever code.
- Separate weather logic from Discord entirely — the weather system must work if you swapped discord.js for something else tomorrow.
- No hardcoded weather tables, message text, or image paths. All of that lives in `content/`.
- Design for extension, but don't pre-build the extensions (see Future Extensions).

## Project Structure
```text
src/
  commands/       # thin slash command handlers, no business logic
  events/         # discord.js event listeners (ready, interactionCreate, etc.)
  services/       # WeatherService, SchedulerService — Discord-agnostic where possible
  db/             # SQLite connection + queries
  content/        # loaders for JSON content and images
  index.ts

storage/
  world.sqlite

content/
  weather-table.json
  messages.json
  images/
    clear.png
    cloudy.png
    rain.png
    storm.png
    # one file per weather type — filename matches the `image` field in weather-table.json
```

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
  updated_at DATETIME
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

Each entry points to a weather type and **exactly one** image file under `content/images/`. Flavor text, stats, and atmosphere live **in the image itself** (DM weather cards) — not in JSON and not in Discord message text.

```json
[
  {
    "min": 1,
    "max": 20,
    "type": "clear",
    "image": "clear.png"
  },
  {
    "min": 21,
    "max": 30,
    "type": "rain",
    "image": "rain.png"
  },
  {
    "min": 95,
    "max": 100,
    "type": "arcane_storm",
    "image": "arcane_storm.png"
  }
]
```

A DM (or content editor) should be able to add a new weather type or new artwork by editing this file and placing a single image at `content/images/<filename>` — never by touching source code.

Ship a sensible starter table with placeholder images; real art can be swapped later.

## Weather Service (Discord-agnostic)

Expose a small service interface that commands and the scheduler both call into:

- `getCurrentWeather(guildId)`
- `rollWeather(guildId)` — rolls d100, updates state, returns the result
- `setWeather(guildId, type)` — forces a type, marks `forced = true`
- `scheduleNextUpdate(guildId)` — picks a random interval from `WEATHER_UPDATE_*_MINUTES` (default 360–1080) and stores `next_update_at`
- `pause(guildId, until)`
- `resume(guildId)` — clears the pause and recalculates `next_update_at`
- `setup(guildId, channelId, threadId | null)` — stores where to post

Discord commands should only parse input, call the service, and format the reply — no scheduling or weather logic inside a command handler.

## Permissions

- `/weather current` — available to everyone in the guild.
- All other `/weather` subcommands (including `next`) — only users whose Discord user ID appears in `ALLOWED_USER_IDS`.

Do **not** require Discord “Manage Server” or a DM role. The operator may not have those permissions; user-ID allowlist is the intended gate. Later this can be extended with role IDs; do not build role support now unless trivial.

Unauthorized users get a short ephemeral denial.

## Slash Commands

There is **no** `/weather post`. Anything that changes weather also broadcasts to the configured channel/thread. A separate “post current again” command is redundant with `current` and with the channel history.

- `/weather setup <channel> [thread]` — configure where weather updates are sent (scheduler, `roll`, and `set`). `thread` is optional. Uses the current guild’s `guildId` from the interaction.
- `/weather current` — show the current weather **to the invoking user** (ephemeral or command reply). Does **not** post to the weather channel — if the bot is working, the latest update is already visible there; this is a quiet status check (e.g. DM mid-session without spamming the channel).
- `/weather next` — show when the next **automatic** update is scheduled (ephemeral). Also reports pause state and when an update is due but waiting for the active posting window. **Allowlist only** (players should not see when weather will change). Does not post to the weather channel.
- `/weather roll` — roll d100 against the table, set that as current weather, **and** post the update to the configured channel/thread. Also reply to the invoker with the result (roll value + type).
- `/weather set <value> [duration]` — set weather by **type** (`storm`) or **physical d100** (`81`), then post. Type → `forced = true`; numeric 1–100 → table lookup, `forced = false` (external die). Optional `duration` as before.
- `/weather schedule <duration>` — keep the **current** weather; only change when the next automatic roll happens. Same duration format. Clears pause. Allowlist only. Does not post to the channel.
- `/weather pause <duration>` — pause automatic updates. Duration format: `30m`, `2h`, or `1d` (minutes / hours / days). Reject invalid input with a clear ephemeral error.
- `/weather resume` — resume automatic updates.

## Post format
When posting weather (scheduler, `/weather roll`, or `/weather set`):
- **Image-only** — attach the single image for that weather type
- All flavor, stats, and atmosphere are in the image (like DM weather cards)
- No Discord embed body / description pools / flavor text from JSON
- Optionally include the weather `type` as a short title; nothing more
- Bot/UI strings that are not weather flavor (errors, confirmations) can live in `messages.json`

## Scheduler
Responsible for:
- checking, on an interval (**30 seconds** — close enough for weather without a precise timer), whether `next_update_at` has passed and the guild isn't paused
- rolling new weather and posting it to the configured channel/thread when it's time
- recalculating and storing the next `next_update_at` using the configured minute range from `.env`

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

### Weather duration (per type)
Today the scheduler uses one global random interval from `.env` (`WEATHER_UPDATE_MIN_MINUTES` / `MAX`, default 360–1080) for every update. Later:
- Each weather type may define its own duration range (e.g. `durationMinHours` / `durationMaxHours`) so common weather can last longer and dangerous effects shorter.
- Optional hard **max duration** per type — especially for severe/magical weather — so a dangerous effect cannot linger for a full long interval.
- Intended direction: per-type duration eventually **replaces** (or overrides) the global env interval when rolling/scheduling the next update. Do not implement duration fields or logic in v1 unless they are unused placeholders; prefer documenting only until this feature is scheduled.
- Optional: per-guild override via slash command + DB if operators need live tuning without restarting the host.

### Severity & transition rules
Problem to solve later: with an unweighted d100, bad luck can chain rare dangerous weather.
- Each weather entry gets a numeric **severity** (e.g. 1 = mild … 5 = catastrophic).
- **Transition rule**: after weather at or above severity X, the next roll must resolve to severity Y or lower (reroll / filter / dedicated aftermath pool — pick the simplest approach when building).
- Content stays data-driven: severity and transition thresholds live in `content/` (or a small rules section), not hardcoded special cases per type name.

### DM world danger / severity modifier
The DM (allowlisted user) should be able to bias how dangerous the weather is without editing JSON mid-campaign, e.g.:
- `/weather danger <level>` or milder / normal / harsher
- Stored per guild on `world_state` (e.g. a bias or ceiling), applied when rolling
- Use cases: curse active, calm after a major event, arc downtime, etc.

Suggested later combination: **per-type duration + severity transitions + DM danger dial**. Do not add columns, content fields, or commands for these until explicitly implementing this feature.

## Non-Goals
Do not introduce:
- Firebase, MongoDB, Redis
- Microservices or worker processes
- Complex abstractions or premature generalization
- Running the bot solely via GitHub Actions

If a simpler solution satisfies today's requirement, use it over one that anticipates tomorrow's.
