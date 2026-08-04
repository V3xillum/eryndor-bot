# Feature: Eryndor calendar commands

Feature-spec voor een AI-agent die dit in **Eryndor bot** (deze Discord-bot) implementeert.

**Status:** implemented als `/eryndor vandaag` en `/eryndor vollemaan` (onder `/eryndor`; niet de NL top-level namen hieronder).

**Gerelateerd:** bestaande bot-architectuur in [`agent.md`](./agent.md). Calendar UI / data-bron: [Calendar of Eryndor](https://v3xillum.github.io/eryndor/).

---

## Goal

Twee slash commands die de **statische JSON API** van de Calendar of Eryndor consumeren *(oorspronkelijk voorgesteld als NL top-level; live: subcommands van `/eryndor`)*:

1. **`/eryndor vandaag`** (was voorstel `/vandaag`) — huidige Harptos-dag, maanfase, events (birthdays, memorials, festivals).
2. **`/eryndor vollemaan`** (was voorstel `/vollemaan`) — volgende *exacte* Full Moon (niet Rising/Fading).

User-facing replies: **Nederlands** (zoals `content/messages.json` voor weather).

Optioneel later (niet verplicht in v1 van deze feature): dagelijkse kanaalpost via de bestaande scheduler. Focus eerst op de twee commands.

---

## Critical constraints

- De calendar-site is **static GitHub Pages**. Er is **geen live API** die “today” server-side uitrekent.
- JSON-bestanden zijn **pre-generated**. Na wijzigingen in `settings.js` op de calendar-repo moet iemand `npm run generate-api-json` draaien en `data/` pushen.
- De bot moet de huidige Harptos **day-of-year (DOY)** zelf berekenen, daarna het juiste bestand fetchen.
- Cap Gregorian day-of-year op **365** (Harptos heeft geen leap day; 29 feb negeren / cap).
- **Niet** de HTML-kalender scrapen.
- **Niet** Harptos-datums of maanfasen verzinnen — vertrouw de JSON.
- Server-side `fetch` in de bot (CORS speelt geen rol).

Vermijd onnodige dependencies. Geen job queues, geen ORM. Volg patronen uit de bestaande codebase (`src/commands/`, `src/services/`, `src/config.ts`, NL messages).

---

## Base URLs

Prefer Pages (zelfde origin als de calendar UI):

```text
https://v3xillum.github.io/eryndor
```

Fallback als Pages nog niet bij is:

```text
https://raw.githubusercontent.com/V3xillum/eryndor/main
```

Paths zijn hetzelfde onder beide bases (`/data/...`).

Maak de base URL configureerbaar via `.env`, bv.:

```env
ERYNDOR_CALENDAR_BASE_URL=https://v3xillum.github.io/eryndor
# Optional fallback; implement Pages-first then raw on persistent 404
ERYNDOR_CALENDAR_FALLBACK_URL=https://raw.githubusercontent.com/V3xillum/eryndor/main
```

Voeg keys toe aan `.env.example` (geen secrets nodig voor public data).

---

## Endpoints

### 1. Day payload (voor “vandaag”)

```http
GET {BASE}/data/days/{doy}.json
```

- `{doy}` = `001` … `365` (altijd **3 digits**, zero-padded).
- Voorbeeld: https://v3xillum.github.io/eryndor/data/days/210.json

### 2. Full moons (optioneel; day JSON bevat al `nextFullMoon`)

```http
GET {BASE}/data/full-moons.json
```

- Voor volgende exacte Full Moon vanaf een DOY: `nextByFromDoy[String(doy)]`.
- Voor `/vollemaan` is **hergebruik van today JSON → `nextFullMoon`** het eenvoudigst.

### 3. Meta (optioneel)

```http
GET {BASE}/data/meta.json
```

---

## How to compute “today” DOY

Timezone: **`Europe/Amsterdam`** (moet matchen met de calendar; mag dezelfde timezone zijn als `WEATHER_TIMEZONE`).

```js
function harptosDoyNow(date = new Date(), timeZone = 'Europe/Amsterdam') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = +parts.find((p) => p.type === 'year').value;
  const m = +parts.find((p) => p.type === 'month').value;
  const d = +parts.find((p) => p.type === 'day').value;
  const ml = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ml[1] = 29;
  let n = d;
  for (let i = 0; i < m - 1; i++) n += ml[i];
  return Math.min(n, 365);
}

function dayUrl(base, doy) {
  return `${base}/data/days/${String(doy).padStart(3, '0')}.json`;
}
```

Fetch-flow voor **vandaag**:

1. `doy = harptosDoyNow()`
2. `GET dayUrl(BASE, doy)` (Pages eerst; bij hardnekkige 404 → fallback base)
3. JSON parsen; Discord-reply renderen

---

## Day JSON schema

```json
{
  "dayOfYear": 210,
  "refYear": 2026,
  "timezone": "Europe/Amsterdam",
  "leapYearNote": null,
  "harptos": {
    "label": "28 Flamerule",
    "month": "Flamerule",
    "day": 28,
    "special": null
  },
  "gregorian": {
    "iso": "2026-07-29",
    "year": 2026,
    "month": 7,
    "day": 29
  },
  "moon": {
    "phase": "Dark Moon (Fading)",
    "emoji": "🌑",
    "isExactFullMoon": false
  },
  "events": [],
  "nextFullMoon": {
    "dayOfYear": 225,
    "daysUntil": 15,
    "whenText": "over 15 dagen",
    "label": "12 Eleasis"
  }
}
```

### Field notes

| Field | Meaning |
|--------|---------|
| `harptos.label` | Display date, of festivalnaam (bv. `Midwinter`) |
| `harptos.special` | Festivalnaam of `null` |
| `moon.isExactFullMoon` | `true` alleen bij exacte `"Full Moon"` (niet Rising/Fading) |
| `events[]` | Nul of meer events die dag |
| `nextFullMoon` | Volgende exacte Full Moon vanaf deze DOY (incl. vandaag als exact) |
| `leapYearNote` | Non-null string in Gregoriaanse schrikkeljaren |

### Event object types

**Festival**

```json
{ "type": "festival", "name": "Midwinter", "icon": "❄️", "css": "midwinter" }
```

**Birthday**

```json
{ "type": "birthday", "name": "Nixy Fernlore" }
```

**Memorial**

```json
{
  "type": "memorial",
  "title": "Eerste stap op Eryndor",
  "memorialType": "festive",
  "subtitle": null
}
```

`memorialType`: `"festive"` | `"death"` | `"memorial"` (subdued / default).

---

## Suggested Discord commands

### Permissions (keuze voor implementatie)

Voorstel in lijn met weather:

- `/vandaag` en `/vollemaan` — **iedereen** in de guild (wereldinfo, geen spoilers over weather-timers).
- Geen aparte setup nodig in v1 (geen kanaalpost).

Als de DM liever allowlist wil: gebruik hetzelfde `ALLOWED_USER_IDS`-patroon als `/weather next`. Documenteer de gekozen keuze in README.

### `/vandaag`

1. Fetch day JSON voor huidige DOY.
2. Reply (embed of plain text), Nederlands, bv.:

- **Titel:** Vandaag — `{harptos.label}`
- Gregoriaans: `{gregorian.iso}` (of netjes geformatteerd)
- Maan: `{moon.emoji} {moon.phase}`
- Events: lijst of “Geen events vandaag”
- Optionele footer: volgende Full Moon uit `nextFullMoon`

Event-regels:

- birthday → `🎂 {name}`
- festival → `{icon} {name}`
- memorial festive → `✨ {title}`
- memorial death → `🕯 {title}` (+ subtitle indien aanwezig)
- memorial default → `✦ {title}`

### `/vollemaan`

Eenvoudigst: hergebruik today JSON → `nextFullMoon`.

Of: `GET /data/full-moons.json` → `nextByFromDoy[String(doy)]`.

Reply bv.:

- **Volgende Full Moon:** 🌕 `{label}`
- `{whenText}` (`vandaag` / `morgen` / `over N dagen`)
- DOY / Harptos-label naar behoefte

**Niet** `"Full Moon (Rising)"` / `"Full Moon (Fading)"` als exacte volle maan behandelen — `nextFullMoon` in JSON is al exact-only.

---

## Integration with this repo

Volg bestaande structuur waar mogelijk:

```text
src/
  commands/          # thin handlers — eryndor.ts (today / fullmoon / help / setup / clear)
  services/          # EryndorCalendarService (fetch + format), Discord-agnostisch waar mogelijk
  utils/             # harptosDoyNow (of in service)
  register-commands.ts  # beide commands registreren naast /weather
  index.ts           # wire interactionCreate
content/messages.json # NL strings voor calendar (of apart calendar-messages — liever één messages.json uitbreiden)
```

### Implementatie-checklist voor de agent

1. Types voor day JSON + events.
2. `harptosDoyNow` + URL builders + fetch met Pages → fallback.
3. Service: `getToday()`, `getNextFullMoon()` (mag today hergebruiken).
4. Slash commands + NL replies; strings in `messages.json` (of equivalent).
5. `register-commands` uitbreiden; README kort bijwerken.
6. Error handling: non-2xx / invalid JSON → duidelijke NL ephemeral fout.
7. Geen scraping; geen harde weather-wijzigingen tenzij nodig voor wiring.

### Out of scope (v1 van deze feature)

- Dagelijkse automatische kanaalpost van de kalender
- Wijzigen van weather severity / duration features
- HTML scrape / Cloudflare Worker API
- Private GitHub tokens (data is public)

---

## Error handling

- Non-2xx of invalid JSON → gebruiker informeren dat calendar-data niet geladen kon worden; later opnieuw proberen.
- Prefer Pages URL; bij hardnekkige 404 → `raw.githubusercontent.com`.
- Lege `events` blijft een geldige reply (“Geen events vandaag”).

---

## Source of truth (calendar repo)

| Path | Role |
|------|------|
| `settings.js` | Birthdays & memorials (hier bewerken) |
| `calendar-core.js` | Shared Harptos / moon logic |
| `scripts/generate-api-json.mjs` | Regenereert `data/` |
| `data/days/*.json` | Per-day API files |
| `data/full-moons.json` | Full moon index |
| `data/meta.json` | Generation metadata |

Na settings-wijzigingen in de calendar-repo:

```bash
npm run generate-api-json
# optional: npm run generate-api-json -- --year=2026
```

Daarna `data/` committen en pushen.

---

## Quick test checklist

- [ ] `GET …/data/days/210.json` returns JSON (geen HTML 404)
- [ ] `harptosDoyNow()` in Amsterdam matcht calendar “vandaag”
- [ ] `/vandaag` toont label + moon + events
- [ ] `/vollemaan` gebruikt `nextFullMoon` / exact Full Moon only
- [ ] Lege `events` geeft nog steeds een geldige reply
- [ ] `npm run register-commands` + bot restart; commands zichtbaar in Discord
- [ ] Bestaande `/weather *` commands blijven werken

---

## Agent instructions (kort)

1. Lees [`agent.md`](./agent.md) voor projectconventies.
2. Implementeer **alleen** deze feature tenzij de user iets anders vraagt.
3. Communiceer in het Nederlands met de user; Engelse identifiers in code.
4. Na afloop: build laten slagen, kort uitleggen hoe te registreren/testen.
