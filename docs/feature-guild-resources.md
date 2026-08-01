# Feature: Guild resources & buildings

Guild-voorraad van flexibele resource-types (hout, steen, …), publieke donate/buy met GC-melding (spelers houden GC zelf bij), ledger + dagelijkse DM-backup, en gebouwen met twee fasen (materialen → bouwtijd). Meerdere bouwprojecten tegelijk.

**Status:** spec — nog niet geïmplementeerd.

**Doel:** West Marches-tafel kan ontdekte grondstoffen en bouwprojecten in Discord bijhouden zonder aparte spreadsheet, met een audit-trail voor als de SQLite corrupt raakt.

Zie ook: [`agent.md`](./agent.md), Discord [slash commands](https://discord.com/developers/docs/interactions/application-commands), [`MessageFlags.SuppressNotifications`](https://discord.com/developers/docs/resources/message#message-object-message-flags).

---

## Filosofie

- **GC zit niet in de bot.** De bot meldt alleen hoeveel GC iemand ontvangt of moet betalen; spelers houden hun eigen balans bij.
- **Publiek + stil:** donate/buy (en vergelijkbare economy-acties) posten in een geconfigureerd kanaal met `SuppressNotifications` (geen ping/sound), zodat de tafel het kan zien zonder ruis.
- **Flexibele types:** de wereld is nog niet volledig ontdekt → DM voegt types runtime toe, geen hardcoded catalogus in `content/`.
- **Gebouwen = projecten**, niet alleen catalogus: `funding` → `building` → `complete`. Meerdere tegelijk.
- **Time is progress, geen stock-item:** 1 time-unit = 1 GC bij contribute. Geen “time op voorraad”.

---

## Gedrag

### Setup (allowlist)

| Command | Effect |
|---|---|
| `/resource setup channel` | Kanaal voor publieke silent posts (donate/buy/fund/contribute) |
| `/resource clear` | Setup wissen (commands die posten falen tot opnieuw setup) |

Zelfde patroon als `/weather setup` / `/world setup`: per Discord-guild één destination.

### Resource types (allowlist)

| Command | Effect |
|---|---|
| `/resource type add key name sell:[n] [buy]` | Nieuw type. `key` = slash-vriendelijk id (`hout`). `buy` optioneel; default `2 × sell` |
| `/resource type edit key [name] [sell] [buy]` | Aanpassen |
| `/resource type remove key` | Alleen als stock = 0 en niet in actieve building costs/funding |
| `/resource type list` | Alle types + sell/buy |

### Voorraad (iedereen in de guild)

| Command | Effect |
|---|---|
| `/resource donate type amount` | Stock += amount. Publieke silent post + ephemeral bevestiging. GC = `amount × sell` (melding) |
| `/resource buy type amount` | Stock moet ≥ amount. Stock −= amount. Publieke silent post. Kosten = `amount × buy` (melding) |
| `/resource stock` | Overzicht huidige voorraad |
| `/resource adjust type amount` | Allowlist: correctie zonder publieke GC-post (positief/negatief); wél ledger |

`amount` limiet: **1–9999** per command (anti-typo).

### Gebouwen

Create/cost/cancel = allowlist. Fund/donate/contribute/list/status = iedereen in de guild.

| Command | Effect |
|---|---|
| `/building create name` | Nieuw project, status `funding`. Meerdere tegelijk OK |
| `/building cost add name type amount` | Materiaalkost toevoegen/overschrijven. Alleen zolang status `funding` **én** er nog niets is gestort (`building_funding` leeg / alles 0) |
| `/building cost set-time name units` | Time-units voor fase 2. Zelfde restrictie als `cost add` |
| `/building cost show name` | Benodigde materialen + time + voortgang |
| `/building list` | Alle projecten + status |
| `/building fund name type amount` | Uit **guild-stock** → project. Geen extra GC (al beloond bij donate). Silent post |
| `/building donate name type amount` | **Direct** naar project (stock wordt niet aangeraakt). GC = `amount × sell`. Silent post |
| `/building contribute name amount` | Alleen status `building`. `time_spent += amount` (cap op remaining). GC = `amount × 1`. Silent post |
| `/building status [name]` | Detail: missing materials / time left / complete |
| `/building cancel name` | Allowlist. Funding terug naar guild-stock. Ledger `building_cancel`. Geen GC-terugdraai (GC was al “betaald” aan spelers) |

**Fase-overgangen (automatisch bij mutatie):**

1. `funding` → `building` wanneer alle `building_costs` gedekt zijn in funding.
2. `building` → `complete` wanneer `time_spent >= time_required`.
3. `complete`: geen fund/donate/contribute meer.

**Direct donate vs fund:**

- `building donate` = speler brengt materialen “van buiten”; beloning sell-GC; funding += ; stock ongemoeid.
- `building fund` = verplaatsing stock → project; geen GC.

**Costs wijzigen na funding:** verboden via `cost add` / `set-time`. Correcties alleen via allowlist-paden (`adjust` op stock + eventueel cancel/herstart), niet door costs te herschrijven onder een lopend project.

---

## Publieke silent posts

Kanaal: uit `/resource setup`.

Flags: `MessageFlags.SuppressNotifications` (Discord “silent”).

Templates (via `content/messages.json`), o.a.:

```text
{nickname} heeft {amount} {type} gedoneerd. Je ontvangt {gc} GC
{nickname} heeft {amount} {type} gekocht voor {gc} GC
{nickname} heeft {amount} {type} bijgedragen aan {building}. Je ontvangt {gc} GC
{nickname} heeft {amount} {type} uit de voorraad in {building} gestopt
{nickname} heeft {amount} tijd besteed aan {building}. Je ontvangt {gc} GC
```

`{nickname}` = Discord **server nickname** (guild display name), fallback global display name / username.

Ephemeral reply naar de caller: korte bevestiging (succes / fout: te weinig stock, onbekend type, verkeerde fase, geen setup).

---

## GC-regels

| Actie | GC-melding | Stock | Building funding |
|---|---|---|---|
| `donate` (stock) | + `amount × sell` | + | — |
| `buy` | − `amount × buy` (tekst: “voor {gc} GC”) | − | — |
| `building donate` | + `amount × sell` | ongemoeid | + |
| `building fund` | geen | − | + |
| `building contribute` | + `amount × 1` | — | time + |
| `adjust` | geen publieke GC | ± | — |
| `building cancel` | geen | funding terug | project weg / cancelled |

`buy` default bij type-aanmaak: `2 × sell` als niet opgegeven. Mag later via `type edit` afwijken.

Bot slaat **geen** player GC-balans op.

---

## Ledger + status-report backup

Elke mutatie → rij in `resource_ledger` (audit + disaster recovery).

Velden: `id`, `guild_id`, `created_at`, `actor_user_id`, `actor_nickname`, `action` (`donate` \| `buy` \| `adjust` \| `building_donate` \| `building_fund` \| `building_contribute` \| `building_cancel` \| `type_add` \| …), `resource_key` (nullable bij time), `amount`, `gc_delta` (kan 0), `building_id` (nullable), `stock_after` (nullable).

**Dagelijkse backup:** uitbreiding van bestaande status-report DM naar `STATUS_REPORT_USER_ID` (zelfde cadence/time als nu):

- Snapshot: alle resource types + stock quantities per guild
- Open buildings: naam, status, funding progress, time progress
- Ledger sinds vorige report-window: entries in de periode; bij Discord-limiet truncaten met “+N meer”

Doel: als `world.sqlite` corrupt raakt, heb je een recente human-readable backup in DM. Geen tweede database.

---

## DB (additive)

Geen wijziging aan bestaande `CREATE` van `world_state`. Nieuwe tabellen via `CREATE TABLE IF NOT EXISTS`. Geen Database:Refresh.

```sql
CREATE TABLE IF NOT EXISTS resource_settings (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_types (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sell_gc INTEGER NOT NULL,
  buy_gc INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS guild_stock (
  guild_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, resource_key)
);

CREATE TABLE IF NOT EXISTS buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,          -- genormaliseerd voor command lookup
  status TEXT NOT NULL,            -- funding | building | complete | cancelled
  time_required INTEGER NOT NULL DEFAULT 0,
  time_spent INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS building_costs (
  building_id INTEGER NOT NULL,
  resource_key TEXT NOT NULL,
  required_qty INTEGER NOT NULL,
  PRIMARY KEY (building_id, resource_key)
);

CREATE TABLE IF NOT EXISTS building_funding (
  building_id INTEGER NOT NULL,
  resource_key TEXT NOT NULL,
  deposited_qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (building_id, resource_key)
);

CREATE TABLE IF NOT EXISTS resource_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_nickname TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_key TEXT,
  amount INTEGER NOT NULL,
  gc_delta INTEGER NOT NULL DEFAULT 0,
  building_id INTEGER,
  stock_after INTEGER
);
```

Unieke building-namen per guild via `(guild_id, name_key)`.

### Terugdraaien

1. Code: git discard / niet committen.
2. SQLite: tabellen blijven harmloos staan, of `DROP TABLE` per resource/building-tabel. `storage/world.sqlite` staat in `.gitignore`.

---

## Code (gepland)

| Stuk | Rol |
|---|---|
| `src/commands/resource.ts` | Slash resource tree |
| `src/commands/building.ts` | Slash building tree |
| `src/services/ResourceService.ts` | types, stock, donate/buy/adjust, channel setup |
| `src/services/BuildingService.ts` | CRUD project, fund/donate/contribute, fase-overgangen, cancel |
| `src/db/index.ts` | queries |
| `src/services/StatusReportService.ts` | stock/buildings/ledger snapshot in DM |
| `src/register-commands.ts` + `interactionCreate.ts` | wiring |
| `content/messages.json` + `Messages` | NL templates |

Geen scheduler-tick nodig voor bouwprogress (contribution-based, lazy complete bij command). Status-report blijft in bestaande 30s-loop.

Permissions: allowlist alleen voor `setup` / `clear` / `type*` / `adjust` / `building create|cost*|cancel`. Rest: iedereen in de guild (guild-only).

Domain-logica Discord-agnostisch houden waar mogelijk (zelfde scheiding als weather); alleen channel-post + nickname-resolutie raken discord.js.

---

## Non-goals (v1)

- Player GC-balans in DB
- Player-eigen inventory (alleen guild-stock + building funding)
- Hardcoded resource/building catalogus in JSON
- Automatische time-ticks zonder contribute
- Withdraw zonder buy (buy dekt “uit voorraad halen”)
- Costs herschrijven nadat er al funding is

---

## Testplan

1. `npm run register-commands`
2. Allowlist: `/resource setup` + `/resource type add hout Hout sell:1` → buy default 2
3. Speler: `/resource donate hout 7` → stock 7, silent post met nickname + 7 GC, ledger-rij
4. Speler: `/resource buy hout 2` → stock 5, silent post “voor 4 GC”
5. Buy met te weinig stock → ephemeral fout, geen post
6. `/building create Houthakkershut` + costs hout 10 + time 5
7. `/building donate … hout 5` → funding 5, +GC; `/building fund … hout 5` → stock −5, funding vol → status `building`
8. `/building contribute … 5` → complete + 5 GC
9. Tweede building parallel aanmaken terwijl #1 nog funding is
10. `/building cancel` op een funding-project → materialen terug in stock, geen GC-terugdraai
11. Status-report: DM bevat stock snapshot + buildings + ledger sinds vorige window
