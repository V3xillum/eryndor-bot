# Handout agent — Eryndor bot DM-handout

Regels voor agents (en mensen) die de handouts bijwerken:

- DM: [`docs/handout/index.html`](./handout/index.html)
- Speler: [`docs/handout/spelers.html`](./handout/spelers.html)

**Bot-waarheid** (commands, data, gedrag) = [`agent.md`](./agent.md) + feature-docs.
**Handout-stijl** (toon, structuur, wat wél/niet uitleggen) = **dit bestand**.
Structuur-rework (2 tabs): [`handout-update-dm-rework.md`](./handout-update-dm-rework.md).

GitHub Pages serveert de map `/docs`; DM-handout: `/handout/` · speler-handout: `/handout/spelers.html`. Logo: `docs/handout/eryndor-logo.jpg`. Speler-URL in de bot = `HANDOUT_URL` + `spelers.html` (zie `playerHandoutUrl` in config); `/eryndor hulp` voor niet-DM’s linkt daarnaartoe.

---

## Doel

Een **DM-handout** in het Nederlands: wat de bot op Discord doet, korte startchecklist, en welke slash-commands er zijn (hubs als één kaart). Optioneel: checklist voor een nieuw weertype (geen catalogus, geen JSON).

Een **speler-handout** (`spelers.html`): kort, campaign-taal, geen tech — wat *jij* op Discord kunt doen (info, voorraad, meebouwen). Geen DM-commands, geen setup, geen allowlist.

Beide handouts linken naar elkaar (footer / hero).

**Framing:** Discord-first (West Marches / RP op Discord). Live tafel is een uitzondering → alleen relevant voor weer pauzeren. Niet schrijven alsof Discord “tussen sessies” is.

---

## Speler-handout (`spelers.html`)

### Wat erin hoort
- **Even kijken** — `/eryndor overzicht` als default; daaronder `<details>` “Bekijk losse commando’s” met alleen guild / bouw lijst|status / productie lijst (geen persoonlijk tonen — die staat verderop; weer + kalender blijven aparte tiles)
- **Guild-voorraad** — doneren / kopen / persoonlijke voorraad (toevoegen|verwijderen|tonen); GC zelf bijhouden; opslaglimiet + overflow → persoonlijk
- **Meebouwen** — leveren (bronkeuze), uit-guild, meewerken
- Korte tip onderaan bij **Snel terugvinden**: slash-zoeken in Discord (`/toe`, `/voor`, …); plus `/eryndor hulp` + formulieren met dropdowns

### Deliver-bronnen (vaste uitleg)
Bij `/bouw leveren` altijd **beide** bronnen noemen:

| Bron in Discord | Campaign-taal | GC | Voorraad |
|---|---|---|---|
| Van buiten | Net gehakt/gevonden; bot hield het nog niet bij | + sell | onaangeroerd |
| Mijn voorraad | Uit je persoonlijke voorraad | + sell | persoonlijk − |

`/bouw uit-guild` = alleen uit de **guild**-voorraad, **geen** GC. Niet door elkaar halen.

### Wat er níet in hoort
- `/dm …`, setup, types aanmaken, costs, cancel, adjust, cap zetten
- Env-keys, DB, ledger-actions, “ephemeral”, silent-flags
- Lange command-tabellen of DM-how-to

### Toon
- Alsof je een Discord-DM uitlegt, niet een developer (en niet alsof Discord “naast de tafel” hangt)
- Slash-commands wél exact (`/bouw leveren`)
- Termen: **persoonlijke voorraad** (niet “bak”), **guild-voorraad**, **Guild Credits (GC)**
- Zelfde visuele taal als de DM-handout (fonts/kleuren/logo) mag; geen tabs nodig — één scrollbare pagina

### Sync
Speler-facing gedrag wijzigt → **beide** handouts + help-tekst (`helpEveryoneBody` / speler-help embed) meenemen. DM-only wijzigingen → alleen `index.html` (+ dit bestand / briefing). Help-link naar DM-handout (`helpEmbedDescription`) mag geen catalogus van weertypes beloven.

---

## Taal

| Wel | Niet |
|---|---|
| Nederlands voor uitleg | Engelse jargon in lopende tekst (`bypass`, `cooldown`, `dial`, `filter`, `force`) |
| Slash-commands exact zoals Discord (`/dm weather set`) | Env-keys in de handout (`WEATHER_UPDATE_*`, `.env`) |
| Begrippen: ritme, berichtenvenster, afkoeling, zwaarte, zwaarte-limiet, magie-filter, magisch | DB-kolommen, migraties, “content JSON schema” |
| “Aangewezen DM’s” | Lange uitleg over allowlists / snowflakes |

Engelse **keuzes in Discord** (`only` / `none`, option-namen) mag je noemen naast de Nederlandse zin — dat is wat ze in de UI zien.

**Brug altijd Nederlands ↔ Discord:** schrijf eerst het begrip (ritme, berichtenvenster, afkoeling), dan pas de Discord-naam tussen haakjes of in een code-pill (`interval`, `window`, `cooldown`). Nooit alleen de Engelse optienaam zonder Nederlandse zin. Vermijd losse tech-woorden (`scope`, `plant opnieuw`, `dial`) — zeg wat de DM moet *kiezen* of *doen*. Gebruik **niet** “draaiknop”; zeg **zwaarte-limiet** / **magie-filter**.

Lezers zijn DMs die D&D én Discord-RP snappen, geen bot-developers. Framing is **Discord-first**. “Tijdens een sessie / mid-combat / tussen sessies” alleen waar het echt over live tafel gaat (pause). Als een zin “sorry, wat?” oproept bij iemand die Discord-slash-commands half kent: herschrijven.

---

## Tabs (niet zomaar herschikken)

Exact **2** tabs:

1. **Intro** — wat de bot op Discord doet, wie (incl. Integraties-tip), korte **Start hier**-checklist (`/dm setup menu` + economy klaarzetten), kleine aside voor live tafel (pause), zwaarte met `.severity-scale`, GC, optioneel `<details>` nieuw weertype. Geen weertypes-grid, geen tiles/cards, zo min mogelijk slash-commands buiten de startchecklist.
2. **Commando’s** — zoekbare lijst; hubs als één kaart; default-filter `cmdWho === "dm"`; spelercommands via filter “iedereen”. `/dm setup menu` **niet** in de lijst (staat op Intro).

Geen aparte Setup-tab — te dun sinds kanalen één hub zijn.

---

## Schrijfstijl per plek

### Intro
- Discord-first lead; geen “de tafel speelt, Discord houdt bij”.
- Startchecklist kort (kanalen + economy starten); economy-hubs blijven doorlopend in Commando’s.
- Live tafel: één kleine note over pauzeren — niet als hoofdonderwerp.
- Integraties-tip voor DM’s die geen server-admin zijn.
- Zwaarte: `.severity-scale` (1–5) + korte afkoeling-zin.
- Geen tile-grid op Intro.

### Commando’s
- Per command: **wat het doet** + **wanneer** — Discord-DM-taal, geen tafel-sessie-framing tenzij pause.
- **Hubs = één kaart**, niet één kaart per oude subcommand.
- Hub-kaarten: korte zin + **`opts`**-lijst met **exacte Discord-dropdownlabels** (chips). Geen how-to per optie.
- Default `cmdWho` = `dm`; documenteer dat in de lead.
- Option-namen uit Discord altijd met Nederlandse betekenis ernaast.
- Houd de `COMMANDS`-array in de HTML in sync met de echte bot (`agent.md`).
- Verwijs kanaal-setup naar Intro (met dezelfde labels: Weerkanaal / Kalenderkanaal / Voorraadkanaal).

### Layout
- Tile-grids (`.grid-2`): max **3** kolommen (op smal: 2 / 1) — niet op Intro.
- Zwaarte-schaal (`.severity-scale`): **5** kolommen (op heel smal: 2); welkom op Intro.

### Nieuw weertype (Intro `<details>`)
- Checklist in gewone taal (naam, plaatje, zwaarte, magisch?, kans d100, optionele duur).
- **Geen sfeer-/flavortekst** — Discord post alleen het plaatje.
- **Geen JSON-voorbeeld** in de handout (JSON leeft in de content-repo / `weather-table.json`).
- Geen interactief formulier.

---

## Command-indeling

Eerst op **wie**, daarna op **categorie**:

| Wie | Categorieën |
|---|---|
| Iedereen | Bekijken · Voorraad · Bouwen · Productie |
| DM | Instellingen · Acties · Limieten · Berichten · Voorraad · Bouwen · Productie · Info |

| Categorie | Voorbeelden |
|---|---|
| Bekijken | `/eryndor overzicht`, `/eryndor weer`, `/eryndor vandaag`, `/eryndor vollemaan` |
| Setup (alleen op Intro, niet in Commando’s) | `/dm setup menu` (weer / kalender / voorraad) |
| Instellingen | `/dm weather-settings menu` |
| Acties | `/dm weather` → `roll`, `set`, `schedule`, `pause`, `resume` |
| Limieten / config | `/dm weather-settings menu` |
| Berichten | `/dm announce schedule` / `list` / `cancel` |
| Voorraad | spelers: `/voorraad …`; DM: `/dm resource menu` |
| Bouwen | spelers: `/bouw …`; DM: `/dm building menu` |
| Productie | spelers: `/productie lijst`; DM: `/dm production menu` |
| Info | `/eryndor hulp`; DM: `/dm weather status` / `next` |

Alle DM-commands staan onder `/dm` (Discord verbergt die standaard voor gewone leden). Zichtbaarheid in de `/`-picker ≠ `ALLOWED_USER_IDS`: server-admins zien `/dm` altijd; andere DMs moeten hem via **Integraties → bot → `/dm`** krijgen. Runtime blijft allowlist.

Nieuwe commands in de juiste categorie + in de filters (`cmdCat`) houden.

---

## Concepten (vaste woorden)

Gebruik deze termen consistent:

- **Standaard ritme** — tijd tot automatische dobbelsteen (default 6–18 uur; per type of set/schedule kan eerder winnen)
- **Berichtenvenster** — alleen automatische berichten binnen tijdsvenster (default 06:00–23:00 NL-tijd); handmatig altijd
- **Zwaarte** — cijfer 1–5; **zwaar** = 4+; afkoeling daarna max zwaarte 2 (defaults uit content; zie bot)
- **Afkoeling** — na zwaar weer mildere volgende roll; defaults na ≥4 → max 2; per server via `/dm weather-settings menu`; `set` negeert
- **Tijdelijke zwaarte-limiet** — worpen alleen binnen min–max zwaarte, voor een duur (settings-menu)
- **Tijdelijke magie-filter** — alleen magisch of juist geen magisch weer, voor een duur (settings-menu)
- **Gepland bericht** — vrije tekst die de bot later post in een gekozen kanaal (los van het weerkanaal); via `/dm announce`
- **Kalender-events kanaal** — ochtendpost (`@everyone` + today-embed) alleen bij events; avondpost bij Full Moon (Rising) (stil) en exacte volle maan (`@everyone`); via `/dm setup menu` → Kalenderkanaal (los van het weerkanaal)
- **Guild-voorraad** — gedeelde grondstoffen per server; stille berichten in het voorraadkanaal (`/dm setup menu` → Voorraadkanaal)
- **Persoonlijke voorraad** — per speler, los van de guild (niet “bak”); huisbelasting mogelijk bij toevoegen
- **Opslaglimiet** — max per grondstoftype (standaard 300); overflow bij spelers → persoonlijke voorraad; bij dagelijkse productie → verloren
- **Huisbelasting** — met eigen huis + genoeg stuks (≥ drempel): 1 unit naar guild (+ sell-GC); guild vol → speler houdt alles; DM: `/dm resource menu` → Huisbelasting
- **Bouwproject** — materialen verzamelen → bouwen (tijd) → voltooid; via `/bouw`
- **Donate (bouw)** — materiaal naar een project: bron *van buiten* of *mijn voorraad* (beide + sell-GC)
- **Fund (bouw)** — materiaal uit de guild-voorraad naar een project (geen extra GC)
- **Productiebron** — vaste bron (bijv. hut) die periodiek grondstoffen levert; samenvatting stil ~17:00; via `/productie`
- **Eryndor bot** — productnaam (repo/package mag `weather-bot` / `eryndor-bot` blijven)

Defaults in de handout moeten overeenkomen met content/`weather-rules.json` en schedule-defaults. Wijzigen die in de bot → handout meenemen.

---

## Workflow: feature → handout

1. Feature **implemented** in de bot (zie feature-doc + `agent.md`).
2. Schrijf een korte briefing: `docs/handout-update-<onderwerp>.md` (zie o.a. [`handout-update-dm-rework.md`](./handout-update-dm-rework.md)).
3. Werk `docs/handout/index.html` bij volgens **dit** bestand + die briefing. Oude briefings die nog een Voorraad-tab beschrijven zijn **geen** bron voor structuur.
4. Raakt het **spelers** (nieuwe/ gewijzigde player-commands of flows)? → ook `docs/handout/spelers.html` + speler-help in `content/messages.json` bijwerken.
5. Geen secrets, geen interne implementatiedetails in de handouts.
6. Proposed features → **geen** handout tot status = implemented.

### Briefing-template (handout-update)

In briefing ook vermelden of `spelers.html` moet meegenomen worden (ja/nee + welke tiles).

```markdown
# Handout-update: <onderwerp>

Feature is **implemented**. Zie agent.md / feature-doc.

## Commands om toe te voegen
| Command | Wat het doet (DM-taal) | Categorie | Wie |

## Wat Intro kort mag zeggen
(wat het is + startchecklist — geen how-to)

## Wat Commando’s moeten krijgen
…

## Speler-handout (`spelers.html`)
ja/nee — zo ja: welke secties (kijken / voorraad / bouwen)

## Niet in de handout
DB, .env-keys, migraties, …
```

---

## Technisch (HTML)

- DM: `docs/handout/index.html` (CSS/JS inline is ok; tabs).
- Speler: `docs/handout/spelers.html` (één pagina, geen tabs nodig; mag CSS delen/spiegelen).
- Geen hardcoded weertypes-catalogus (`WEATHER_TYPES` / `#typeGrid`) in de DM-HTML — dat was sync-schuld t.o.v. `weather-table.json`.
- Redirect: `docs/index.html` → `handout/`.
- Visueel: donkere basis + perkament/logo-accenten; clean houden, geen dashboard-rommel.
- Geen build-stap voor Pages.

---

## Checklist voor de agent

- [ ] Exact 2 tabs: Intro, Commando’s?
- [ ] Discord-first toon (tafel alleen bij pause)?
- [ ] `/dm setup menu` alleen op Intro, niet in COMMANDS?
- [ ] Geen weertypes-grid / geen orphan `typeGrid` / geen `WEATHER_TYPES`?
- [ ] Default `cmdWho === "dm"`?
- [ ] Klopt het met de **echte** commands/gedrag in de bot (hubs)?
- [ ] Nederlands, vaste termen, geen tech-jargon in lopende tekst?
- [ ] Nederlandse brug naast Discord-optienamen (`ritme` → `interval`)?
- [ ] Intro kort; details op Commando’s?
- [ ] Nieuwe commands in goede **wie** + **categorie**?
- [ ] Weertype-checklist alleen in `<details>`, zonder JSON?
- [ ] `helpEmbedDescription` belooft geen weertypes-catalogus?
- [ ] Handout-update briefing bijgewerkt of gemarkeerd als verwerkt?
- [ ] Speler-facing change? → `spelers.html` + `/eryndor hulp` spelertekst bijgewerkt?
- [ ] Donate/bouw: bronnen *van buiten* / *mijn voorraad* + fund zonder GC correct uitgelegd (DM én speler)?
- [ ] Geen “bak” — zeg **persoonlijke voorraad**?
- [ ] Onderlinge links DM ↔ speler-handout nog intact?
