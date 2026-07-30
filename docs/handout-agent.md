# Handout agent — Eryndor bot DM-handout

Regels voor agents (en mensen) die [`docs/handout/index.html`](./handout/index.html) bijwerken.

**Bot-waarheid** (commands, data, gedrag) = [`agent.md`](./agent.md) + feature-docs.  
**Handout-stijl** (toon, structuur, wat wél/niet uitleggen) = **dit bestand**.

GitHub Pages serveert de map `/docs`; de handout staat op `/handout/` (`docs/handout/index.html`). Logo: `docs/handout/eryndor-logo.jpg`.

---

## Doel

Een **DM-handout** in het Nederlands: wat de bot doet, welke slash-commands er zijn, en wat je moet aanleveren voor een nieuw weertype.

Geen setup-gids, geen Node/Discord Developer Portal, geen SQLite, geen deploy.

---

## Taal

| Wel | Niet |
|---|---|
| Nederlands voor uitleg | Engelse jargon in lopende tekst (`bypass`, `cooldown`, `dial`, `filter`, `force`) |
| Slash-commands exact zoals Discord (`/weather set`) | Env-keys in de handout (`WEATHER_UPDATE_*`, `.env`) |
| Begrippen: ritme, berichtenvenster, afkoeling, zwaarte, draaiknop, magisch | DB-kolommen, migraties, “content JSON schema” |
| “Aangewezen DM’s” | Lange uitleg over allowlists / snowflakes |

Engelse **keuzes in Discord** (`only` / `none`, option-namen) mag je noemen naast de Nederlandse zin — dat is wat ze in de UI zien.

---

## Tabs (niet zomaar herschikken)

1. **Overzicht** — wat doet de bot, zwaarte/afkoeling, huidige types, ritme/venster (kort)
2. **Commando’s** — volledige lijst, gegroepeerd + filters
3. **Tijdens de sessie** — korte “wanneer doe ik X”-tiles
4. **Nieuw weertype** — wat aanleveren (geen formulier)

Nieuwe tab alleen als er echt een nieuw *soort* content bij komt.

---

## Schrijfstijl per plek

### Overzicht
- Leg uit **wat iets is** en wat de standaardwaarden zijn.
- Maximaal **één command-verwijzing** om het aan te passen (`Aanpassen: \`/weather settings interval\``).
- Geen how-to van die commands hier (minuten vs uren, voorbeelden 1–5, enz.) → dat hoort op **Commando’s**.
- Als hetzelfde concept twee keer dreigt (bijv. afkoeling onder Zwaarte én in de note): één keer uitleggen, elders kort terugverwijzen.

### Commando’s
- Per command: **wat het doet** + **wanneer**.
- Vriendelijk DM-taal, wel precies genoeg (bijv. set negeert afkoeling en draaiknoppen).
- Houd de `COMMANDS`-array en `CATEGORIES` in de HTML in sync met de echte bot (`agent.md` / README).

### Tijdens de sessie
- Cheat sheet: één zin + command. Geen essays.

### Nieuw weertype
- Checklist van wat de DM/content-persoon **aanlevert**.
- **Geen sfeer-/flavortekst** — Discord post alleen het plaatje; sfeer zit in de art.
- Optioneel: **voorbeeld-JSON** van één entry + download van `weather-table.json` als **referentie** (bestand onder `docs/handout/`, sync houden met `content/weather-table.json`).
- Download is geen uitnodiging om zonder review de live content te overrulen; ranges 1–100 moeten sluitend blijven.
- Geen interactief formulier tenzij de gebruiker dat expliciet terugvraagt.

---

## Command-indeling

Eerst op **wie**, daarna op **categorie**:

| Wie | Categorieën |
|---|---|
| Iedereen | Bekijken |
| DM | Inrichten · Instellingen · Acties · Draaiknoppen · Info |

| Categorie | Voorbeelden |
|---|---|
| Bekijken | `/weather current`, `/world today`, `/world fullmoon` |
| Inrichten | `/weather setup` |
| Instellingen | `/weather settings …` |
| Acties | `roll`, `set`, `schedule`, `pause`, `resume` |
| Draaiknoppen | `severity`, `magical` |
| Info | `status`, `next` |

Nieuwe commands in de juiste categorie + in de filters (`cmdCat`) houden.

---

## Concepten (vaste woorden)

Gebruik deze termen consistent:

- **Standaard ritme** — tijd tot automatische dobbelsteen (default 6–18 uur; per type of set/schedule kan eerder winnen)
- **Berichtenvenster** — alleen automatische berichten binnen tijdsvenster (default 06:00–23:00 NL-tijd); handmatig altijd
- **Zwaarte** — cijfer 1–5; **zwaar** = 4+; afkoeling daarna max zwaarte 2 (defaults uit content; zie bot)
- **Afkoeling** — na zwaar weer mildere volgende roll; defaults na ≥4 → max 2; per server via `/weather settings cooldown`; `set` negeert
- **Zwaarte- / magie-draaiknop** — tijdelijke beperking op rolls
- **Eryndor bot** — productnaam (repo/package mag `weather-bot` / `eryndor-bot` blijven)

Defaults in de handout moeten overeenkomen met content/`weather-rules.json` en schedule-defaults. Wijzigen die in de bot → handout meenemen. Snapshot `docs/handout/weather-table.json` meenemen als `content/weather-table.json` wijzigt.

---

## Workflow: feature → handout

1. Feature **implemented** in de bot (zie feature-doc + `agent.md`).
2. Schrijf een korte briefing: `docs/handout-update-<onderwerp>.md` (zie [`handout-update-guild-schedule-settings.md`](./handout-update-guild-schedule-settings.md)).
3. Werk `docs/handout/index.html` bij volgens **dit** bestand + die briefing.
4. Geen secrets, geen interne implementatiedetails in de handout.
5. Proposed features (bijv. [`feature-guild-cooldown-settings.md`](./feature-guild-cooldown-settings.md)) → **geen** handout tot status = implemented.

### Briefing-template (handout-update)

```markdown
# Handout-update: <onderwerp>

Feature is **implemented**. Zie agent.md / feature-doc.

## Commands om toe te voegen
| Command | Wat het doet (DM-taal) | Categorie | Wie |

## Wat Overzicht kort mag zeggen
(wat het is + eventueel welk command — geen how-to)

## Wat Commando’s / Sessie moeten krijgen
…

## Niet in de handout
DB, .env-keys, migraties, …
```

---

## Technisch (HTML)

- Eén pagina: `docs/handout/index.html` (CSS/JS inline is ok).
- Weertypes in de pagina: sync met `content/weather-table.json` als die wijzigt (of documenteer snapshot-datum).
- Redirect: `docs/index.html` → `handout/`.
- Visueel: donkere basis + perkament/logo-accenten; clean houden, geen dashboard-rommel.
- Geen build-stap voor Pages.

---

## Checklist voor de agent

- [ ] Snapshot `docs/handout/weather-table.json` gelijk aan `content/` als types wijzigen?
- [ ] Klopt het met de **echte** commands/gedrag in de bot?
- [ ] Nederlands, vaste termen, geen tech-jargon in lopende tekst?
- [ ] Overzicht kort; details op Commando’s?
- [ ] Nieuwe commands in goede **wie** + **categorie**?
- [ ] Sessie-tile alleen als het een veelgebruikte flow is?
- [ ] Aanlever-tab: geen sfeertekst-veld?
- [ ] Handout-update briefing bijgewerkt of gemarkeerd als verwerkt?
