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
| `/dm weather-settings menu` | Hub-menu: overzicht + dropdown (ritme, venster, afkoeling, limieten, terugzetten) |

Voorbeelden (via menu → Afkoeling / Terugzetten):

- Storm-arc zonder afkoeling: Afkoeling → uit
- Mildere wereld: after 5, max_next 3
- Terug naar content-defaults: Terugzetten → Afkoeling
- Alles resetten: Terugzetten → Alles

---

## Wat moet de handout uitleggen?

1. **Afkoeling** — na zwaar weer (severity ≥ drempel) kiest de volgende auto-roll / `/dm weather roll` mildere types (plafond + escalate als nodig). `/dm weather set` bypass’t dit.
2. **Per server** — defaults uit content; guild-settings overriden zonder deploy.
3. **Clear met scope** — in het menu onder Terugzetten; kies `schedule`, `cooldown` of `all`.
4. **Status** — `/dm weather status` en het settings-menu tonen of afkoeling aan/uit is en de drempels (bron: guild of content).

---

## Waar in de handout (hints)

- Command-lijst: één entry `/dm weather-settings menu` (niet aparte cooldown/show/clear-subcommands)
- Sectie Zwaarte / Afkoeling: één zin + menu-verwijzing

---

## Out of scope voor de handout

- Implementatiedetails (`world_state` columns, escalate-loop)
- `weather-rules.json` keys behalve “defaults komen uit content / serverconfig”
