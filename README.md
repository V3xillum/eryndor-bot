# Discord Weather Bot — West Marches

Atmospheric weather updates for a West Marches D&D Discord server. The bot posts automatically on a random interval (configurable in minutes via `.env`, default 6–18h) and gives allowlisted users slash-command control during sessions.

## Requirements

- Node.js 18+
- A Discord application with a bot user

## Discord setup (token & invite)

Follow the official Discord developer docs where useful: [Applications](https://discord.com/developers/docs/quick-start/getting-started), [Bot users](https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow).

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **Bot**, create a bot and click **Reset Token**. Copy the token → `DISCORD_TOKEN` in `.env`.
3. Under **General Information**, copy the **Application ID** → `DISCORD_CLIENT_ID`.
4. Enable **Developer Mode** in Discord (User Settings → Advanced), right-click your user → **Copy User ID**. Put that ID in `ALLOWED_USER_IDS` (comma-separated for multiple admins).
5. Invite the bot with `applications.commands` and `bot` scopes. Example URL (replace `CLIENT_ID`):

   ```text
   https://discord.com/oauth2/authorize?client_id=1532005876448235542&scope=bot%20applications.commands&permissions=35840
   ```

   `3072` = View Channel + Send Messages + Embed Links + Attach Files. Adjust if your server needs more (e.g. threads).

6. In the Developer Portal → **Bot**, you do **not** need privileged intents for this bot (it only uses Guilds).

## Local setup

```bash
cp .env.example .env
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, ALLOWED_USER_IDS
# optional: WEATHER_UPDATE_MIN_MINUTES / MAX (e.g. 1 and 5 for testing)
# optional: WEATHER_ACTIVE_START / END / TIMEZONE (default 06:00–23:00 Europe/Amsterdam)

npm install
npm run register-commands   # register /weather and /world
npm run build
npm start
```

For development without a separate build step:

```bash
npm run dev
```

Global slash commands can take up to about an hour to appear after registration. For faster iteration you can temporarily register per-guild (not required for v1).

## Commands

### Weather

| Command | Who | Effect |
|---|---|---|
| `/weather current` | everyone | Private status check (does not post to the weather channel) |
| `/weather status` | allowlist | Admin detail: severity, remaining time, duration source, cooldown |
| `/weather next` | allowlist | When the next automatic update is due (ephemeral) |
| `/weather setup <channel> [thread]` | allowlist | Where automated/`roll`/`set` posts go |
| `/weather roll` | allowlist | d100 roll, update state, post to channel/thread |
| `/weather set <value> [duration]` | allowlist | Type of d100 (1–100); post + optionele duur |
| `/weather schedule <duration>` | allowlist | Keep current weather; set when the next auto-roll happens |
| `/weather pause <duration>` | allowlist | Pause auto-updates (`30m`, `2h`, `1d`) |
| `/weather resume` | allowlist | Clear pause and schedule the next update |

There is no `/weather post` — anything that changes weather also broadcasts.

### Calendar (Eryndor)

Data comes from the static [Calendar of Eryndor](https://v3xillum.github.io/eryndor/) JSON API. Everyone in the guild may use these (world info, no weather-timer spoilers). Replies are in Dutch.

| Command | Who | Effect |
|---|---|---|
| `/world today` | everyone | Current Harptos day, moon phase, and events |
| `/world fullmoon` | everyone | Next exact Full Moon (from `full-moons.json`) |

Optional env: `ERYNDOR_CALENDAR_BASE_URL` / `ERYNDOR_CALENDAR_FALLBACK_URL` (see `.env.example`). Timezone for “today” follows `WEATHER_TIMEZONE` (default `Europe/Amsterdam`).

## Content

Edit without touching TypeScript:

- `content/weather-table.json` — d100 ranges, types, images, required `severity`, optional `durationMinHours` / `durationMaxHours`
- `content/weather-rules.json` — cooldown thresholds after high-severity weather
- `content/messages.json` — bot reply strings (errors / confirmations only)
- `content/images/` — one image per `image` field (DM weather cards)

After severity ≥ `cooldownAfterSeverity`, the next auto-roll / `/weather roll` only picks milder types (up to `cooldownMaxNextSeverity`, escalating if that pool is empty). `/weather set` bypasses the cooldown. Channel posts stay image-only.

## Data

SQLite file: `storage/world.sqlite` (gitignored). One `world_state` row per Discord guild.

On restart, if `next_update_at` is in the past and the guild is not paused, the bot posts immediately and reschedules.

## Deploy notes

This is a long-running Node process. GitHub stores code/content only — put secrets in `.env` on the host (VPS, Railway, Render, Fly.io, etc.). See `docs/agent.md` for non-goals and planned extensions (not implemented in v1).
