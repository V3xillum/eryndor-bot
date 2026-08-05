# Handout-update: guild resources, buildings & production

Feature is **implemented**. Zie [`agent.md`](./agent.md), [`feature-guild-resources.md`](./feature-guild-resources.md), [`feature-guild-production.md`](./feature-guild-production.md).

**Handout-status:** verwerkt in `docs/handout/index.html` (Overzicht-tile, eigen tab **Voorraad & bouw**, Commando’s, Sessie) + categorieën/concepten in [`handout-agent.md`](./handout-agent.md).

---

## Commands om toe te voegen

### Voorraad (`/voorraad`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/voorraad doneren` | Modal: grondstof + aantal. Doneer aan de guild-voorraad. Stil bericht. Bot meldt GC (zelf bijhouden). | Voorraad | Iedereen |
| `/voorraad kopen` | Modal: grondstof + aantal. Koop uit de guild-voorraad. Stil bericht. Bot meldt kosten. | Voorraad | Iedereen |
| `/voorraad guild` | Toon guild-voorraad + opslaglimiet per type (alleen voor jou). | Voorraad | Iedereen |
| `/eryndor overzicht` | Alles-in-één (alleen voor jou): kalender, guild-voorraad, persoonlijke voorraad, bouw + productie. | Bekijken | Iedereen |
| `/voorraad persoonlijk toevoegen` | Modal: type + aantal + (als tax aan) checkbox huis. Bij ≥ drempel + huis: 1 → guild (+ sell-GC), rest privé. Stil bericht. | Voorraad | Iedereen |
| `/voorraad persoonlijk verwijderen` | Tot 5 types tegelijk (aantal per type). Bij >5 in stash: eerst kiezen. Stil bericht. | Voorraad | Iedereen |
| `/voorraad persoonlijk tonen` | Toon jouw persoonlijke voorraad (alleen voor jou). | Voorraad | Iedereen |
| `/voorraad types` | Lijst van types + sell/buy. | Voorraad | Iedereen |
| `/dm resource menu` | Hub: types, adjust, cap, huisbelasting. Kanalen: `/dm setup menu`. | Voorraad | DM |

### Bouwen (`/bouw`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/bouw leveren` | Modal: project + bron (van buiten / persoonlijke voorraad) + grondstof + aantal. Silent post toont alle materialen. GC = sell. | Bouwen | Iedereen |
| `/bouw uit-guild` | Project → tot 5 materialen tegelijk. Uit guild-voorraad. Silent post toont alle materialen. | Bouwen | Iedereen |
| `/bouw meewerken` | Modal: project + tijd. GC = tijd × 1. | Bouwen | Iedereen |
| `/bouw lijst` | Overzicht bouwprojecten + status. | Bouwen | Iedereen |
| `/bouw status` | Menu: project → kosten/voortgang. | Bouwen | Iedereen |
| `/dm building menu` | Hub: create, cancel, materiaalkosten, bouwtijd, funding/uren corrigeren. | Bouwen | DM |

### Productie (`/productie`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/productie lijst` | Overzicht productiebronnen (medewerkers, opbrengst, interval). | Productie | Iedereen |
| `/dm production menu` | Hub: toevoegen, medewerkers, opbrengst, verwijderen. | Productie | DM |

---

## Wat Overzicht kort mag zeggen

- Één tile: guild-voorraad, bouwprojecten en productiebronnen — DMs richten via de drie menu-hubs.
- Max één verwijzing naar de tab of `/dm resource menu`.
- Geen how-to op Overzicht.

---

## Eigen tab: Voorraad & bouw

Uitleg voor DMs (geen DB/.env):

1. **Grondstoftypes** — zelf aanmaken met een naam + sell/buy GC; bot houdt GC niet bij, alleen melden.
2. **Guild- vs persoonlijke voorraad** — doneren/kopen vs eigen voorraad; huisbelasting bij persoonlijk toevoegen (1 unit ≥ drempel + eigen huis).
3. **Opslaglimiet** — standaard 300 **per type**; bij volle opslag: speler-acties → rest persoonlijk; dagelijkse productie → rest **verloren** (zichtbaar in de avondpost ~17:00).
4. **Bouwprojecten** — materialen → bouwtijd → klaar; **leveren** (van buiten *of* persoonlijke voorraad, + GC) vs **uit-guild** (guild-voorraad, geen GC); meewerken voor tijd.
5. **Productiebronnen** — bijv. Houthakkershut → Hout; opbrengst = medewerkers × opbrengst per medewerker; één stille samenvatting per dag.

---

## Speler-handout (`spelers.html`)

**Ja** — kort: `/eryndor overzicht` / weer; guild doneren/kopen + persoonlijke voorraad (huisbelasting); bouwen met leveren-bronnen + uit-guild + meewerken. Geen DM-commands.

## Wat Commando’s / Sessie moeten krijgen

- Categorieën **Voorraad**, **Bouwen**, **Productie** (+ filters).
- Alle commands hierboven.
- Sessie-tiles: type toevoegen; bouwproject starten; productiebron; even voorraad checken.

---

## Niet in de handout

- DB-tabellen, migraties, ledger-internals
- Env-keys (`PRODUCTION_POST_TIME`, …) — zeg “rond 17:00” / “Nederlandse tijd”
- Snowflake / allowlist-uitleg (zeg “aangewezen DM’s”)
