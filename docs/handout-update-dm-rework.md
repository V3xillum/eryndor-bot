# Handout-update: DM-handout rework (compact)

**Status:** nog te doen (geen code/HTML-wijziging in deze briefing zelf).

**Doel:** de DM-handout (`docs/handout/index.html`) herzien naar iets rustigs en kort — in de geest van `spelers.html`, maar mét tabs omdat DMs meer oppervlak hebben.

**Waarom nu:** slash-commands zijn samengevoegd tot hubs (`/dm weather-settings menu`, `/dm resource menu`, `/dm building menu`, `/dm production menu`). Lange how-to-tabs en command-kaarten per oude subcommand zijn overbodig geworden. De huidige DM-handout is te druk (Overzicht + types-grid + Voorraad-tab + lange Commando’s + Aanleveren).

**Bot-waarheid:** [`agent.md`](./agent.md) + feature-docs.  
**Stijl / toon:** [`handout-agent.md`](./handout-agent.md) — **dit document overschrijft de tab-structuur** daar (zie § Sync handout-agent).  
**Speler-handout:** `docs/handout/spelers.html` — **niet** herschrijven tenzij footer/links; speler-content blijft zoals die is.

---

## Gewenste tabs (exact 3)

| Tab | Rol |
|---|---|
| **Intro** | Wat doet de bot? Wie mag wat? Korte sessie-cheat. Minimale begrippen. |
| **Setup** | Eenmalig inrichten, in volgorde. Geen how-to van spelersflows. |
| **Commands** | Zoekbare commandlijst — slanker, hubs als één kaart. |

Geen tab **Voorraad & bouw**. Geen tab **Nieuw weertype** (zie hieronder).

---

## Tab 1 — Intro

Korte hero + 1–2 alinea’s / paar tiles. Leesbaar in ~1 scherm.

### Mag erin

- **Wat de bot doet** — automatisch weer; kalenderposts; economy tussen sessies (voorraad / bouw / productie). Tafel speelt, Discord houdt bij.
- **Wie** — spelers: `/eryndor`, `/voorraad`, `/bouw`, `/productie`. DM: alles onder `/dm` (aangewezen DM’s). Link naar speler-handout.
- **Sessie-cheat** (één compacte note):
  - `pause` / `resume` — geen verrassingen mid-combat  
  - `set` — scene-weer (negeert afkoeling/limieten)  
  - `roll` — live dobbelen  
  - Duurcodes één keer: `30m` / `2h` / `1d`  
  - Config: `/dm weather-settings menu`
- **Zwaarte** — max **2 zinnen**: schaal 1–5; zwaar = 4+; daarna afkoeling (eerst milder). Geen grote severity-schaal-grid tenzij heel klein en niet dominant.
- **GC** — bot houdt geen saldo bij; meldt alleen bedragen.
- Optioneel onderaan of in `<details>`: **Nieuw weertype** — checklist (naam, plaatje, zwaarte, magisch?, kans d100, optionele duur). Geen JSON-voorbeeld tenzij achter details. Geen aparte tab.

### Mag er níet in

- Live **weertypes-grid** (catalogus van alle types) — weg
- Lange ritme / berichtenvenster / afkoeling-essays — max één zin + “aanpassen via settings-menu”
- How-to voorraad/bouw/productie (dat is Setup + Commands + Discord-menus)
- Dubbele uitleg van hetzelfde concept op Intro én elders

---

## Tab 2 — Setup

Eenmalige inrichting, **genummerde volgorde**. Alleen wat de DM moet doen; geen spelersflows.

Aanbevolen volgorde:

1. **Weerkanaal** — `/dm weather setup`
2. **Kalenderkanaal** (optioneel) — `/dm calendar setup` / `clear`
3. **Voorraadkanaal** — `/dm resource menu` → Kanaal setup (wissen = zelfde menu)
4. **Grondstoftypes** — `/dm resource menu` → Type toevoegen (sell/buy; buy default 2× sell)
5. **Opslaglimiet / huisbelasting** (optioneel) —zelfde resource-menu
6. **Eerste bouwproject** (optioneel) — `/dm building menu` → Nieuw project → Materiaalkosten → Bouwtijd
7. **Productiebron** (optioneel) — `/dm production menu`

Korte notities toegestaan (1 zin per stap), bijv.:

- Stille berichten (geen ping) op voorraadkanaal  
- Bouw: materialen → uren → klaar; annuleren/correcties via building-menu  
- Productie: samenvatting ~17:00 op voorraadkanaal; overflow bij auto-productie = verloren  
- Speleracties (doneren, leveren, …) → verwijs naar speler-handout, niet hier uitleggen  

Geen 7 how-to-tiles zoals de oude Voorraad-tab.

---

## Tab 3 — Commands

Houd zoek + filters (wie / categorie) als die al werken.

### Principes

- **Hubs = één kaart**, niet één kaart per oude subcommand.
- Per kaart: **wat** + **wanneer** (kort). Geen herhaling van Setup-stappen.
- Spelercommands mogen blijven (filter “iedereen”) — of default-filter op DM; kies wat rustiger leest, documenteer in `handout-agent.md`.
- Sync met echte slash-tree in [`agent.md`](./agent.md) (`/dm … menu`, geen `resource-type` / `building-cost` meer).

### DM-hubs (verplicht aanwezig)

| Command | Categorie | Kort |
|---|---|---|
| `/dm weather-settings menu` | Instellingen | Ritme, venster, afkoeling, zwaarte-limiet, magie-filter, terugzetten |
| `/dm resource menu` | Voorraad | Setup/clear, types, adjust, cap, huisbelasting |
| `/dm building menu` | Bouwen | Create, cancel, kosten, bouwtijd, funding/uren corrigeren |
| `/dm production menu` | Productie | Add, workers, yield, remove |

### Overige DM (los houden — live acties / inrichten)

Weer: `setup`, `status`, `next`, `roll`, `set`, `schedule`, `pause`, `resume`  
Kalender: `setup`, `clear`  
Announce: `schedule`, `list`, `cancel`  
Hulp: `/eryndor hulp`

### Speler (als ze in de lijst blijven)

`/eryndor …`, `/voorraad …`, `/bouw …`, `/productie lijst` — kort houden; detail staat in `spelers.html`.

---

## Visueel / toon

- Zelfde fonts/kleuren/logo-taal als nu / `spelers.html` (Cinzel + Figtree, parchment accent).
- Intro mag dichter bij speler-hero (logo + korte lead).
- Minder tiles, minder notes, geen dashboard-gevoel.
- Mobiel: tabs + leesbare breedte behouden.

---

## Wat weg / vervangen

| Nu | Actie |
|---|---|
| Tab Overzicht (types-grid, severity-blok, ritme-notes) | Vervangen door compacte **Intro** |
| Tab Voorraad & bouw (7 tiles) | **Verwijderen**; kern → Setup |
| Tab Nieuw weertype (+ JSON) | Verplaatsen naar Intro `<details>` of weglaten JSON |
| Oude command-kaarten `resource-type`, `building-cost`, losse production-subs | Al hubs; controleren dat COMMANDS-array klopt |
| Dubbele concept-uitleg | Eén plek: Intro (begrip) of Commands (details) |

---

## Sync `handout-agent.md` (verplicht meenemen)

Pas de sectie **Tabs** aan naar Intro / Setup / Commands. Werk schrijfstijl-per-plek bij:

- **Intro** = oude Overzicht-regels, maar strenger (geen types-grid, geen how-to)
- **Setup** = nieuw — genummerde inrichting, hubs
- **Commands** = hubs + slank
- Verwijder regels die “Voorraad & bouw”-tab of “niet zomaar herschikken” naar 4 tabs verplichten

Conceptenlijst + categorieën mogen blijven; pas voorbeelden aan op `… menu` waar nodig.

---

## Niet in scope

- Speler-handout herschrijven  
- Bot-code / slash-commands / messages.json (tenzij een handout-URL of help-zin nog oude tabs noemt — dan alleen die copy)  
- Feature-docs herschrijven (optioneel later)  
- Database / env / register-commands  

---

## Acceptatiechecklist

- [ ] Exact 3 tabs: Intro, Setup, Commands  
- [ ] Geen weertypes-grid op Intro  
- [ ] Geen aparte Voorraad-tab  
- [ ] Setup is genummerde inrichting met hubs  
- [ ] COMMANDS-array: hubs aanwezig; geen oude `resource-type` / `building-cost` / losse production DM-subs  
- [ ] Link naar `spelers.html` werkt  
- [ ] `handout-agent.md` tabs/stijl bijgewerkt  
- [ ] Desktop + mobiel leesbaar; geen dode JS-refs naar verwijderde panels  

---

## Context voor de agent

Eerdere beslissing in chat: eerst hubs afmaken, daarna DM-handout compact zoals spelers — **nu is die rework**. Hubs staan al in de bot en de huidige `index.html` verwijst al naar `… menu`; deze taak is vooral **structuur + ruis eruit**, niet opnieuw features documenteren.
