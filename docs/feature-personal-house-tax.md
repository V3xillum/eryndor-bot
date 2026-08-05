# Feature: Huisbelasting op persoonlijke voorraad

**Status:** implemented.

**Doel:** Spelers met een eigen huis die genoeg grondstoffen naar hun privé-voorraad zetten, dragen automatisch **1 unit** af aan de guild-voorraad (met sell-GC), zodat gedeelde bouwprojecten meeprofiteren — zonder pechdagen extra te straffen.

Zie ook: [`feature-guild-resources.md`](./feature-guild-resources.md), [`feature-guild-production.md`](./feature-guild-production.md) (storage cap), Discord [Checkbox in modals](https://docs.discord.com/developers/components/reference#checkbox).

---

## Filosofie

- **Honor system, net als GC.** De speler vinkt zelf “eigen huis?” aan; de bot dwingt geen huis-status af in de DB.
- **Vaste tax van 1 unit boven de drempel**, niet `floor(amount / N)`. Een werkdag is typisch ≤8 uur + dobbel (−3…+2); pech (bijv. 5 stuks) mag niet extra belasten.
- **Zelfde beloning als doneren** voor die ene unit: `1 × sell_gc` (speler houdt GC zelf bij).
- **Guild vol → speler houdt alles.** Geen silent lose; zelfde cap-pad als donatie-overflow (`addGuildStockCapped`).
- **Aan/uit + drempel per guild**, zodat DMs het kunnen uitzetten of tunen zonder code.

---

## Gedrag

### Wanneer geldt de tax?

Alle voorwaarden tegelijk:

1. Guild-setting `house_tax_enabled` = aan  
2. Speler vinkt **“Heb je een eigen huis?”** aan (default **aan** in de modal)  
3. Ingevoerd `amount` ≥ `house_tax_threshold` (default **7**)

Dan:

| Bestemming | Aantal | GC |
|---|---|---|
| Guild-voorraad | 1 (als er plek is) | `+ sell_gc` |
| Persoonlijke voorraad | `amount − 1` (of `amount` als guild vol) | — |

Guild vol (geen room voor die 1): **geen** tax, **geen** GC, alles naar persoonlijk. Silent post vermeldt dat kort.

Checkbox uit = geen huis = geen tax, ongeacht aantal.

Feature uit (`enabled: false`): modal zonder checkbox; gedrag = oude `personal_add` (alles privé, geen GC).

### Commands

| Command | Wie | Effect |
|---|---|---|
| `/voorraad persoonlijk toevoegen` | iedereen | Modal: type + aantal + (indien tax aan) checkbox huis. Silent embed + ephemeral |
| `/dm resource house-tax` | allowlist | Toon of zet `enabled` / `threshold`. Zonder opties = show |

`threshold`: geheel getal **1–9999**. Minstens één van `enabled` / `threshold` bij set; anders show.

### Publieke silent post

Zelfde kanaal als overige voorraadposts (`/dm resource setup`), `SuppressNotifications`.

- Geen tax: bestaande tekst (alles privé).
- Tax betaald: persoonlijk aantal + regel huisbelasting (1 naar guild + GC) + stock-regels.
- Tax geprobeerd maar guild vol: alles privé + korte “opslag vol”-noot.

### Ledger

| Actie | Wanneer |
|---|---|
| `personal_add` | Altijd voor het deel dat naar privé gaat (`amount` of `amount − 1`) |
| `personal_house_tax` | Alleen als 1 unit in guild landde; `gc_delta = sell_gc`, `stock_after` = guild stock |

---

## DB (additive)

Op `resource_settings` (geen Database:Refresh; `ALTER` voor bestaande DBs):

```sql
-- defaults: enabled on, threshold 7
house_tax_enabled INTEGER NOT NULL DEFAULT 1;   -- 0/1
house_tax_threshold INTEGER NOT NULL DEFAULT 7;
```

---

## Buiten scope

- Permanente “heeft huis”-flag per speler in de DB  
- Progressieve tax (`floor(amount / 7)`)  
- Tax op `/voorraad doneren`, `/bouw leveren`, of productie  
- Buy-prijs of andere economy-wijzigingen  

---

## Handouts

- Speler: `docs/handout/spelers.html` — persoonlijke voorraad + huisbelasting kort  
- DM: `docs/handout/index.html` — command + Voorraad-tab  
- Briefing: [`handout-update-personal-house-tax.md`](./handout-update-personal-house-tax.md)  
