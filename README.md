# Eryndor bot

Discord bot for the Eryndor (West Marches) D&D server: atmospheric weather updates plus calendar commands. The bot posts weather automatically on a random interval (defaults in `.env`, overridable per guild via `/weather settings`) and gives allowlisted users slash-command control during sessions.

DM handout (GitHub Pages, from `/docs`): [`docs/handout/`](./docs/handout/). Agent rules for that handout: [`docs/handout-agent.md`](./docs/handout-agent.md).

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
# optional defaults: WEATHER_UPDATE_MIN_MINUTES / MAX (e.g. 1 and 5 for testing)
# optional defaults: WEATHER_ACTIVE_START / END / TIMEZONE (default 06:00–23:00 Europe/Amsterdam)
# per-guild overrides at runtime: /weather settings (no restart)

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
| `/weather help` | everyone | Short cheat-sheet + link to the DM handout (`HANDOUT_URL`) |
| `/weather status` | allowlist | Admin detail: severity, magical, remaining time, duration, interval/window, cooldown, dials |
| `/weather severity set` | allowlist | Tijdelijke severity-band (`min`/`max`/`duration`) voor rolls |
| `/weather severity clear` | allowlist | Severity dial uitzetten → default gedrag |
| `/weather magical set` | allowlist | Tijdelijk alleen magisch (`only`) of juist niet (`none`) voor rolls |
| `/weather magical clear` | allowlist | Magical dial uitzetten → default gedrag |
| `/weather settings show` | allowlist | Effectief interval + postvenster + afkoeling (guild of default) |
| `/weather settings interval` | allowlist | Guild-fallback interval in minuten (reschedule) |
| `/weather settings window` | allowlist | Guild actief postvenster aan/uit + `HH:mm` (reschedule) |
| `/weather settings cooldown` | allowlist | Guild afkoeling aan/uit + drempels (geen reschedule) |
| `/weather settings clear` | allowlist | Overrides wissen per scope: `schedule` / `cooldown` / `all` |
| `/weather next` | allowlist | When the next automatic update is due (ephemeral) |
| `/weather setup <channel> [thread]` | allowlist | Where automated/`roll`/`set` posts go |
| `/weather roll` | allowlist | d100 roll, update state, post to channel/thread |
| `/weather set <value> [duration]` | allowlist | Type of d100 (1–100); post + optionele duur |
| `/weather schedule <duration>` | allowlist | Keep current weather; set when the next auto-roll happens |
| `/weather pause <duration>` | allowlist | Pause auto-updates (`30m`, `2h`, `1d`) |
| `/weather resume` | allowlist | Clear pause and schedule the next update |

There is no `/weather post` — anything that changes weather also broadcasts.

### Announcements (scheduled text)

Allowlist only. Posts go to the channel you pick — independent of `/weather setup`.

| Command | Effect |
|---|---|
| `/announce schedule <channel> <when>` | Opens a modal for the text; posts later (`30m`/`2h`/`1d` or `YYYY-MM-DD HH:mm` in `WEATHER_TIMEZONE`) |
| `/announce list` | Pending posts (ephemeral) |
| `/announce cancel <id>` | Cancel a pending post |

### Calendar (Eryndor)

Data comes from the static [Calendar of Eryndor](https://v3xillum.github.io/eryndor/) JSON API. Everyone in the guild may use these (world info, no weather-timer spoilers). Replies are in Dutch.

| Command | Who | Effect |
|---|---|---|
| `/world today` | everyone | Current Harptos day, moon phase, and events |
| `/world fullmoon` | everyone | Next exact Full Moon (from `full-moons.json`) |

Optional env: `ERYNDOR_CALENDAR_BASE_URL` / `ERYNDOR_CALENDAR_FALLBACK_URL` (see `.env.example`). Timezone for “today” follows `WEATHER_TIMEZONE` (default `Europe/Amsterdam`).

## Content

Edit without touching TypeScript:

- `content/weather-table.json` — d100 ranges, types, images, required `severity` + `magical`, optional `durationMinMinutes` / `durationMaxMinutes`
- `content/weather-rules.json` — cooldown thresholds after high-severity weather
- `content/messages.json` — bot reply strings (errors / confirmations only)
- `content/images/` — one image per `image` field (DM weather cards)

After severity ≥ `cooldownAfterSeverity`, the next auto-roll / `/weather roll` only picks milder types (up to `cooldownMaxNextSeverity`, escalating if that pool is empty). Defaults live in `content/weather-rules.json`; per-guild overrides via `/weather settings cooldown` (null = inherit). `/weather set` bypasses filters. Temporary dials: **severity** (`/weather severity set`) and **magical** (`/weather magical set only|none`) further limit the roll pool until they expire; setting either dial rejects empty pools and empty intersections. Channel posts stay image-only.

## Data

SQLite file: `storage/world.sqlite` (gitignored). One `world_state` row per Discord guild.

On restart, if `next_update_at` is in the past and the guild is not paused, the bot posts immediately and reschedules.

## Deploy notes

This is a long-running Node process. GitHub stores code/content only — put secrets in `.env` on the host (VPS, Railway, Render, Fly.io, etc.). See `docs/agent.md` for non-goals and planned extensions (not implemented in v1).
