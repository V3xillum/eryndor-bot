# Feature: Guild weather table (DB + wizard)

Per-guild d100-weertabel beheerbaar via `/dm`, met types + range-segmenten in SQLite, optionele image-upload, en een switchbare bron (`json` | `db`).

**Status:** planned — nog niet gebouwd.

**Doel:** DMs kunnen weertypes (naam, plaatje, severity, magical, duration) en d100-ranges zelf beheren zonder de repo te editen of de bot te herstarten, terwijl `content/weather-table.json` de shipped default blijft.

Zie ook: [`agent.md`](./agent.md) (content-format + roll-pool), [`feature-weather-severity-duration.md`](./feature-weather-severity-duration.md), [`feature-weather-magical-dial.md`](./feature-weather-magical-dial.md), Discord [slash commands](https://discord.com/developers/docs/interactions/application-commands) (o.a. attachment option type), [message components](https://discord.com/developers/docs/interactions/message-components).

---

## Filosofie

- **JSON blijft de default-bron.** Geen verplichte migratie; bestaande guilds blijven op `content/weather-table.json` tot een DM expliciet naar DB schakelt.
- **Types ≠ segmenten.** Catalogus (naam, image, severity, …) is los van d100-coverage. Eén type kan meerdere segmenten hebben (gat in het midden).
- **Nieuwe range is leidend.** Overlappende segmenten worden ingekort of gesplitst; de geclaimde range wint altijd.
- **Gaten vallen op een default-type** (guild-instelling, meestal `clear`), maar blijven in de UI zichtbaar als “ongeclaimd” — niet alsof het bewuste clear-segmenten zijn.
- **Geen bidirectionele sync.** DB schrijft niet terug naar JSON in de repo. Switch = welke bron `getTable(guildId)` leest.
- **Seed = 1:1 JSON.** Geen aparte “minimal” of productie-only seed in v1. De huidige `weather-table.json` (inclusief placeholder-types) is de bootstrap; opschonen gebeurt later via wizard of door JSON te wijzigen + opnieuw te seed’en.
- Images: defaults uit `content/images/`; custom uploads downloaden naar disk onder `storage/` (mee migreren met `world.sqlite`). Geen Discord-CDN-URL als permanente bron.

---

## Scope

### In scope (v1)

- Per-guild bronflag: `json` | `db`
- Tabellen: weather types + range segmenten + default-type voor gaten
- Seed **1:1** uit `content/weather-table.json` bij eerste `source:db` zonder data; expliciete `seed` voor reset
- Interval-cutting: nieuwe range knipt/splitst bestaande segmenten (inclusieve integers 1–100)
- Adjacent merge van segmenten met hetzelfde type
- Default-type vult gaten bij roll (impliciet), wizard toont gaten apart
- Type CRUD: add / edit / remove (met guards)
- Range claim via wizard of slash (min–max + type); preview vóór commit
- Image: attachment op slash → bot downloadt → lokaal pad opslaan
- `getTable(guildId)` → zelfde `WeatherTableEntry[]`-shape als nu, zodat dials / cooldown / weighted pick ongewijzigd blijven
- Overzicht 1–100 in ephemeral embed (**tekstuele segmentenlijst** in v1)
- `/dm weather set` accepteert interne `key` én `display_name` (case-insensitive, zoals resources)
- Allowlist + `/dm` only
- NL strings in `content/messages.json`
- Handout-update (apart `handout-update-*.md` bij implementatie)

### Explicit out of scope (v1)

- Terugschrijven naar `weather-table.json`
- Mergen van JSON + DB in één roll
- Image-BLOB in SQLite (pad op disk is genoeg)
- Per-regio / seizoenstabellen
- Speler-zichtbare tabel
- “Minimal seed” / productie-only seed (alleen clear + clockwork) — later handmatig of via JSON-edit + re-seed
- Compacte Unicode-balk in `show` (later optioneel)
- Materialize-gaten-commando (gaten → echte segmenten) — later
- Automatische “materialiseer alle gaten tot echte segmenten” bij elke edit
- Database:Refresh / bestaande migraties herschrijven (alleen additive)

---

## Datamodel

### Bron per guild

Op `world_state` (additive ALTER):

```sql
ALTER TABLE world_state ADD COLUMN weather_table_source TEXT; -- NULL | 'json' | 'db'
-- NULL of 'json' = content/weather-table.json (huidig gedrag)
-- 'db' = guild tables hieronder
```

Optioneel later: `weather_default_type_key` op settings-tabel i.p.v. world_state — v1 mag op de settings-tabel hieronder.

### Types + segmenten

```sql
CREATE TABLE IF NOT EXISTS weather_types (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,                 -- vaste slug (zoals resource_types.key)
  display_name TEXT NOT NULL,        -- weergavenaam / post-titel (`type` in WeatherTableEntry)
  image_path TEXT NOT NULL,          -- relatief: content/images/… of storage/weather-images/<guild>/…
  severity INTEGER NOT NULL,
  magical INTEGER NOT NULL,          -- 0 | 1
  duration_min_minutes INTEGER,      -- beide null of beide gezet
  duration_max_minutes INTEGER,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS weather_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  type_key TEXT NOT NULL,
  min_roll INTEGER NOT NULL,         -- 1–100 inclusive
  max_roll INTEGER NOT NULL,
  CHECK (min_roll >= 1 AND max_roll <= 100 AND min_roll <= max_roll)
);

CREATE TABLE IF NOT EXISTS weather_table_settings (
  guild_id TEXT PRIMARY KEY,
  default_type_key TEXT NOT NULL,    -- vult gaten bij resolve; moet bestaan in weather_types
  updated_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_segments_guild
  ON weather_segments (guild_id, min_roll, max_roll);
```

Geen Database:Refresh. `storage/world.sqlite` + `storage/weather-images/` staan buiten de repo (gitignore); bij host-wissel beide meenemen.

### Mapping naar bestaande roll-logica

`getTable(guildId)` bouwt een array van `WeatherTableEntry`:

| DB | `WeatherTableEntry` |
|---|---|
| segment.min_roll / max_roll | `min` / `max` |
| type.display_name | `type` (zoals nu in posts / `current_weather_type`) |
| type.image_path → resolve | `image` (filename of pad dat `AttachmentBuilder` aankan) |
| type.severity / magical / duration | zelfde velden |

**Gaten:** elk aaneengesloten ongeclaimd interval `[a,b]` wordt virtueel toegevoegd als entry met het default-type (zelfde weight-regels). Virtuele segmenten worden **niet** in `weather_segments` gezet tenzij een latere “materialize”-actie dat doet.

`findEntryByType` / `/dm weather set <name>`: lookup op `display_name` of `key` (case-insensitive, projectpatroon zoals resources). Meerdere segmenten met hetzelfde type → eerste type-record; set forceert type, niet een specifiek segment.

---

## Range-algoritme (“nieuwe post is leidend”)

Inclusieve integers. Nieuwe claim `[A, B]` voor `type_key`:

1. Voor elk bestaand segment `[L, R]`:
   - geen overlap → ongemoeid
   - volledig binnen `[A,B]` → verwijderen
   - overlap links: behoud `[L, A-1]` als `L < A`
   - overlap rechts: behoud `[B+1, R]` als `R > B`
   - nieuwe range middenin: split in `[L, A-1]` + `[B+1, R]`
2. Insert nieuw segment `[A, B]` → `type_key`
3. **Adjacent merge:** opeenvolgende segmenten met dezelfde `type_key` en `max+1 == next.min` samenvoegen
4. Validatie: `1 ≤ A ≤ B ≤ 100`; type bestaat

### Voorbeelden

| Start | Claim | Resultaat |
|---|---|---|
| clear `1–25` | fog `20–25` | clear `1–19`, fog `20–25` |
| clear `1–25` | fog `10–15` | clear `1–9`, fog `10–15`, clear `16–25` |
| clear `1–25`, rain `26–40` | fog `20–30` | clear `1–19`, fog `20–30`, rain `31–40` |
| (leeg / alleen gaten) | storm `87–94` | storm `87–94`; `1–86` + `95–100` → default |

Off-by-one: bij fog `20–25` wordt clear **`1–19`**, niet `1–20`.

### Delete segment / type

- Segment delete → dat interval wordt gat (default vult bij roll). UI toont ongeclaimd.
- Type remove: **weigeren** zolang er segmenten naar verwijzen, of cascade + gaten (v1: weigeren is simpeler).
- Default-type mag niet verwijderd worden terwijl het als default staat; eerst andere default zetten.
- Als `current_weather_type` naar een verwijderd display_name wijst: status toont “onbekend”; volgende roll/set herstelt. Soft warning bij remove als current matcht.

---

## Bron wisselen

| Actie | Effect |
|---|---|
| `source:json` (default) | Negeert DB-tabel voor rolls; wizard CRUD: “schakel eerst naar db” |
| `source:db` zonder data | **Auto-seed 1:1** uit huidige `weather-table.json` (alle entries, inclusief placeholders) |
| `source:db` met data | Gebruikt bestaande types/segmenten; geen automatische re-seed |
| Terug naar `json` | DB blijft staan (ongebruikt); rolls weer uit JSON. Custom images blijven op disk |
| `/dm weather-table seed` | Alleen bij bron `db`: overschrijft types+segmenten+default opnieuw 1:1 vanuit JSON (**bevestigingsknop** verplicht) |

### Seed-regels (vastgelegd)

1. **1:1 kopie** van `content/weather-table.json` → `weather_types` + `weather_segments`. Geen filter, geen minimal variant in v1.
2. Elke JSON-entry → één type (`key` = slug van `type`; `display_name` = `type` zoals in JSON) + één segment (`min`/`max`).
3. `image_path` wijst naar `content/images/<image>` (geen kopie naar `storage/` bij seed).
4. **Default-type:** `clear` als die in de geseede types zit; anders eerste type met `severity === 1` en `magical === false`; anders het eerste type.
5. Seed is **bootstrap / test**, geen claim dat de tabel “canon” is. De huidige JSON bevat placeholders naast echte kaarten (o.a. clear, Clockwork clouds); opschonen = wizard of JSON wijzigen + `seed`.
6. Nooit automatisch seeden bij botstart of bij elke `source:db` als er al data is.

Geen merge van JSON-wijzigingen in de repo naar een actieve DB-tabel (DM moet opnieuw seed’en als ze dat willen).

---

## Images

### Defaults (seed)

`image_path` = pad relatief t.o.v. projectroot of convention `content/images/<file>` zoals nu. `resolveImagePath` / post-pad moet beide aan: content-defaults én storage-customs.

### Upload (DM)

1. Slash optie type **attachment** (Discord [Application Command Option Type](https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type) `ATTACHMENT`)
2. Bot downloadt de CDN-URL naar `storage/weather-images/<guild_id>/<key>.<ext>`
3. Slaat pad op in `weather_types.image_path`
4. Toegestane types: png/jpg/webp (en eventueel gif); max size redelijk (bv. Discord-limiet of strenger, documenteer in messages)

Modals kunnen **geen** attachments; dus: type-add/edit met image = slash (+ optioneel daarna modal voor tekstvelden), of slash met alle scalars + attachment in één command.

Bot host = machine waar het process draait (nu vaak laptop). Uploads belanden daar; bij verhuizen: `storage/` meenemen.

---

## Commands (voorstel)

Alles onder `/dm`, allowlist. Exacte namen mogen bij implementatie aansluiten op bestaande groep-limieten (Discord max subcommand groups).

| Command | Effect |
|---|---|
| `/dm weather-table source` | `json` \| `db` — zet bron; eerste `db` zonder data → auto-seed 1:1 |
| `/dm weather-table show` | Ephemeral tekstlijst: bron, default-type, segmenten 1–100, gaten als “ongeclaimd → {default}” |
| `/dm weather-table seed` | (alleen `db`) Reset 1:1 vanuit JSON met bevestigingsknop |
| `/dm weather-table default` | Zet `default_type_key` |
| `/dm weather-table type add` | naam, severity, magical, [duration], [attachment] |
| `/dm weather-table type edit` | key/naam + te wijzigen velden + optioneel nieuw plaatje |
| `/dm weather-table type remove` | Guards: geen segmenten, niet default, warn als current |
| `/dm weather-table type list` | Catalogus zonder ranges |
| `/dm weather-table claim` | `min` `max` `type` — knipt; toont preview (oud → nieuw) + bevestig-knop |
| `/dm weather-table clear-range` | `min` `max` — verwijdert segment-coverage → gaten (default) |

Wizard-stijl (zoals building/resource): waar dropdowns helpen (type kiezen, bevestigen), components met vaste `customId`-prefix (bv. `wtbl:`).

### Show-overzicht (voorbeeldtekst)

```text
Bron: database · Default bij gaten: clear

1–19    clear
20–25   fog          ← net geclaimd
26–42   cloudy
43–58   (ongeclaimd → clear)
…
87–94   storm
95–100  arcane_storm
```

Bij `claim`: ephemeral preview vóór commit:

```text
fog claimt 20–25
clear 1–25  →  clear 1–19
[Bevestigen] [Annuleren]
```

---

## Service-laag

Discord-agnostisch houden (zelfde scheiding als `WeatherService`):

- `getTable(guildId): WeatherTableEntry[]` — JSON of DB+default-gaten
- `getTableSource(guildId)` / `setTableSource`
- `listTypes` / `addType` / `editType` / `removeType`
- `claimRange` / `clearRange` / `listSegments` / `setDefaultType`
- `seedFromJson` / image download helper in commands of kleine util

`WeatherService` stopt met één `readonly table` bij constructie; per call `getTable(guildId)` (of korte cache invalidation na mutaties).

Roll-order blijft: severity dial → magical dial → cooldown → weighted pick. `/dm weather set` blijft bypass.

Lege pool door dials: zelfde reject-gedrag als nu. Default-gaten tellen mee in de pool (ze hebben severity/magical van het default-type).

---

## Validatie

| Regel | Moment |
|---|---|
| Ranges 1–100, min ≤ max | claim / clear-range |
| Type bestaat | claim, default set |
| severity ≥ 1 integer; magical boolean | type add/edit |
| duration beide of geen | type add/edit |
| Image-bestand bestaat na download/seed | type add/edit / seed |
| Bron `db` vereist minstens één type + default | set source / seed |
| Geen overlap in opgeslagen segmenten na claim | invariant na algoritme |
| Adjacent merge | na elke claim/clear/seed |

Gaten zijn toegestaan in DB; volledige 1–100-dekking is **niet** verplicht zolang default bestaat.

---

## Code (verwachte plekken)

| Stuk | Rol |
|---|---|
| `src/db/index.ts` | additive schema + CRUD |
| `src/services/WeatherTableService.ts` (nieuw) of uitbreiding `WeatherService` | types/segmenten/source/seed/resolve |
| `src/content/loader.ts` | JSON load + validate blijft; shared `WeatherTableEntry` helpers |
| `src/commands/dm.ts` + nieuw command/wizard-bestand | slash + components |
| `src/services/SchedulerService.ts` | image resolve via guild table path |
| `content/messages.json` | NL UI |
| `storage/weather-images/` | custom uploads (gitignore) |

---

## Testplan

1. Guild op `json`: `/dm weather roll` identiek aan huidige starter-tabel.
2. `/dm weather-table source db` (lege DB) → auto-seed 1:1; `show` toont **dezelfde** ranges/types als JSON (nu o.a. clear `1–22` … arcane_storm `95–100`); default = `clear`.
3. Claim fog `20–25` over clear → clear wordt `1–19` (off-by-one); preview klopt vóór bevestigen.
4. Claim die een type middenin splitst → twee segmenten van hetzelfde type; adjacent merge niet over vreemd type heen.
5. Verwijder een segment → gat; roll in dat interval → default-type; `show` toont ongeclaimd.
6. Type add + attachment → bestand onder `storage/weather-images/<guild>/`; `/dm weather set` (key of display_name) post dat plaatje.
7. Severity/magical dials werken op DB-tabel; lege dial-pool blijft reject.
8. Terug naar `source json` → weer JSON; DB-data intact; opnieuw `db` zonder seed → oude custom tabel.
9. `seed` met bevestiging overschrijft custom terug naar **huidige** JSON 1:1.
10. Bot restart: custom images + DB-segmenten blijven (sqlite + storage map).
11. Tweede `source db` op guild die al data heeft → geen stille re-seed.

---

## Handout (bij implementatie)

Apart `docs/handout-update-weather-table-db.md` + update `docs/handout/index.html` volgens [`handout-agent.md`](./handout-agent.md):

- DM-sectie: bron json/db, show, claim leidend, default voor gaten, type+plaatje
- Geen speler-handout (spelers zien alleen geposte kaarten)
- Geen env/DB-jargon in de handout; wél “plaatje uploaden” en “overzicht 1–100”

---

## Beslissingen (vastgelegd)

| Onderwerp | Keuze |
|---|---|
| Seed-inhoud | **1:1** huidige `weather-table.json` (placeholders inbegrepen) |
| Auto-seed | Ja bij eerste `source:db` zonder data |
| Reset | `/dm weather-table seed` + bevestiging |
| Default na seed | `clear` als aanwezig, anders fallback hierboven |
| `/dm weather set` | Interne `key` én `display_name` |
| `show` UI v1 | Alleen tekstlijst (geen Unicode-balk) |
| Materialize gaten | Niet in v1 |
| Minimal/productie-seed | Niet in v1 |
