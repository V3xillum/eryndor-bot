# Handout-update: guild resources, buildings & production

Feature is **implemented**. Zie [`agent.md`](./agent.md), [`feature-guild-resources.md`](./feature-guild-resources.md), [`feature-guild-production.md`](./feature-guild-production.md).

**Handout-status:** verwerkt in `docs/handout/index.html` (Overzicht-tile, eigen tab **Voorraad & bouw**, Commando’s, Sessie) + categorieën/concepten in [`handout-agent.md`](./handout-agent.md).

---

## Commands om toe te voegen

### Voorraad (`/resource`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/resource donate` | Modal: grondstof + aantal. Doneer aan de guild-voorraad. Stil bericht. Bot meldt GC (zelf bijhouden). | Voorraad | Iedereen |
| `/resource buy` | Modal: grondstof + aantal. Koop uit de guild-voorraad. Stil bericht. Bot meldt kosten. | Voorraad | Iedereen |
| `/resource stock` | Toon guild-voorraad + opslaglimiet per type (alleen voor jou). | Voorraad | Iedereen |
| `/resource overview` | Alles-in-één (alleen voor jou): guild-voorraad, jouw persoonlijke voorraad, bouwprojecten + voortgang. | Voorraad | Iedereen |
| `/resource personal add` | Modal: type + aantal. Zet iets in je Persoonlijke voorraad. Stil bericht. Geen GC. | Voorraad | Iedereen |
| `/resource personal remove` | Modal: type + aantal. Haal iets uit je Persoonlijke voorraad. Stil bericht. | Voorraad | Iedereen |
| `/resource personal show` | Toon jouw persoonlijke voorraad (alleen voor jou). | Voorraad | Iedereen |
| `/dm resource setup` | Kies het kanaal voor stille voorraad-/bouw-/productieberichten. | Inrichten | DM |
| `/dm resource clear` | Wis die kanaal-setup. | Inrichten | DM |
| `/dm resource-type add` | Nieuw grondstoftype: weergavenaam + sell-GC (+ optioneel buy; default 2× sell). | Voorraad | DM |
| `/dm resource-type edit` | Pas weergavenaam of GC-prijzen aan (interne id blijft). | Voorraad | DM |
| `/dm resource-type remove` | Verwijder type (alleen als nergens meer in gebruik). | Voorraad | DM |
| `/resource type list` | Lijst van types + sell/buy. | Voorraad | Iedereen |
| `/dm resource adjust` | Modal: type + toevoegen/verminderen + aantal. Corrigeer guild-voorraad zonder GC-melding. | Voorraad | DM |
| `/dm resource cap` | Toon of zet de opslaglimiet per type (standaard 300). | Voorraad | DM |

### Bouwen (`/building`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/building deliver` | Modal: project + bron (van buiten / persoonlijke voorraad) + grondstof + aantal. Silent post toont alle materialen. GC = sell. | Bouwen | Iedereen |
| `/building use-guild-stock` | Modal: project + grondstof + aantal. Uit guild-voorraad. Silent post toont alle materialen. | Bouwen | Iedereen |
| `/building contribute` | Modal: project + tijd. GC = tijd × 1. | Bouwen | Iedereen |
| `/building list` | Overzicht bouwprojecten + status. | Bouwen | Iedereen |
| `/building status` | Menu: project → kosten/voortgang. | Bouwen | Iedereen |
| `/building cost show` | Zelfde als status (menu). | Bouwen | Iedereen |
| `/dm building create` | Nieuw project; bouwtijd fase 2 default **100**. | Bouwen | DM |
| `/dm building-cost add` | Modal: project + type + aantal → knop “nog een toevoegen”. | Bouwen | DM |
| `/dm building-cost buildtime` | Modal: project + bouwtijd. Altijd tot voltooid (niet locked na stortingen). | Bouwen | DM |
| `/dm building-cost funding` | Modal: corrigeer gestorte materialen (toevoegen/verminderen, geen GC). | Bouwen | DM |
| `/dm building-cost spent` | Modal: corrigeer bestede tijd in bouwfase (toevoegen/verminderen, geen GC). | Bouwen | DM |
| `/dm building cancel` | Annuleer project; gestorte materialen terug naar voorraad (overflow → persoonlijk). | Bouwen | DM |

### Productie (`/production`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/production list` | Overzicht productiebronnen (medewerkers, opbrengst, interval). | Productie | Iedereen |
| `/dm production add` | Modal: type + interval + naam/medewerkers/opbrengst. | Productie | DM |
| `/dm production workers` | Modal: bron + medewerkers. | Productie | DM |
| `/dm production yield` | Modal: bron + opbrengst. | Productie | DM |
| `/dm production remove` | Verwijder een bron (menu). | Productie | DM |

---

## Wat Overzicht kort mag zeggen

- Één tile: guild-voorraad, bouwprojecten en productiebronnen — DMs richten types/gebouwen/productie in.
- Max één verwijzing naar de tab of `/dm resource setup`.
- Geen how-to op Overzicht.

---

## Eigen tab: Voorraad & bouw

Uitleg voor DMs (geen DB/.env):

1. **Grondstoftypes** — zelf aanmaken met een naam + sell/buy GC; bot houdt GC niet bij, alleen melden.
2. **Guild- vs persoonlijke voorraad** — doneren/kopen vs eigen voorraad.
3. **Opslaglimiet** — standaard 300 **per type**; bij volle opslag: speler-acties → rest persoonlijk; dagelijkse productie → rest **verloren** (zichtbaar in de avondpost ~17:00).
4. **Bouwprojecten** — materialen → bouwtijd → klaar; **deliver** (van buiten *of* persoonlijke voorraad, + GC) vs **use-guild-stock** (guild-voorraad, geen GC); contribute voor tijd.
5. **Productiebronnen** — bijv. Houthakkershut → Hout; opbrengst = medewerkers × opbrengst per medewerker; één stille samenvatting per dag.

---

## Speler-handout (`spelers.html`)

**Ja** — kort: overview/weer/kalender; guild donate/buy + persoonlijke voorraad; bouwen met deliver-bronnen + use-guild-stock + contribute. Geen DM-commands.

## Wat Commando’s / Sessie moeten krijgen

- Categorieën **Voorraad**, **Bouwen**, **Productie** (+ filters).
- Alle commands hierboven.
- Sessie-tiles: type toevoegen; bouwproject starten; productiebron; even voorraad checken.

---

## Niet in de handout

- DB-tabellen, migraties, ledger-internals
- Env-keys (`PRODUCTION_POST_TIME`, …) — zeg “rond 17:00” / “Nederlandse tijd”
- Snowflake / allowlist-uitleg (zeg “aangewezen DM’s”)
