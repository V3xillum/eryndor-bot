# Handout-update: guild cooldown settings

Korte briefing voor een agent die [`docs/handout/index.html`](./handout/index.html) bijwerkt. Feature is **implemented** in de bot; de handout moet DMs informeren.

**Handout-status:** verwerkt in `docs/handout/index.html` (Commando’s, Overzicht, Sessie).

Zie ook: [`agent.md`](./agent.md), [`feature-guild-cooldown-settings.md`](./feature-guild-cooldown-settings.md), [`handout-update-guild-schedule-settings.md`](./handout-update-guild-schedule-settings.md).

---

## Wat is er nieuw?

DMs kunnen **per Discord-server** de severity-afkoeling tunen of uitzetten, zonder `weather-rules.json` of bot-restart.

Content-defaults blijven in `weather-rules.json`. Guild-overrides staan in SQLite (`world_state`), veld-voor-veld (null = erf content).

---

## Commands om in de handout te zetten

Allowlist only (zelfde als andere admin weather-commands).

| Command | Wat het doet |
|---|---|
| `/dm weather-settings show` | Toont effectief interval, postvenster **en** afkoeling (guild of default) |
| `/dm weather-settings cooldown [enabled] [after] [max_next]` | Guild-afkoeling; minstens één optie. `enabled:False` is genoeg om uit te zetten |
| `/dm weather-settings clear scope:schedule\|cooldown\|all` | Wis overrides per scope → terug naar defaults |

Voorbeelden:

- Storm-arc zonder afkoeling: `/dm weather-settings cooldown enabled:False`
- Mildere wereld: `/dm weather-settings cooldown after:5 max_next:3`
- Terug naar content-defaults: `/dm weather-settings clear scope:cooldown`
- Alles resetten: `/dm weather-settings clear scope:all`

---

## Wat moet de handout uitleggen?

1. **Afkoeling** — na zwaar weer (severity ≥ drempel) kiest de volgende auto-roll / `/dm weather roll` mildere types (plafond + escalate als nodig). `/dm weather set` bypass’t dit.
2. **Per server** — defaults uit content; guild-settings overriden zonder deploy.
3. **Clear met scope** — één clear-command; kies `schedule`, `cooldown` of `all` (niet per ongeluk alles wissen).
4. **Status** — `/dm weather status` en `settings show` tonen of afkoeling aan/uit is en de drempels (bron: guild of content).

---

## Waar in de handout (hints)

- Command-lijst / cheat sheet (bij `/dm weather-settings …`)
- Sectie Zwaarte / Afkoeling: één zin + command-verwijzing; details op Commando’s-tab
- Eventueel `settings clear` bijwerken: scope noemen (breaking t.o.v. oude “clear = alleen schedule”)

---

## Out of scope voor de handout

- Implementatiedetails (`world_state` columns, escalate-loop)
- `weather-rules.json` keys behalve “defaults komen uit content / serverconfig”
