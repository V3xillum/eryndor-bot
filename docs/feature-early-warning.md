# Feature: Early weather warning

**Status:** idee — nog niet uitwerken tot DMs de huidige bot langer in de praktijk hebben gebruikt.

**Doel:** optioneel een sfeerbericht posten *vóór* een weerswisseling, zodat de wereld levendiger voelt en Discord-RP wordt gestimuleerd — zonder de verrassing van het volgende weer te verklappen.

Zie ook: projectdoel in [`agent.md`](./agent.md) (wereld levend houden tussen sessies).

---

## Filosofie

De warning is **geen weersvoorspelling**.

Spelers weten niet:

- welk weertype eraan komt;
- of het gevaarlijk is;
- hoe lang het zal duren.

Ze merken alleen dat de wereld verandert. Daardoor ontstaat ruimte voor roleplay en speculatie, terwijl de verrassing blijft.

In Discord blijft het publieke kanaal atmosfeer; exacte planning hoort bij DM-tools (zoals nu al bij `/weather status` / `/weather next`), niet bij spelers.

---

## Voorbeelden

**Gewoon weer**

- Donkere wolken pakken zich samen aan de horizon.
- De wind trekt langzaam aan.
- De temperatuur lijkt langzaam te dalen.

**Magisch weer**

- Er hangt een vreemde spanning in de lucht.
- Kleine lichtpuntjes zweven door de wind.
- Vogels gedragen zich ongewoon rustig.

Deze teksten geven sfeer; ze verklappen niet wat er precies gebeurt. (Vergelijkbaar met hoe weerkaarten nu sfeer dragen i.p.v. een spoiler-tekst.)

---

## Magisch betekent niet gevaarlijk

Magisch weer is in de bot al een apart kenmerk (`magical`) naast zwaarte (`severity`). Hetzelfde idee geldt voor warnings: magisch ≠ automatisch slecht nieuws.

Magisch weer kan bijvoorbeeld:

- kleurrijke zwevende bellen;
- lichtgevende mist;
- vallende sterrenslierten;
- bloemen die spontaan openbloeien;
- een ongewone, maar prachtige hemel.

…maar ook gevaarlijke verschijnselen (denk aan een Hypnotic Storm of Acid Rain).

Zo leren spelers niet dat elke magische warning slecht nieuws betekent.

---

## Indeling / content (denkrichting)

Warnings hangen aan **groepen**, niet aan elk weertype apart — zodat nieuwe types kunnen meeliften zonder eigen tekstset.

### Groepen via types (niet via severity)

Denkrichting: aparte content-JSON (bijv. `content/weather-warnings.json`), **niet** in `messages.json` (dat blijft bot/UI-copy).

Per groep:

- `types` — één of meer weertype-namen die exact matchen met `weather-table.json`;
- `messages` — ~8–12 sfeerteksten; de bot kiest er willekeurig één.

Voorbeeldvorm (namen/velden nog vrij):

```json
[
  {
    "types": ["clear", "cloudy", "fog"],
    "messages": [
      "Donkere wolken pakken zich samen aan de horizon.",
      "De wind trekt langzaam aan."
    ]
  },
  {
    "types": ["storm"],
    "messages": ["…"]
  },
  {
    "types": ["Clockwork clouds", "arcane_storm"],
    "messages": [
      "Er hangt een vreemde spanning in de lucht.",
      "Kleine lichtpuntjes zweven door de wind."
    ]
  }
]
```

**Severity niet in de warning-selectie** (voorlopig). Nuance via slimme groepen i.p.v. `severity` filteren of “zwaar”-taal in teksten — anders lekt de warning te veel. Mild magisch en heftig magisch mogen in **dezelfde** magical-pool (`Clockwork clouds` + `arcane_storm`), zodat magisch ≠ automatisch slecht nieuws blijft.

Voorbeeldgroepen (ids nog vrij): calm / unsettled / storm / magical — liever meer pools dan severity meenemen.

### Regels (concept)

- Een type hoort in **maximaal één** specifieke groep (anders: welke pool?).
- Lead time blijft op defaults / per-type override in de weather-table — niet in dit berichtenbestand.
- Mapping-alternatief voor later: `warningGroup` op de weather-table entry i.p.v. `types[]` op de pool (handiger bij “nieuw weertype aanleveren”). Voor nu is `types[]` op de pool voldoende denkrichting.

### Geen match → algemene pool

Als het komende weertype in **geen** specifieke groep staat: niet stil falen en niet “pak maar calm”.

Richting: een **algemene fallback-pool** met heel generieke teksten (geen storm-, regen- of magie-hints), bijv. “Er hangt iets in de lucht” / “De wereld lijkt even te wachten”.

Zo krijgt elk type altijd een warning zolang die fallback bestaat; nieuwe types zonder groep blijven veilig tot iemand ze indelen.

---

## Timing (lead time)

Een warning komt enige tijd *vóór* de weerswisseling.

Richting: kort genoeg dat de verrassing blijft, lang genoeg dat spelers er nog nét op kunnen reageren.

### Default + per-type override

Zelfde patroon als weerduur (`durationMinMinutes` / `durationMaxMinutes`):

- **Globale default:** `warningMinMinutes` / `warningMaxMinutes` (concrete waarden later; orde van enkele minuten tot ~een half uur).
- **Per weertype optioneel overschrijfbaar** in `weather-table.json` (veldnamen later vastleggen).
- Bij de vroege roll van het *komende* weer: lead time trekken uit die range (type-override of default), warning-moment = omslag − lead time.

Past bij het bestaande ritme van automatische updates (interval + actief venster); exacte defaults en edge cases (zeer korte duur, actief venster) volgen in de implementatie-MD.

---

## Impact op bestaande weerlogica

*(Bewaard als input voor een latere implementatie-MD — nog geen ontwerpbesluit.)*

### Roll moet eerder

**Nu:** de roll voor het volgende weer gebeurt pas wanneer de huidige periode afloopt. De bot weet tot die tijd niet welk type (of welke `magical` / `severity`) eraan komt.

**Nodig:** bij (of direct na) het vastzetten/posten van huidig weer ook al de **volgende** roll doen en die bewaren. Zonder die vroege roll kan de bot geen passende warning kiezen of het warning-moment inplannen.

De bot moet dus eerder weten:

- type van het volgende weer;
- duur tot de omslag;
- eigenschappen zoals `magical` en `severity`;
- lead time voor de warning (default of override van dat komende type).

### Mogelijke flow

1. Huidig weer wordt gepost / vastgezet.
2. De bot doet meteen de roll voor het **volgende** weer (zelfde pool-regels: severity dial, magical dial, cooldown, …).
3. De bot bewaart dat resultaat (type, duur, `magical`, `severity`, …) en plant `next_update_at` zoals nu.
4. Uit de lead-time range (default of per-type override van het *komende* weer) wordt het warning-moment gezet.
5. Enige tijd vóór de overgang wordt de warning gepost (categorie op basis van het geplande volgende weer — zonder type te lekken).
6. Op het geplande moment wordt het nieuwe weer actief; daarna opnieuw stap 2 voor de cycle erna.

## Alternatief

Zelfde window gebruiken maar het bericht toevoegen aan de /eryndor weer. Op die manier kan de speler actief kijken of het weer gaat veranderen.

### DM-interventies (open)

Als het volgende weer al vroeg is gerold, kan een DM dat “oude” toekomstige weer ongeldig maken. Voorbeelden:

- `/weather set` — nieuw huidig weer; het eerder geplande volgende weer (en warning) klopt mogelijk niet meer
- `/weather pause` / `/weather resume` / `/weather schedule` — timing verschuift; warning-moment kan scheef staan
- `/weather severity set|clear` — pool voor een *nieuwe* volgende roll verandert; het al bewaarde volgende weer is onder de oude dial gerold
- `/weather magical set|clear` — idem voor de magical-constraint

Richting voor later (nog geen besluit): bij zulke interventies het geplande volgende weer + pending warning **invalideren** en opnieuw rollen/plannen waar nodig — of expliciet behouden als de interventie alleen timing raakt. Exacte regels horen in de implementatie-MD.

### DM-informatie

Omdat het volgende weer eerder bekend wordt binnen het systeem, moeten waarschijnlijk ook enkele DM-schermen worden uitgebreid.

Mogelijke aanvullingen (alleen voor DMs, niet publiek):

- huidig weer;
- gepland volgend weer;
- moment waarop het weer omslaat;
- geplande warning;
- eventuele eigenschappen van het volgende weer (`magical`, `severity`, …).

---

## Wat spelers nooit te zien krijgen

Deze feature blijft een RP-uitbreiding voor Discord. Het publieke bericht mag **niet** lekken:

- het volgende weertype;
- de duur van het volgende weer;
- of het magisch wordt;
- de ernst / severity van wat komt.

Alleen de wereld laat merken dat er iets op komst is.

---

## Bewust nog niet

- Geen wijziging aan scheduler / “volgend weer alvast bepalen”
- Geen content-bestanden of commands
- Eerst feedback van DMs op de huidige weerbot
- Dit document is idee + richting; een aparte implementatie-MD volgt later
