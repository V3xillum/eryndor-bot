# Feature: Weather severity, duration & cooldown

Ontwerpdoc voor een latere implementatie. Bouwt voort op de future extensions in [`agent.md`](./agent.md) (Weather duration, Severity & transition rules, DM danger dial).

**Status:** implemented — severity, per-type duration, cooldown filter (+ empty-pool escalate), DM severity dial, `/weather status`.

**Doel:** gevaarlijk weer mag niet te lang blijven hangen én mag niet eindeloos chainen via pure d100-pech, zonder type-namen hard te coderen.

---

## Scope

### In scope
- Optionele per-type duration range in content
- Numeric `severity` per weather entry
- Globale afkoelregel na hoge severity (filter + één roll)
- Precedentie t.o.v. globale env-interval en DM-overrides

### Explicit out of scope (voor nu)
- `allowedFollowups` / per-type next pools
- Wijzigingen aan bestaande migraties (alleen additive ALTER)

---

## Problemen die we oplossen

1. **Duration** — vandaag één globale random interval uit `.env` (`WEATHER_UPDATE_MIN_MINUTES` / `MAX`) voor elk type. Zeldzaam/gevaarlijk weer kan daardoor uren te lang blijven.
2. **Transitions** — unweighted d100 kan severity 5 → severity 5 chainen. Na een zware storm moet het weer “afkoelen”.

---

## 1. Duration (per type)

### Model
Optionele range op de entry die **net current werd** (“hoe lang blijft *dit* weer”):

- `durationMinMinutes`
- `durationMaxMinutes`

Geen aparte `maxDurationMinutes`: `durationMaxMinutes` *is* al leidend.

### Precedentie (hoog → laag)

1. Expliciete DM-duur (`/weather set … duration`, `/weather schedule`) — wint altijd
2. Entry heeft `durationMinMinutes` / `durationMaxMinutes` → random interval in die range
3. Guild `/dm weather-settings menu` → Ritme (SQLite)
4. Anders → globale env (`WEATHER_UPDATE_*_MINUTES`)

Alleen types die van de globale ritme afwijken krijgen duration-velden; de rest valt terug op guild/`.env`.

### Validatie (bij load)
- Beide gezet, of geen van beide
- `durationMinMinutes > 0` en `<= durationMaxMinutes`
- Eenheden: minutes in JSON; intern omzetten naar ms bij schedulen (zelfde helper als guild/`.env`-interval)

### Scheduling-hook
`scheduleNextUpdate` (of equivalent) moet na een roll/set de duration van het **nieuwe** current type gebruiken, niet van het vorige.

Active posting window (`WEATHER_ACTIVE_*`) blijft van toepassing: clamp naar window zoals nu.

---

## 2. Severity

Elke entry in `weather-table.json` krijgt een numeric `severity` (voorstel: 1 = mild … 5 = catastrophic).

Voorbeeld-waarden voor de huidige starter table (aanpasbaar in content, niet in code):

| type | severity (voorstel) |
|---|---|
| clear | 1 |
| cloudy | 1 |
| fog | 1 |
| rain | 2 |
| wind | 2 |
| Clockwork clouds | 2 |
| storm | 4 |
| arcane_storm | 5 |

Content blijft data-driven: geen `if (type === 'arcane_storm')` in services.

---

## 3. Afkoelregel (transitions)

### Regel (één zin)
Na weer met `severity >= 4` mag de volgende **auto-roll** / `/weather roll` alleen resolven naar `severity <= 2`.

Drempels zelf horen in content of een klein rules-blok (niet hardcoded):

```json
{
  "cooldownAfterSeverity": 4,
  "cooldownMaxNextSeverity": 2
}
```

Bestand: `content/weather-rules.json`.

Als de gefilterde pool leeg is (bijv. alleen high-severity types in de table), escaleert de ceiling: probeer ≤2, dan ≤3, dan ≤4, … tot er ≥1 entry is.

### Roll-algoritme — filter, geen reroll-loop

**Niet:** d100 blijven gooien tot het resultaat valid is (bias, retries, lastig te debuggen).

**Wel:**

1. Lees current weather + severity
2. Als `severity >= cooldownAfterSeverity` → filter table tot entries met `severity <= cooldownMaxNextSeverity`
3. Anders → volle table
4. Eén gewogen pick op de gefilterde set (range-breedte behouden, of tijdelijk hernormaliseren naar 1–100)
5. Altijd één valid resultaat

Kansverhoudingen *binnen* de allowed set blijven relatief hetzelfde (brede mild ranges blijven vaker dan smalle).

### Wat de regel wél / niet raakt

| Actie | Afkoelregel? |
|---|---|
| Scheduler auto-update | ja |
| `/weather roll` | ja |
| `/weather set` (type of handmatige d100) | nee — DM mag bewust escaleren |
| `/weather schedule` / `pause` / `resume` | n.v.t. (geen nieuwe weather pick) |

Na een afkoel-roll geldt weer de normale volle table, tenzij het nieuwe weer opnieuw `>= cooldownAfterSeverity` is (zou met max next 2 niet moeten kunnen).

---

## 4. Voorbeeld JSON-shape

Illustratief — niet shippen tot implementatie:

```json
[
  {
    "min": 1,
    "max": 22,
    "type": "clear",
    "image": "clear.png",
    "severity": 1
  },
  {
    "min": 87,
    "max": 94,
    "type": "storm",
    "image": "storm.png",
    "severity": 4,
    "durationMinMinutes": 120,
    "durationMaxMinutes": 360
  },
  {
    "min": 95,
    "max": 100,
    "type": "arcane_storm",
    "image": "arcane_storm.png",
    "severity": 5,
    "durationMinMinutes": 15,
    "durationMaxMinutes": 60
  }
]
```

Mild types zonder duration-velden → globale env-interval.

---

## 5. Interactie met bestaande systemen

- **Active window:** duration-pick eerst, daarna bestaande clamp naar `WEATHER_ACTIVE_*`
- **Forced weather:** `forced` flag blijft; duration volgt precedentieregels hierboven
- **Restart / due guilds:** ongewijzigd — `next_update_at` in het verleden → post + nieuwe schedule op basis van (nieuwe) duration-regels
- **Multi-guild:** per guild eigen `current_weather` / severity voor de filter; content is gedeeld

---

## 6. Later (bewust niet nu)

- **`allowedFollowups`** — optionele override per entry als severity-cooldown niet narratief genoeg is; alleen dan, met duidelijke precedentie t.o.v. severity-filter
- Per-guild duration override via slash command + DB

### DM severity dial — implemented
`/dm weather-settings menu` → Zwaarte-limiet → tijdelijke band op `world_state`; lazy expiry; menu → opheffen; zichtbaar in `/dm weather status`. Roll-volgorde: dial-band → cooldown-filter binnen band → één pick. `/dm weather set` bypass.

---

## 7. Implementatievolgorde (wanneer we bouwen)

1. Types + loader-validatie voor `severity` en optionele duration-velden
2. Rules-config laden (`cooldownAfterSeverity` / `cooldownMaxNextSeverity`)
3. `scheduleNextUpdate` laten kiezen: per-type range of env
4. Roll-pad: filter op severity → één pick; respecteer DM-set bypass
5. Content vullen (severity + duration op zware types)
6. Tests: duration precedentie, cooldown filter, set-bypass, ontbrekende duration → env fallback
7. Korte update in `README.md` / `agent.md` als de feature live is

---

## 8. Non-goals reminder

Blijf binnen projectnon-goals: geen microservices, geen zware abstracties, geen premature generalization. Als content + een paar functies in `WeatherService` genoeg zijn, geen apart “rules engine”.
