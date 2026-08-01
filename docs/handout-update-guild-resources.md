# Handout-update: guild resources, buildings & production

Feature is **implemented**. Zie [`agent.md`](./agent.md), [`feature-guild-resources.md`](./feature-guild-resources.md), [`feature-guild-production.md`](./feature-guild-production.md).

**Handout-status:** verwerkt in `docs/handout/index.html` (Overzicht-tile, eigen tab **Voorraad & bouw**, Commando’s, Sessie) + categorieën/concepten in [`handout-agent.md`](./handout-agent.md).

---

## Commands om toe te voegen

### Voorraad (`/resource`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/resource donate` | Doneer grondstoffen aan de guild-voorraad. Stil bericht in het voorraadkanaal. Bot meldt hoeveel GC je ontvangt (zelf bijhouden). | Voorraad | Iedereen |
| `/resource buy` | Koop uit de guild-voorraad. Stil bericht. Bot meldt hoeveel GC het kost. | Voorraad | Iedereen |
| `/resource stock` | Toon guild-voorraad + opslaglimiet per type. | Voorraad | Iedereen |
| `/resource personal add` | Zet iets in je persoonlijke bak. Stil bericht. Geen GC. | Voorraad | Iedereen |
| `/resource personal remove` | Haal iets uit je persoonlijke bak. Stil bericht. | Voorraad | Iedereen |
| `/resource personal show` | Toon jouw persoonlijke voorraad (alleen voor jou). | Voorraad | Iedereen |
| `/resource setup` | Kies het kanaal voor stille voorraad-/bouw-/productieberichten. | Inrichten | DM |
| `/resource clear` | Wis die kanaal-setup. | Inrichten | DM |
| `/resource type add` | Nieuw grondstoftype: weergavenaam + sell-GC (+ optioneel buy; default 2× sell). | Voorraad | DM |
| `/resource type edit` | Pas weergavenaam of GC-prijzen aan (interne id blijft). | Voorraad | DM |
| `/resource type remove` | Verwijder type (alleen als nergens meer in gebruik). | Voorraad | DM |
| `/resource type list` | Lijst van types + sell/buy. | Voorraad | Iedereen |
| `/resource adjust` | Corrigeer guild-voorraad zonder GC-melding (positief of negatief). | Voorraad | DM |
| `/resource cap` | Toon of zet de opslaglimiet per type (standaard 300). | Voorraad | DM |

### Bouwen (`/building`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/building donate` | Menu: project → grondstof → modal. Silent post toont alle materialen. GC = sell. | Bouwen | Iedereen |
| `/building fund` | Menu: project → grondstof → modal. Uit guild-voorraad. Silent post toont alle materialen. | Bouwen | Iedereen |
| `/building contribute` | Menu: project → modal tijd. GC = tijd × 1. | Bouwen | Iedereen |
| `/building list` | Overzicht bouwprojecten + status. | Bouwen | Iedereen |
| `/building status` | Menu: project → kosten/voortgang. | Bouwen | Iedereen |
| `/building cost show` | Zelfde als status (menu). | Bouwen | Iedereen |
| `/building create` | Nieuw project; bouwtijd fase 2 default **100**. | Bouwen | DM |
| `/building cost add` | Menu: project → modal type+aantal → “nog een toevoegen”. | Bouwen | DM |
| `/building cost buildtime` | Menu: project → modal bouwtijd (fase 2). | Bouwen | DM |
| `/building cancel` | Annuleer project; gestorte materialen terug naar voorraad (overflow → persoonlijk). | Bouwen | DM |

### Productie (`/production`)

| Command | Wat het doet (DM-taal) | Categorie | Wie |
|---|---|---|---|
| `/production list` | Overzicht productiebronnen (medewerkers, opbrengst, interval). | Productie | Iedereen |
| `/production add` | Nieuwe bron (menu: type → dagelijks/wekelijks → naam/medewerkers/opbrengst). | Productie | DM |
| `/production workers` | Zet aantal medewerkers (menu → modal). | Productie | DM |
| `/production yield` | Zet opbrengst per medewerker (menu → modal). | Productie | DM |
| `/production remove` | Verwijder een bron (menu). | Productie | DM |

---

## Wat Overzicht kort mag zeggen

- Één tile: guild-voorraad, bouwprojecten en productiebronnen — DMs richten types/gebouwen/productie in.
- Max één verwijzing naar de tab of `/resource setup`.
- Geen how-to op Overzicht.

---

## Eigen tab: Voorraad & bouw

Uitleg voor DMs (geen DB/.env):

1. **Grondstoftypes** — zelf aanmaken met een naam + sell/buy GC; bot houdt GC niet bij, alleen melden.
2. **Guild- vs persoonlijke voorraad** — doneren/kopen vs eigen bak.
3. **Opslaglimiet** — standaard 300 **per type**; bij volle opslag: speler-acties → rest persoonlijk; dagelijkse productie → rest **verloren** (zichtbaar in de avondpost ~17:00).
4. **Bouwprojecten** — materialen → bouwtijd → klaar; donate vs fund; contribute voor tijd.
5. **Productiebronnen** — bijv. Houthakkershut → Hout; opbrengst = medewerkers × opbrengst per medewerker; één stille samenvatting per dag.

---

## Wat Commando’s / Sessie moeten krijgen

- Categorieën **Voorraad**, **Bouwen**, **Productie** (+ filters).
- Alle commands hierboven.
- Sessie-tiles: type toevoegen; bouwproject starten; productiebron; even voorraad checken.

---

## Niet in de handout

- DB-tabellen, migraties, ledger-internals
- Env-keys (`PRODUCTION_POST_TIME`, …) — zeg “rond 17:00” / “Nederlandse tijd”
- Snowflake / allowlist-uitleg (zeg “aangewezen DM’s”)
