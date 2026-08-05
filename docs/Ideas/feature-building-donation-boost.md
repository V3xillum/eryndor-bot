# Feature: Tijdelijke prijsboost op bouwdonaties

**Status:** idee — nog niet uitgewerkt tot implementatie-MD.

**Doel:** een DM kan tijdelijk de GC-vergoeding (sell) verhogen voor donaties aan een specifiek bouwproject — voor één grondstof, of voor alle openstaande materialen van dat project — om spelers te stimuleren snel te leveren. Typisch scenario: een NPC wil iets dringend af hebben en betaalt daarom (tijdelijk) extra.

Zie ook: [`feature-guild-resources.md`](../feature-guild-resources.md) (donate/fund-mechaniek), [`agent.md`](../agent.md) (bestaande buy = 2× sell default).

---

## Filosofie

- **Alleen op bouwprojecten, niet op de guild-voorraad.** De boost werkt uitsluitend op `/building donate` (materiaal naar een project, met GC). `/resource donate` en `/resource buy` blijven ongewijzigd. Dat houdt de impact lokaal bij één project in plaats van de hele economie te raken.
- **Alleen de sell-kant verandert.** De buy-prijs (wat spelers betalen om iets uit de guild-voorraad te kopen) blijft altijd zoals-ie is; er wordt niets aan de standaard buy = 2× sell-regel gewijzigd.
- **Geen downside-risico voor de guild, ook in het uiterste geval.** Als een DM de sell-boost zo hoog zet dat-ie de normale buy-prijs evenaart (bijv. boost = 2×), kan een speler in theorie iets uit de guild-voorraad kopen en meteen doneren aan het project voor exact 0 winst. Dat is bewust toegestaan — het is geen exploit, hooguit een curiositeit, en dit patroon is al eerder bewust zo gelaten.
- **Twee toepassingsvormen, allebei in scope:**
  - *Projectbreed* — de boost geldt voor alle nog openstaande materialen van dat project ("ik wil dit gebouw af hebben, ik betaal dubbel").
  - *Per grondstof binnen een project* — de boost geldt voor één specifiek materiaal ("voor het goud betaal ik dubbel", terwijl hout en steen normaal blijven).
- **Altijd publiek aangekondigd, nooit stil.** In tegenstelling tot de meeste voorraad/bouw-berichten (die stil posten) is dit expliciet bedoeld als narratieve hook — de tafel moet weten dat er ineens haast bij zit.
- **Tijdelijk met een verplichte duur, met een vroegtijdige clear-optie** — zelfde patroon als de bestaande severity-/magical-dials bij weer.
- **Rond in het voordeel van de speler** bij niet-ronde GC-bedragen (bijv. bij 1.5× naar boven afronden).

---

## Scope

### In scope (v1)

- Boost zetten op een project: projectbreed óf project + specifieke grondstof
- Verplichte duur bij het zetten van de boost; lazy-expiry (net als de weer-dials, gecheckt op het moment van gebruik, geen aparte scheduler-job nodig)
- Handmatig vroegtijdig stoppen (clear)
- Automatische publieke aankondiging op het moment dat de DM de boost instelt, met een vrije-tekstveld voor de DM (zelfde idee als `/dm announce` — geen vaste bot-tekst, want het narratief verschilt per situatie)
- Actieve boost zichtbaar in de bestaande project-overzichten (`/building status`, `/building cost show`) zodat spelers vóór het doneren zien dat het nu extra oplevert
- Afronding altijd in het voordeel van de speler

### Expliciet buiten scope (v1)

- Boost op de generieke guild-voorraad (`/resource donate`) — alleen bouwprojecten
- Wijziging van de buy-prijs
- Automatische aankondiging bij het aflopen van een boost (v1: alleen bij starten; later evt. uit te breiden)
- Bot die zelf boosts voorstelt — dit blijft puur DM-initiatief
- Meerdere gelijktijdige boosts stapelen op dezelfde combinatie van project + grondstof (zie open vragen)

---

## Datamodel (schets)

Nieuwe, additieve tabel — geen wijziging aan bestaande resource/building-tabellen:

```sql
CREATE TABLE IF NOT EXISTS building_donation_boosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  building_id INTEGER NOT NULL,       -- FK naar het bouwproject
  resource_key TEXT,                  -- NULL = geldt voor alle materialen van dit project
  multiplier REAL NOT NULL,           -- bv. 1.5, 2.0
  note TEXT,                          -- vrije DM-tekst voor de aankondiging (NPC-naam / reden)
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by TEXT NOT NULL,
  cleared_at DATETIME                 -- NULL = actief; gezet bij handmatige clear
);
```

---

## Berekening bij `/building donate`

1. Zoek een actieve boost voor dit project: eerst op `(building_id, resource_key = specifieke grondstof)`, anders op `(building_id, resource_key IS NULL = projectbreed)`.
2. `gc = round_in_favor_of_player(sell_price × multiplier × aantal)`
3. Toon de tijdelijke prijs in het bestaande (stille) voortgangsbericht, bijv.: `Hout: 3 GC/stuk (tijdelijk 1.5×)`.

---

## Commands (voorstel)

Onder `/dm building`, allowlist only:

| Command | Effect |
|---|---|
| `/dm building boost set <project> [grondstof] <multiplier> <duur> <tekst>` | Zet de boost; post direct de publieke aankondiging met de meegegeven tekst |
| `/dm building boost clear <project> [grondstof]` | Stopt een actieve boost vroegtijdig; geen aankondiging (stil, DM-actie) |
| `/dm building boost list` (of onderdeel van `/dm building status`) | Toont actieve boosts + resterende tijd, per project |

Player-facing (geen nieuwe commands, bestaande commands tonen de boost erbij):

- `/building donate` — de bevestiging/preview toont de tijdelijke prijs als die actief is
- `/building status`, `/building cost show` — tonen "tijdelijk X× betaald tot …" bij een actief materiaal

---

## Aankondiging (voorbeeld)

Publiek bericht, gepost op het moment dat de DM de boost instelt (kanaal: waarschijnlijk het bestaande voorraadkanaal uit `/dm resource setup` — zie open vragen):

```text
📢 De smid heeft haast! Voor IJzer aan het project "Nieuwe wapenkamer" wordt
tijdelijk 2× betaald, tot vrijdag 20:00.
```

De DM vult de vrije tekst (`note`) zelf in, zoals bij `/dm announce` — geen vaste bot-formulering, zodat het per situatie past.

---

## Open vragen

1. **Aankondigingskanaal:** hergebruiken van het bestaande voorraadkanaal (`/dm resource setup`), of een los te kiezen kanaal per boost? Voorraadkanaal is waarschijnlijk voldoende, aangezien bouwdonaties daar toch al (stil) landen.
2. **Meerdere boosts tegelijk op hetzelfde project:** een projectbrede boost + een aparte boost op één grondstof binnen datzelfde project tegelijk toestaan (met voorrang voor de specifieke), of gewoon één actieve boost per project toestaan en de tweede weigeren? Voorstel hierboven gaat uit van "specifiek wint van breed", maar dat is nog geen hard besluit.
3. **Project geannuleerd terwijl een boost actief is** (`/dm building cancel`): boost heeft dan geen effect meer omdat het project weg is — waarschijnlijk gewoon laten vervallen zonder aparte cleanup-actie nodig.
4. **Aankondiging bij aflopen:** nu bewust buiten scope, maar zou later een leuke toevoeging zijn ("De haast van de smid is voorbij — normale prijzen gelden weer").

---

## Bewust nog niet

- Geen wijziging aan bestaande resource/building-services of -commands buiten wat hierboven staat
- Geen implementatie — dit document is denkrichting, een aparte implementatie-MD volgt pas als dit idee vastgezet wordt
- Eerst de bestaande statische weertabel en de huidige economy-features in de praktijk laten proefdraaien
