# Feature: Magical weather dial

Ontwerp + implementatie van een DM-filter op magisch vs niet-magisch weer, parallel aan de severity dial.

**Status:** implemented — `magical` op table entries, via `/dm weather-settings menu` (Magie-filter), intersectie-validatie met severity dial, zichtbaar in `/dm weather status`.

**Doel:** tijdelijk alleen magisch weer (of juist géén) voor auto-roll / `/weather roll`, zonder type-namen hard te coderen.

---

## Scope

### In scope
- Boolean `magical` per weather-table entry
- Tijdelijke DM dial: `only` | `none` + duration
- Filter in roll-pool (na severity dial, vóór cooldown)
- Reject bij set als pool of intersectie met severity dial leeg is
- Status + messages

### Explicit out of scope
- Wijzigingen aan bestaande migraties (alleen additive ALTER)
- Silent fallback / escalate op de magical-constraint
- `/weather set` onder de filter laten vallen (blijft bypass)

---

## Content

Elke entry in `weather-table.json`:

```json
{
  "min": 95,
  "max": 100,
  "type": "arcane_storm",
  "image": "arcane_storm.png",
  "severity": 5,
  "magical": true,
  "durationMinMinutes": 15,
  "durationMaxMinutes": 60
}
```

Loader eist `typeof magical === 'boolean'`. Starter table: o.a. Clockwork clouds + arcane_storm = `true`; overige = `false`.

---

## DB (additive)

```sql
ALTER TABLE world_state ADD COLUMN magical_mode TEXT;           -- 'only' | 'none'
ALTER TABLE world_state ADD COLUMN magical_override_until DATETIME;
```

Lazy expiry: dial is actief alleen als `override_until` in de toekomst ligt.

---

## Commands

- `/dm weather-settings menu` → Magie-filter zetten (`only` | `none` + duur `30m` / `2h` / `1d`)
- Zelfde menu → Magie-filter opheffen
- Allowlist only; verandert huidig weer niet; post niet naar het kanaal
- Zichtbaar in `/dm weather status` en het settings-menu

---

## Roll-algoritme

Volgorde in `resolveRollPool`:

1. Severity dial band (optioneel)
2. Magical dial (`only` / `none`, optioneel)
3. Severity cooldown binnen die intersectie (escalate plafond zoals bestaand)
4. Eén weighted pick

`/weather set` bypassed dials + cooldown.

### Lege pool

| Situatie | Gedrag |
|---|---|
| Magical mode alleen → 0 entries | Reject bij set (`MAGICAL_POOL_EMPTY`) |
| Severity band alleen → 0 entries | Reject bij set (`SEVERITY_RANGE_EMPTY`) |
| Beide dials actief, intersectie leeg | Reject bij set (`DIAL_FILTER_EMPTY`) |
| Content wijzigt na set → lege pool bij roll | Fout; geen update / geen stille fallback naar volle table |

Cooldown escaleert **niet** de magical-constraint: als de intersectie na dials ≥1 entry heeft, blijft cooldown binnen die set (en valt terug op die base).

---

## Interactie met severity dial

Voorbeeldprobleem: severity min 5 + magical `none`, terwijl alleen `arcane_storm` (magical) severity 5 is → lege intersectie. Daarom validatie op **combinatie** bij het zetten van *elke* dial.

---

## Non-goals reminder

Geen aparte rules engine. Content flag + filterstap + DB override, spiegelend aan severity dial.
