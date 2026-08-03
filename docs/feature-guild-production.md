# Feature: Guild production & storage cap

Passive income from named sources (e.g. Houthakkershut → Hout), plus a simple per-type storage cap for guild stock.

**Status:** implemented (v1).

**Doel:** Elke dag één silent post met alle productie (bron, type, hoeveelheid); overflow door cap bij auto-payout is **verloren** en zichtbaar in die post. Bij speler-acties gaat overflow naar personal stock.

Zie ook: [`feature-guild-resources.md`](./feature-guild-resources.md), [`agent.md`](./agent.md).

---

## Storage cap

- Eén guild-setting `storage_cap` (default **300**).
- Geldt als maximum **per resource type** (Hout ≤ 300 **en** Steen ≤ 300, niet som).
- Gezet via `/resource cap` (allowlist); zichtbaar op `/resource stock`.

### Overflow

| Actie | Bij volle guild-stock |
|---|---|
| Speler (donate, adjust+, building cancel return, …) | Clip naar cap; rest → **personal** van die snowflake |
| Automatische productie | Clip naar cap; rest → **verloren** + regel in dagelijkse post |

---

## Production sources

| Veld | Betekenis |
|---|---|
| `name` | Bron, bv. Houthakkershut |
| `resource_key` | Type dat geproduceerd wordt |
| `workers` | 0 … `max_workers` |
| `max_workers` | Default **5** |
| `yield_per_worker` | Opbrengst per medewerker per interval |
| `interval` | `daily` \| `weekly` |
| `last_paid_period` | Dedup: lokale datum of ISO-week |

Formule: `workers × yield_per_worker`.

---

## Dagelijkse post

- Na `PRODUCTION_POST_TIME` (default `17:00`, `WEATHER_TIMEZONE`), één silent embed op het **resource-kanaal**.
- Zelfde inhaalgedrag als kalenderposts: als de bot later opstart (maar nog dezelfde lokale dag, na de posttijd) en vandaag nog niet gepost is → alsnog. Geen multi-day backlog.
- Bevat alle bronnen die die tick uitbetalen (daily elke dag; weekly op de weekwissel / maandag).
- Per regel: bron, type, hoeveelheid bijgeschreven; als er verloren ging: duidelijk **verloren** + hoeveel.
- Geen bronnen due → geen post.

---

## Commands

| Command | Wie | Effect |
|---|---|---|
| `/production add` | allowlist | Modal: resource + interval + naam/workers/yield (max_workers = default 5) |
| `/production list` | iedereen | Overzicht bronnen |
| `/production workers` | allowlist | Menu + modal |
| `/production yield` | allowlist | Menu + modal |
| `/production remove` | allowlist | Menu |
| `/resource cap [amount]` | allowlist | Zet/toon storage cap |

---

## DB (additive)

```sql
-- resource_settings: storage_cap INTEGER NOT NULL DEFAULT 300
-- resource_settings: production_last_post_date TEXT  -- YYYY-MM-DD local (dedupe daily summary post)

CREATE TABLE IF NOT EXISTS production_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  workers INTEGER NOT NULL DEFAULT 0,
  max_workers INTEGER NOT NULL DEFAULT 5,
  yield_per_worker INTEGER NOT NULL,
  interval TEXT NOT NULL,
  last_paid_period TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

---

## Non-goals (v1)

- Per-type cap overrides (later C)
- Overflow naar personal bij auto-payout
- Verplichte koppeling aan `/building` id
