# Feature: Guild resources & buildings

Guild-voorraad van flexibele resource-types (hout, steen, …), publieke donate/buy met GC-melding (spelers houden GC zelf bij), ledger + dagelijkse DM-backup, en gebouwen met twee fasen (materialen → bouwtijd). Meerdere bouwprojecten tegelijk.

**Status:** implemented (v1).

**Doel:** West Marches-tafel kan ontdekte grondstoffen en bouwprojecten in Discord bijhouden zonder aparte spreadsheet, met een audit-trail voor als de SQLite corrupt raakt.

Zie ook: [`agent.md`](./agent.md), [`feature-guild-production.md`](./feature-guild-production.md) (opslaglimiet + productie), Discord [slash commands](https://discord.com/developers/docs/interactions/application-commands), [`MessageFlags.SuppressNotifications`](https://discord.com/developers/docs/resources/message#message-object-message-flags).

---

## Filosofie

- **GC zit niet in de bot.** De bot meldt alleen hoeveel GC iemand ontvangt of moet betalen; spelers houden hun eigen balans bij.
- **Publiek + stil:** donate/buy (en vergelijkbare economy-acties) posten in een geconfigureerd kanaal met `SuppressNotifications` (geen ping/sound), zodat de tafel het kan zien zonder ruis.
- **Flexibele types:** de wereld is nog niet volledig ontdekt → DM voegt types runtime toe via een weergavenaam; interne `key` is een vaste slug daarvan.
- **Gebouwen = projecten**, niet alleen catalogus: `funding` → `building` → `complete`. Meerdere tegelijk.
- **Persoonlijke voorraad:** per Discord-user (snowflake) een aparte voorraad — toevoegen/weghalen voor eigen gebruik; los van guild-donaties. Optioneel huisbelasting: zie [`feature-personal-house-tax.md`](./feature-personal-house-tax.md).

---

## Gedrag

### Setup + types + DM-correcties (allowlist)

Alles via **`/dm resource menu`** (dropdown → channel-picker / modal / bestaande adjust-wizard):

| Menu-optie | Effect |
|---|---|
| Kanaal setup | Kanaal voor publieke silent posts (donate/buy/deliver/use-guild-stock/contribute) |
| Setup wissen | Setup wissen (commands die posten falen tot opnieuw setup) |
| Type toevoegen / bewerken / verwijderen | Zelfde regels als voorheen: `key` = slug van naam; buy default `2 × sell`; remove alleen als stock = 0 en niet in actieve costs/funding/productie |
| Voorraad corrigeren | Modal: type + gewenste stand (absoluut); geen publieke GC-post; overflow → persoonlijk |
| Opslaglimiet | Toon/zet `storage_cap` per type (default 300) |
| Huisbelasting | Toon/zet `enabled` + `threshold` |

Speler-lijst types: `/voorraad types`.

### Voorraad (iedereen in de guild)

| Command | Effect |
|---|---|
| `/voorraad doneren` | Modal: grondstof-dropdown + aantal. Stock += amount. Publieke silent post + ephemeral bevestiging. GC = `amount × sell` (melding) |
| `/voorraad kopen` | Modal: grondstof-dropdown + aantal. Stock moet ≥ amount. Stock −= amount. Publieke silent post. Kosten = `amount × buy` (melding) |
| `/voorraad guild` | Overzicht huidige voorraad (ephemeral) |
| `/eryndor overzicht` | Ephemeral: vandaag + volgende volle maan, guild-voorraad, persoonlijke voorraad, bouwprojecten, productie |
| `/voorraad persoonlijk toevoegen` | Modal: type + aantal + (indien huisbelasting aan) checkbox “eigen huis?” (default aan). Persoonlijke voorraad += rest; bij tax: 1 → guild (+ sell-GC). Publieke silent embed |
| `/voorraad persoonlijk verwijderen` | Modal: tot **5** types tegelijk (aantal per type; leeg = overslaan). Bij >5 types in je stash: eerst multi-select (max 5), daarna amounts. Publieke silent embed. Geen GC |
| `/voorraad persoonlijk tonen` | Eigen persoonlijke voorraad (ephemeral) |

`amount` limiet: **1–9999** per command (anti-typo).

### Gebouwen

Create/cost/cancel/correcties = allowlist via **`/dm building menu`**. leveren / uit-guild / meewerken / lijst / status = iedereen in de guild.

| Command / menu-optie | Effect |
|---|---|
| `/dm building menu` → Nieuw project | Nieuw project, status `funding`. `time_required` default **100** (fase 2). Meerdere tegelijk OK |
| → Materiaalkosten | Project kiezen → tot 5 types selecteren → amounts (leeg = overslaan). Knop “nog een toevoegen” |
| → Bouwtijd | Menu: project → modal bouwtijd (fase 2). Corrigeert de default 100 |
| → Funding corrigeren | Gestorte stand absoluut zetten (0 t/m kost, geen GC) |
| → Uren corrigeren | Bestede uren absoluut zetten (0 t/m bouwtijd, geen GC) |
| → Annuleren | Funding terug naar guild-stock. Ledger `building_cancel`. Geen GC-terugdraai |
| `/bouw lijst` | Alle projecten + statusfase |
| `/bouw status` | Menu: project → detail (materialen / tijd / fase) |
| `/bouw uit-guild` | Project kiezen → tot 5 open materialen tegelijk (amounts; leeg = overslaan). Uit guild-stock. Geen extra GC. Silent post toont voortgang van **alle** materialen |
| `/bouw leveren` | Project → bron (buiten / persoonlijk) → tot 5 materialen tegelijk (≤5 open = direct amounts). GC = sell. Silent post toont alle materialen |
| `/bouw meewerken` | Modal: project + tijd. GC = amount × 1 |

**Fase-overgangen (automatisch bij mutatie):**

1. `funding` → `building` wanneer alle `building_costs` gedekt zijn in funding.
2. `building` → `complete` wanneer `time_spent >= time_required`.
3. `complete`: geen leveren / uit-guild / meewerken meer.

**Direct leveren vs uit-guild:**

- `/bouw leveren` (bron *van buiten*) = speler brengt materialen die de bot nog niet bijhoudt; beloning sell-GC; funding += ; guild- en persoonlijke voorraad ongemoeid.
- `/bouw leveren` (bron *mijn voorraad*) = aftrek uit persoonlijke voorraad; beloning sell-GC; funding += .
- `/bouw uit-guild` = verplaatsing guild-stock → project; geen GC.

**Costs wijzigen na funding:** verboden via `cost add` / `buildtime`. Correcties alleen via allowlist-paden (`adjust` op stock + eventueel cancel/herstart), niet door costs te herschrijven onder een lopend project.

---

## Publieke silent posts

Kanaal: via `/dm resource menu` → Kanaal setup.

Flags: `MessageFlags.SuppressNotifications` (Discord “silent”). Posts are **embeds** (title, description), niet plain text. Bij building deliver / use-guild-stock toont **Voortgang** alle materiaalkosten (`funded / required` per type), niet alleen het type van deze actie.

Templates (via `content/messages.json`) — **description-only** embeds (geen inline field-tabel), o.a.:

```text
{nickname} heeft {amount} {type} gedoneerd.
Je ontvangt {gc} GC voor je bijdrage aan de guild.

Voorraad nu
{stock} {type}
```

`{nickname}` = Discord **server nickname** (guild display name), fallback global display name / username.

Ephemeral reply naar de caller: korte bevestiging (succes / fout: te weinig stock, onbekend type, verkeerde fase, geen setup).

---

## GC-regels

| Actie | GC-melding | Stock | Building funding |
|---|---|---|---|
| `donate` (stock) | + `amount × sell` | + | — |
| `buy` | − `amount × buy` (tekst: “voor {gc} GC”) | − | — |
| `building deliver` (buiten) | + `amount × sell` | ongemoeid | + |
| `building deliver` (persoonlijk) | + `amount × sell` | persoonlijk − | + |
| `building use-guild-stock` | geen | − | + |
| `building contribute` | + `amount × 1` | — | time + |
| `adjust` | geen publieke GC | ± | — |
| `building cancel` | geen | funding terug | project weg / cancelled |
| `personal_house_tax` (via persoonlijk toevoegen) | + `1 × sell` | guild +1 / persoonlijk −1 t.o.v. input | — |

`buy` default bij type-aanmaak: `2 × sell` als niet opgegeven. Mag later via `type edit` afwijken.

Bot slaat **geen** player GC-balans op.

---

## Ledger + status-report backup

Elke mutatie → rij in `resource_ledger` (audit + disaster recovery).

Velden: `id`, `guild_id`, `created_at`, `actor_user_id`, `actor_nickname`, `action` (`donate` \| `buy` \| `adjust` \| `building_donate` \| `building_donate_personal` \| `building_fund` \| `building_contribute` \| `building_cancel` \| `personal_add` \| `personal_house_tax` \| `type_add` \| …), `resource_key` (nullable bij time), `amount`, `gc_delta` (kan 0), `building_id` (nullable), `stock_after` (nullable; bij personal deliver = persoonlijke voorraad na aftrek).

**Huisbelasting:** zie [`feature-personal-house-tax.md`](./feature-personal-house-tax.md) — bij `/voorraad persoonlijk toevoegen` met eigen huis en amount ≥ drempel: 1 unit naar guild (+ sell-GC) als er plek is.

Note: slash-commands heten `leveren` / `uit-guild`; ledger-actions blijven `building_donate*` / `building_fund` (history).

**Dagelijkse backup:** uitbreiding van bestaande status-report DM naar `STATUS_REPORT_USER_ID` (zelfde cadence/time als nu):

- Snapshot: alle resource types + stock quantities per guild (display name + qty; geen key)
- Open buildings: naam, status, funding progress, time progress
- Geen persoonlijke voorraden in de DM (te lang; blijft in `/eryndor overzicht` / `/voorraad`)
- Ledger/usage/issues sinds vorige report-tijd (bijv. daily 10:00→10:00, niet middernacht→10:00); bij Discord-limiet truncaten met “+N meer”

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
-- Additive later: storage_cap, production_last_post_date,
-- house_tax_enabled DEFAULT 1, house_tax_threshold DEFAULT 7
-- (zie feature-personal-house-tax.md / feature-guild-production.md)

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

CREATE TABLE IF NOT EXISTS player_stock (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, resource_key)
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
| `src/commands/resourceWizard.ts` | Modal flows donate/buy/personal (type-select + amount) |
| `src/commands/building.ts` | Slash building tree |
| `src/commands/buildingWizard.ts` | Select-menu flow deliver / use-guild-stock / contribute |
| `src/commands/resourceEmbeds.ts` | Publieke silent embeds |
| `src/services/ResourceService.ts` | types, stock, donate/buy/adjust, channel setup |
| `src/services/BuildingService.ts` | CRUD project, deliver / use-guild-stock / contribute, fase-overgangen, cancel |
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
- Player-eigen building-projecten in de bot (persoonlijke voorraad is geen apart bouw-systeem)
- Hardcoded resource/building catalogus in JSON
- Automatische time-ticks zonder contribute
- Withdraw zonder buy (buy dekt “uit voorraad halen”)
- Costs herschrijven nadat er al funding is

---

## Testplan

1. `npm run register-commands`
2. Allowlist: `/dm resource menu` → Kanaal setup + Type toevoegen (Hout, sell 1) → key `hout`, buy default 2
3. Speler: `/voorraad doneren` → modal (type + aantal, bijv. hout 7) → stock 7, silent post met nickname + 7 GC, ledger-rij
4. Speler: `/voorraad kopen hout 2` → stock 5, silent post “voor 4 GC”
5. Buy met te weinig stock → ephemeral fout, geen post
6. `/dm building menu` → Nieuw project (Houthakkershut) + Materiaalkosten hout 10 + Bouwtijd 5
7. `/bouw leveren` bron *van buiten* hout 5 → funding 5, +GC; of bron *mijn voorraad* als de speler steen heeft → persoonlijk −, funding +, +GC; `/bouw uit-guild … hout 5` → guild-stock −5, funding vol → status `building`
8. `/bouw meewerken … 5` → complete + 5 GC
9. Tweede building parallel aanmaken terwijl #1 nog funding is
10. `/dm building menu` → Annuleren op een funding-project → materialen terug in stock, geen GC-terugdraai
11. Status-report: DM bevat stock snapshot + buildings + ledger sinds vorige window
