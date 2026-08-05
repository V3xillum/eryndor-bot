# Feature: Tijdelijke handelaar

**Status:** idee — nog niet uitgewerkt tot implementatie-MD.

**Doel:** een DM kan een tijdelijke NPC-handelaar spawnen die specifieke grondstoffen verkoopt (goedkoop) en/of koopt (extra gul), met een max-aantal per item en een eindtijd. Typisch scenario: een rondtrekkende koopman bij de poort die even goedkope ijzerstaven heeft, of juist goud zoekt.

Zie ook: [`feature-guild-resources.md`](../feature-guild-resources.md) (sell/buy-prijzen op resource types), [`feature-building-donation-boost.md`](./feature-building-donation-boost.md) (zelfde aankondiging-/duur-patroon).

---

## Filosofie

- **Los van de guild-voorraad.** De handelaar is een eigen tijdelijk NPC-shopje — geen invloed op `resource_types`, geen opslaglimieten, geen guild-stock die verandert. Speler krijgt/geeft spullen, speler krijgt/betaalt GC, max-aantal telt af tot 0 of tot de tijd om is.
- **Prijzen omgekeerd ten opzichte van de guild.** Guild: doneren = sell (laag), kopen = buy (hoog, default 2× sell). Handelaar: *verkoopt* tegen sell (goedkoop voor de speler), *koopt* tegen buy (extra gul voor de speler).
- **Narratieve hook, altijd publiek.** Bij spawnen een aankondiging met vrije DM-tekst — zelfde stijl als de bouw-boost.
- **Tijdelijk met verplichte duur + handmatige clear** — lazy-expiry bij gebruik, geen aparte scheduler-job nodig.

---

## Wat de DM instelt

Een lijstje items, elk met een richting en een max-aantal:

| Richting | Effect | Prijs | Cap |
|---|---|---|---|
| **verkoopt** | Speler kan kopen | sell-prijs (goedkoop i.p.v. normale buy) | max X stuks totaal beschikbaar |
| **koopt** | Speler kan verkopen | buy-prijs (extra gul i.p.v. normale sell) | max X stuks die de handelaar afneemt |

Plus: duur, en optioneel vroegtijdig stoppen via clear.

---

## Scope

### In scope (v1)

- Spawn met één of meer items (richting + max-aantal per item)
- Verplichte duur; lazy-expiry; handmatige clear
- Publieke aankondiging bij spawn met vrije DM-tekst
- Player-commands om te kopen/verkopen; bevestiging toont live resterend aantal
- GC alleen als melding (geen balance in de bot — zelfde als guild-resources)

### Expliciet buiten scope (v1)

- Wijziging van guild-stock of resource-types
- Opslaglimieten / productie-interactie
- Aankondiging bij aflopen (alleen bij starten)
- Meerdere handelaars tegelijk (nog open — zie onder)

---

## Commands (voorstel)

Allowlist:

| Command | Effect |
|---|---|
| `/dm handelaar set` | Item(s), richting, max-aantal, duur, korte tekst voor de aankondiging |
| `/dm handelaar clear` | Vroegtijdig stoppen |

Spelers:

| Command | Effect |
|---|---|
| `/handelaar kopen` | Koop van de handelaar (alleen items met richting *verkoopt*); bevestiging toont resterend aantal |
| `/handelaar verkopen` | Verkoop aan de handelaar (alleen items met richting *koopt*); bevestiging toont resterend aantal |

---

## Aankondiging (voorbeeld)

Publiek bericht bij het spawnen (kanaal: waarschijnlijk het bestaande voorraadkanaal — zie open vragen):

```text
📢 Een rondtrekkende koopman is neergestreken bij de poort…
Hij verkoopt IJzer (2 GC/stuk, max 20) en koopt Hout (4 GC/stuk, max 50).
Tot vrijdag 20:00.
```

De DM vult de vrije tekst zelf in; de bot kan de itemregels eronder zetten.

---

## Open vragen

1. **Aankondigingskanaal:** hergebruik voorraadkanaal (`/dm resource setup`), of los kiezen bij set?
2. **Bron van speler-items bij verkopen:** persoonlijke voorraad, "outside" (zoals `/bouw leveren`), of beide?
3. **Bestemming bij kopen:** gaat het item naar persoonlijke voorraad, of alleen GC + narratief ("je hebt het")?
4. **Eén handelaar tegelijk per guild**, of meerdere parallel?
5. **Persoonlijke voorraad bij kopen/verkopen stil posten** zoals andere economy-acties, of alleen ephemeral?

---

## Bewust nog niet

- Geen implementatie — dit is denkrichting; aparte implementatie-MD volgt als het idee vaststaat
- Eerst de bestaande economy-features in de praktijk laten proefdraaien
