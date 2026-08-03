# Handout agent — Eryndor bot DM-handout

Regels voor agents (en mensen) die de handouts bijwerken:

- DM: [`docs/handout/index.html`](./handout/index.html)
- Speler: [`docs/handout/spelers.html`](./handout/spelers.html)

**Bot-waarheid** (commands, data, gedrag) = [`agent.md`](./agent.md) + feature-docs.
**Handout-stijl** (toon, structuur, wat wél/niet uitleggen) = **dit bestand**.

GitHub Pages serveert de map `/docs`; DM-handout: `/handout/` · speler-handout: `/handout/spelers.html`. Logo: `docs/handout/eryndor-logo.jpg`. Speler-URL in de bot = `HANDOUT_URL` + `spelers.html` (zie `playerHandoutUrl` in config); `/eryndor help` voor niet-DM’s linkt daarnaartoe.

---

## Doel

Een **DM-handout** in het Nederlands: wat de bot doet, welke slash-commands er zijn, en wat je moet aanleveren voor een nieuw weertype.

Een **speler-handout** (`spelers.html`): kort, campaign-taal, geen tech — wat *jij* tussen sessies kunt doen (info, voorraad, meebouwen). Geen DM-commands, geen setup, geen allowlist.

Beide handouts linken naar elkaar (footer / hero).

---

## Speler-handout (`spelers.html`)

### Wat erin hoort
- **Even kijken** — `/eryndor overview` als default; daaronder `<details>` “Bekijk losse commando’s” met alleen stock / building list|status / production list (geen personal show — die staat verderop; weer + kalender blijven aparte tiles)
- **Guild-voorraad** — donate / buy / persoonlijke voorraad (add|remove|show); GC zelf bijhouden; opslaglimiet + overflow → persoonlijk
- **Meebouwen** — deliver (bronkeuze), use-guild-stock, contribute
- Korte tip: `/eryndor help` + formulieren met dropdowns

### Deliver-bronnen (vaste uitleg)
Bij `/building deliver` altijd **beide** bronnen noemen:

| Bron in Discord | Campaign-taal | GC | Voorraad |
|---|---|---|---|
| Van buiten | Net gehakt/gevonden; bot hield het nog niet bij | + sell | onaangeroerd |
| Mijn voorraad | Uit je persoonlijke voorraad | + sell | persoonlijk − |

`/building use-guild-stock` = alleen uit de **guild**-voorraad, **geen** GC. Niet door elkaar halen.

### Wat er níet in hoort
- `/dm …`, setup, types aanmaken, costs, cancel, adjust, cap zetten
- Env-keys, DB, ledger-actions, “ephemeral”, silent-flags
- Lange command-tabellen of DM-how-to

### Toon
- Alsof je aan de speeltafel uitlegt, niet aan een developer
- Slash-commands wél exact (`/building deliver`)
- Termen: **persoonlijke voorraad** (niet “bak”), **guild-voorraad**, **Guild Credits (GC)**
- Zelfde visuele taal als de DM-handout (fonts/kleuren/logo) mag; geen tabs nodig — één scrollbare pagina

### Sync
Speler-facing gedrag wijzigt → **beide** handouts + help-tekst (`helpEveryoneBody` / speler-help embed) meenemen. DM-only wijzigingen → alleen `index.html` (+ dit bestand / briefing).

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

Lezers zijn DMs die D&D snappen, geen bot-developers. Als een zin “sorry, wat?” oproept bij iemand die Discord-slash-commands half kent: herschrijven.

---

## Tabs (niet zomaar herschikken)

1. **Overzicht** — wat doet de bot, korte sessie-cheat (pause/set/roll), zwaarte/afkoeling, huidige types, ritme/venster (kort)
2. **Commando’s** — volledige lijst, gegroepeerd + filters
3. **Voorraad & bouw** — guild-grondstoffen, bouwprojecten, productie (DM-uitleg + flows)
4. **Nieuw weertype** — wat aanleveren (geen formulier)

Nieuwe tab alleen als er echt een nieuw *soort* content bij komt (zoals voorraad/bouw/productie t.o.v. weer/kalender).

---

## Schrijfstijl per plek

### Overzicht
- Leg uit **wat iets is** en wat de standaardwaarden zijn.
- Maximaal **één command-verwijzing** om het aan te passen (`Aanpassen: \`/dm weather-settings interval\``), met Nederlandse brug (“ritme (`interval`)”).
- Geen how-to van die commands hier (minuten vs uren, voorbeelden 1–5, enz.) → dat hoort op **Commando’s**.
- Als hetzelfde concept twee keer dreigt (bijv. afkoeling onder Zwaarte én in de note): één keer uitleggen, elders kort terugverwijzen.
- Duurcodes (`30m`, `2h`, `1d`) één keer kort in de sessie-note op Overzicht.
- Sessie-cheat: één compacte note (pause / set / roll / limieten) — geen aparte tab meer.

### Commando’s
- Per command: **wat het doet** + **wanneer** — in DM-taal, daarna Discord-details.
- Vriendelijk DM-taal, wel precies genoeg (bijv. set negeert afkoeling en limieten).
- Option-namen uit Discord (`after`, `max_next`, `schedule`/`all`) altijd met Nederlandse betekenis ernaast.
- Houd de `COMMANDS`-array en `CATEGORIES` in de HTML in sync met de echte bot (`agent.md` / README).

### Layout
- Tile-grids (`.grid-2`): max **3 kolommen** (op smal: 2 / 1).
- Zwaarte-schaal (`.severity-scale`): altijd **5** kolommen (op heel smal: 2).

### Nieuw weertype
- Checklist van wat de DM/content-persoon **aanlevert** — in gewone taal (naam, plaatje, zwaarte, …).
- **Geen sfeer-/flavortekst** — Discord post alleen het plaatje; sfeer zit in de art.
- Optioneel: **voorbeeld-JSON** van één entry in de HTML (geen aparte download van de live tabel), met korte toelichting dat dit voor wie de content bijwerkt is.
- Ranges 1–100 moeten sluitend blijven; wijzigingen gaan via wie `content/weather-table.json` beheert.
- Geen interactief formulier tenzij de gebruiker dat expliciet terugvraagt.

---

## Command-indeling

Eerst op **wie**, daarna op **categorie**:

| Wie | Categorieën |
|---|---|
| Iedereen | Bekijken · Voorraad · Bouwen · Productie |
| DM | Inrichten · Instellingen · Acties · Limieten · Berichten · Voorraad · Bouwen · Productie · Info |

| Categorie | Voorbeelden |
|---|---|
| Bekijken | `/eryndor overview`, `/weather current`, `/eryndor today`, `/eryndor fullmoon` |
| Inrichten | `/dm weather setup`, `/dm calendar setup` / `clear`, `/dm resource setup` |
| Instellingen | `/dm weather-settings …` |
| Acties | `/dm weather` → `roll`, `set`, `schedule`, `pause`, `resume` |
| Limieten | `/dm weather-severity`, `/dm weather-magical` |
| Berichten | `/dm announce schedule` / `list` / `cancel` |
| Voorraad | spelers: `/resource …`; DM: `/dm resource`, `/dm resource-type` |
| Bouwen | spelers: `/building …`; DM: `/dm building`, `/dm building-cost` |
| Productie | spelers: `/production list`; DM: `/dm production …` |
| Info | `/eryndor help`; DM: `/dm weather status` / `next` |

Alle DM-commands staan onder `/dm` (Discord verbergt die standaard voor gewone leden). Zichtbaarheid in de `/`-picker ≠ `ALLOWED_USER_IDS`: server-admins zien `/dm` altijd; andere DMs moeten hem via **Integraties → bot → `/dm`** krijgen. Runtime blijft allowlist.

Nieuwe commands in de juiste categorie + in de filters (`cmdCat`) houden.

---

## Concepten (vaste woorden)

Gebruik deze termen consistent:

- **Standaard ritme** — tijd tot automatische dobbelsteen (default 6–18 uur; per type of set/schedule kan eerder winnen)
- **Berichtenvenster** — alleen automatische berichten binnen tijdsvenster (default 06:00–23:00 NL-tijd); handmatig altijd
- **Zwaarte** — cijfer 1–5; **zwaar** = 4+; afkoeling daarna max zwaarte 2 (defaults uit content; zie bot)
- **Afkoeling** — na zwaar weer mildere volgende roll; defaults na ≥4 → max 2; per server via `/dm weather-settings cooldown`; `set` negeert
- **Tijdelijke zwaarte-limiet** — worpen alleen binnen min–max zwaarte, voor een duur (`/dm weather-severity`)
- **Tijdelijke magie-filter** — alleen magisch of juist geen magisch weer, voor een duur (`/dm weather-magical`)
- **Gepland bericht** — vrije tekst die de bot later post in een gekozen kanaal (los van het weerkanaal); via `/dm announce`
- **Kalender-events kanaal** — ochtendpost (`@everyone` + today-embed) alleen bij events; avondpost bij Full Moon (Rising) (stil) en exacte volle maan (`@everyone`); via `/dm calendar setup` (los van het weerkanaal)
- **Guild-voorraad** — gedeelde grondstoffen per server; stille berichten in het voorraadkanaal (`/dm resource setup`)
- **Persoonlijke voorraad** — per speler, los van de guild (niet “bak”)
- **Opslaglimiet** — max per grondstoftype (standaard 300); overflow bij spelers → persoonlijke voorraad; bij dagelijkse productie → verloren
- **Bouwproject** — materialen verzamelen → bouwen (tijd) → voltooid; via `/building`
- **Donate (bouw)** — materiaal naar een project: bron *van buiten* of *mijn voorraad* (beide + sell-GC)
- **Fund (bouw)** — materiaal uit de guild-voorraad naar een project (geen extra GC)
- **Productiebron** — vaste bron (bijv. hut) die periodiek grondstoffen levert; samenvatting stil ~17:00; via `/production`
- **Eryndor bot** — productnaam (repo/package mag `weather-bot` / `eryndor-bot` blijven)

Defaults in de handout moeten overeenkomen met content/`weather-rules.json` en schedule-defaults. Wijzigen die in de bot → handout meenemen.

---

## Workflow: feature → handout

1. Feature **implemented** in de bot (zie feature-doc + `agent.md`).
2. Schrijf een korte briefing: `docs/handout-update-<onderwerp>.md` (zie o.a. [`handout-update-guild-schedule-settings.md`](./handout-update-guild-schedule-settings.md), [`handout-update-guild-resources.md`](./handout-update-guild-resources.md)).
3. Werk `docs/handout/index.html` bij volgens **dit** bestand + die briefing.
4. Raakt het **spelers** (nieuwe/ gewijzigde player-commands of flows)? → ook `docs/handout/spelers.html` + speler-help in `content/messages.json` bijwerken.
5. Geen secrets, geen interne implementatiedetails in de handouts.
6. Proposed features (bijv. [`feature-guild-cooldown-settings.md`](./feature-guild-cooldown-settings.md)) → **geen** handout tot status = implemented.

### Briefing-template (handout-update)

In briefing ook vermelden of `spelers.html` moet meegenomen worden (ja/nee + welke tiles).

```markdown
# Handout-update: <onderwerp>

Feature is **implemented**. Zie agent.md / feature-doc.

## Commands om toe te voegen
| Command | Wat het doet (DM-taal) | Categorie | Wie |

## Wat Overzicht kort mag zeggen
(wat het is + eventueel welk command — geen how-to)

## Wat Commando’s / Sessie moeten krijgen
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
- Weertypes in de DM-pagina (`WEATHER_TYPES`): sync met `content/weather-table.json` als die wijzigt.
- Redirect: `docs/index.html` → `handout/`.
- Visueel: donkere basis + perkament/logo-accenten; clean houden, geen dashboard-rommel.
- Geen build-stap voor Pages.

---

## Checklist voor de agent

- [ ] `WEATHER_TYPES` in de DM-HTML gelijk aan `content/weather-table.json` als types wijzigen?
- [ ] Klopt het met de **echte** commands/gedrag in de bot?
- [ ] Nederlands, vaste termen, geen tech-jargon in lopende tekst?
- [ ] Nederlandse brug naast Discord-optienamen (`ritme` → `interval`)?
- [ ] Overzicht kort; details op Commando’s?
- [ ] Sessie-tiles: eerst waarom, dan command?
- [ ] Nieuwe commands in goede **wie** + **categorie**?
- [ ] Sessie-tile alleen als het een veelgebruikte flow is?
- [ ] Aanlever-tab: geen sfeertekst-veld; JSON als optioneel voorbeeld voor content-beheerder?
- [ ] Handout-update briefing bijgewerkt of gemarkeerd als verwerkt?
- [ ] Speler-facing change? → `spelers.html` + `/eryndor help` spelertekst bijgewerkt?
- [ ] Donate/bouw: bronnen *van buiten* / *mijn voorraad* + fund zonder GC correct uitgelegd (DM én speler)?
- [ ] Geen “bak” — zeg **persoonlijke voorraad**?
- [ ] Onderlinge links DM ↔ speler-handout nog intact?
