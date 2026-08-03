# Eryndor bot

Discord bot for the Eryndor (West Marches) D&D server: weather, calendar, guild resources/buildings/production. The bot posts weather automatically on a random interval (defaults in `.env`, overridable per guild via `/dm weather-settings`) and gives allowlisted users slash-command control during sessions.

DM handout (GitHub Pages, from `/docs`): [`docs/handout/`](./docs/handout/). Player handout: [`docs/handout/spelers.html`](./docs/handout/spelers.html). Agent rules: [`docs/handout-agent.md`](./docs/handout-agent.md). Feature specs: `docs/feature-*.md`.

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
   https://discord.com/oauth2/authorize?client_id=1532005876448235542&scope=bot%20applications.commands&permissions=274878073856
   ```

   `274878073856` = View Channel + Send Messages + Send Messages in Threads + Attach Files + Mention Everyone. See [Discord permissions](https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags).

6. In the Developer Portal → **Bot**, you do **not** need privileged intents for this bot (it only uses Guilds).

## Local setup

```bash
cp .env.example .env
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, ALLOWED_USER_IDS
# optional defaults: WEATHER_UPDATE_MIN_MINUTES / MAX (e.g. 1 and 5 for testing)
# optional defaults: WEATHER_ACTIVE_START / END / TIMEZONE (default 06:00–23:00 Europe/Amsterdam)
# per-guild overrides at runtime: /dm weather-settings (no restart)

npm install
npm run register-commands   # register /eryndor, /weather, /dm, /resource, /building, /production
npm run build
npm start
```

For development without a separate build step:

```bash
npm run dev
```

Global slash commands can take up to about an hour to appear after registration. For faster iteration you can temporarily register per-guild (not required for v1).

## Commands

### Players (visible in `/`)

| Command | Effect |
|---|---|
| `/eryndor help` | Dutch overview of player commands (DMs also get DM cheat-sheet + handout link) |
| `/eryndor today` / `fullmoon` | Harptos day / next exact Full Moon |
| `/weather current` | Private current weather |
| `/resource …` | `donate` / `buy` / `stock` / `personal` / `type list` |
| `/building …` | `deliver` / `use-guild-stock` / `contribute` / `list` / `status` / `cost show` |
| `/production list` | Production sources overview |

### DM (`/dm` — hidden from players by default)

All former allowlist commands live under `/dm` (e.g. `/dm weather roll`, `/dm calendar setup`, `/dm announce schedule`). Registered with `default_member_permissions: 0`. Enable for DMs via **Server Settings → Integrations → bot → `/dm`**. Runtime gate remains `ALLOWED_USER_IDS`.

| Group | Subs (summary) |
|---|---|
| `weather` | `setup`, `status`, `next`, `roll`, `set`, `schedule`, `pause`, `resume` |
| `weather-severity` / `weather-magical` | `set`, `clear` |
| `weather-settings` | `show`, `interval`, `window`, `cooldown`, `clear` |
| `calendar` | `setup`, `clear` |
| `announce` | `schedule`, `list`, `cancel` |
| `resource` / `resource-type` | setup/clear/adjust/cap · type add/edit/remove |
| `building` / `building-cost` | create/cancel · cost add/buildtime |
| `production` | `add`, `workers`, `yield`, `remove` |

Full DM-facing explanation: [`docs/handout/`](./docs/handout/). Calendar JSON: [Calendar of Eryndor](https://v3xillum.github.io/eryndor/).

## Content

Edit without touching TypeScript:

- `content/weather-table.json` — d100 ranges, types, images, required `severity` + `magical`, optional `durationMinMinutes` / `durationMaxMinutes`
- `content/weather-rules.json` — cooldown thresholds after high-severity weather
- `content/messages.json` — bot reply strings (errors / confirmations only)
- `content/images/` — one image per `image` field (DM weather cards)

After severity ≥ `cooldownAfterSeverity`, the next auto-roll / `/dm weather roll` only picks milder types (up to `cooldownMaxNextSeverity`, escalating if that pool is empty). Defaults live in `content/weather-rules.json`; per-guild overrides via `/dm weather-settings cooldown` (null = inherit). `/dm weather set` bypasses filters. Temporary dials: **severity** (`/dm weather-severity set`) and **magical** (`/dm weather-magical set only|none`) further limit the roll pool until they expire. Channel posts are image + title + `@everyone`.

## Data

SQLite file: `storage/world.sqlite` (gitignored). One `world_state` row per Discord guild.

On restart, if `next_update_at` is in the past and the guild is not paused, the bot posts immediately and reschedules.

## Status report DMs

Optional. Set `STATUS_REPORT_USER_ID` (comma-separated) plus `STATUS_REPORT_TIME` / `STATUS_REPORT_CADENCE` (`daily` | `weekly` | `monthly`). After that local time, once per period, the bot DMs a snapshot: weather **active/paused** only (no next-update spoilers), usage counts, and recent warnings/errors. Empty user list disables the feature.

## Run in the background (PM2)

Keep the bot running without an open terminal (e.g. on your Mac). Requires [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/) globally: `npm i -g pm2`.

| Script | Effect |
|---|---|
| `npm run start:bot` | Build, then start as `eryndor-bot` (first time only) |
| `npm run reboot:bot` | Build, then restart the existing PM2 process |
| `npm run stop:bot` | Stop the PM2 process |
| `npm run status:bot` | Show whether `eryndor-bot` is online and process details |
| `npm run logs:bot` | Follow PM2 logs (Ctrl+C to stop watching) |

```bash
npm run start:bot     # first launch
npm run reboot:bot    # after code/content changes
npm run stop:bot      # shut down
npm run status:bot    # is it running?
npm run logs:bot      # live logs
```

Closing the terminal is fine; putting the Mac to sleep still suspends the process. Optional: `pm2 startup` + `pm2 save` so the bot comes back after a reboot ([PM2 startup](https://pm2.keymetrics.io/docs/usage/startup/)).

## Deploy notes

This is a long-running Node process. GitHub stores code/content only — put secrets in `.env` on the host (VPS, Railway, Render, Fly.io, etc.). See `docs/agent.md` for non-goals and planned extensions (not implemented in v1).
