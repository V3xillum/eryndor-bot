# Feature: Guild cooldown settings

Per-server aanpasbare afkoelregels (wat telt als zwaar weer, waarnaar afkoelen, aan/uit).

**Status:** implemented.

**Doel:** DMs kunnen afkoeling per Discord-server tunen of uitzetten, zonder `weather-rules.json` te editen of de bot te herstarten — zelfde patroon als [`/weather settings`](./handout-update-guild-schedule-settings.md) voor interval/venster.

Zie ook: [`feature-weather-severity-duration.md`](./feature-weather-severity-duration.md) (bestaande cooldown), [`agent.md`](./agent.md), [`handout-update-guild-cooldown-settings.md`](./handout-update-guild-cooldown-settings.md).

---

## Gedrag

Globale defaults in `content/weather-rules.json`:

```json
{
  "cooldownAfterSeverity": 4,
  "cooldownMaxNextSeverity": 2
}
```

- Na weer met `severity >= after` filtert de volgende auto-roll / `/weather roll` op `severity <= maxNext` (escalate bij lege pool).
- Guild kan per veld overriden; `null` = erf content.
- `enabled = false` (guild): skip cooldown-filter volledig.
- Content heeft geen `enabled`-flag; default is **aan**.
- `/weather set` bypass’t dials + cooldown altijd.

### Effective rules (hoog → laag)

1. Guild-kolom gezet → die waarde (per veld)
2. Anders → `weather-rules.json` (thresholds) / `enabled = true`

Bronlabel: `guild` zodra **enige** cooldown-kolom override heeft, anders `content` (zelfde “simpele” stijl als interval/window).

### Validatie bij set

- `after` / `max_next`: gehele getallen ≥ 1
- Soft warning als `maxNext >= after`
- Soft warning als geen table-entry `severity <= maxNext` (escalate blijft werken)
- Escalate-gedrag behouden zoals in `resolveRollPool`

---

## DB (additive)

```sql
ALTER TABLE world_state ADD COLUMN cooldown_enabled INTEGER;      -- NULL = inherit; 0/1 = override
ALTER TABLE world_state ADD COLUMN cooldown_after_severity INTEGER; -- NULL = inherit
ALTER TABLE world_state ADD COLUMN cooldown_max_next_severity INTEGER; -- NULL = inherit
```

Aparte kolommen, consistent met schedule-settings. Geen Database:Refresh; geen bestaande migraties aanpassen.

---

## Commands

| Command | Effect |
|---|---|
| `/weather settings show` | Interval + venster + effectieve cooldown (guild of content) |
| `/weather settings cooldown` | Patch: optioneel `enabled`, `after`, `max_next` (minstens één) |
| `/weather settings clear scope:…` | `schedule` \| `cooldown` \| `all` |

Allowlist only. Cooldown-wijzigingen veranderen huidig weer niet, posten niet, en reschedulen niet (grijpt in bij de *volgende* roll). Schedule-clear rescheduled wel.

Voorbeelden:

- Afkoeling uit: `/weather settings cooldown enabled:False`
- Strenger: `enabled:True after:3 max_next:1`
- Alleen drempel: `after:5` (`max_next` blijft content/guild)
- Terug naar content: `/weather settings clear scope:cooldown`

---

## Service / roll-pool

`getCooldownSettings(guildId)` merget content + guild.

`resolveRollPool(..., cooldownEnabled)`:

1. Severity dial  
2. Magical dial  
3. Als cooldown enabled **en** current severity ≥ after → filter ≤ maxNext (+ escalate)  
4. Weighted pick  

`getAdminStatus` toont regels + bron; als de volgende roll gefilterd wordt, ook het effectieve plafond.

---

## Out of scope (v1)

- Per-type `allowedFollowups`
- Tijdelijke “cooldown off voor 2h”-dial
- `/weather set` onder cooldown
- `enabled` in `weather-rules.json` als globale default-uit
- Strikte lege-pool reject i.p.v. escalate
