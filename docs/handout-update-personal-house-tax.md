# Handout-update: huisbelasting persoonlijke voorraad

Feature is **implemented**. Zie [`feature-personal-house-tax.md`](./feature-personal-house-tax.md), [`feature-guild-resources.md`](./feature-guild-resources.md).

**Handout-status:** verwerken in `docs/handout/index.html` (Voorraad & bouw + Commando’s) en `docs/handout/spelers.html` (Persoonlijke voorraad).

---

## Commands om toe te voegen / aan te passen

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/voorraad persoonlijk toevoegen` | Modal: type + aantal + (als tax aan) checkbox “eigen huis?” (default aan). Bij ≥ drempel + huis: 1 unit naar guild (+ sell-GC), rest privé. Guild vol → alles privé. Stil bericht. | Voorraad | Iedereen |
| `/dm resource menu` | Hub o.a. huisbelasting: `enabled` aan/uit, `threshold` (standaard 7). Lege velden = show. | Voorraad | DM |

---

## Wat Overzicht / Voorraad-tab kort mag zeggen

- Huisbelasting: spelers met eigen huis die genoeg naar privé zetten, dragen 1 unit af aan de guild (+ GC zoals doneren). Pechdagen onder de drempel blijven onbelast.
- Aan/uit + drempel via `/dm resource menu` → Huisbelasting. Guild vol = speler houdt alles.

---

## Speler-handout (`spelers.html`)

**Ja** — tile Persoonlijke voorraad: checkbox huis, drempel, 1 naar guild + GC, guild vol = houden.

## Niet in de handout

- Ledger-action `personal_house_tax`
- Exacte DB-kolommen
