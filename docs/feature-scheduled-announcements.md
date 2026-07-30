# Feature: Scheduled announcements

DM kan vrije tekst klaarzetten en de bot post die op een gekozen moment naar een **ander kanaal** dan het weer.

**Status:** implemented (experimenteel — eenvoudig terug te draaien).

**Doel:** Sfeer-/wereldberichten (bijv. “die ene nachtslag”) plannen zonder handmatig om 08:00 online te zijn. Los van `/weather setup`.

Zie ook: [`agent.md`](./agent.md), Discord [slash commands](https://discord.com/developers/docs/interactions/application-commands), [modals](https://discord.com/developers/docs/interactions/message-components#text-inputs).

---

## Gedrag

| Command | Effect |
|---|---|
| `/announce schedule channel when` | Opent modal voor tekst; slaat post op |
| `/announce list` | Pending posts (id, kanaal, tijd, preview) |
| `/announce cancel id` | Verwijder pending post |

- Allowlist only (`ALLOWED_USER_IDS`), guild-only.
- `when`: relatief `30m` / `2h` / `1d`, of absoluut `YYYY-MM-DD HH:mm` in `WEATHER_TIMEZONE`.
- Body: Discord modal paragraph, max **2000** tekens (Discord message limit).
- Post is plain text (geen embed); newlines blijven behouden.
- **Geen** weer-actief-venster en **geen** weather-pause — dit is een bewuste DM-deadline.
- Scheduler pollt elke **30s** (zelfde loop als weer). Missed `post_at` na restart → post bij eerstvolgende tick.
- Transient Discord-fouten: blijft pending (retry). Ongeldig/verwijderd kanaal: wordt afgevinkt (`posted_at` gezet) + log warning.

---

## DB (additive)

```sql
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  body TEXT NOT NULL,
  post_at DATETIME NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  posted_at DATETIME          -- NULL = pending
);
```

Geen wijziging aan `world_state`. Geen Database:Refresh.

### Terugdraaien

1. Code: git discard / niet committen.
2. SQLite: tabel blijft harmloos staan, of `DROP TABLE scheduled_posts;` als je hem wilt weghalen. `storage/world.sqlite` staat in `.gitignore`.

---

## Code

| Stuk | Rol |
|---|---|
| `src/commands/announce.ts` | Slash + modal |
| `src/services/AnnounceService.ts` | schedule / list / cancel / due |
| `src/services/SchedulerService.ts` | `tickAnnouncements` |
| `src/db/index.ts` | CRUD `scheduled_posts` |
| `content/messages.json` | NL strings |

---

## Testplan

1. `npm run register-commands` (global: tot ~1u delay).
2. `/announce schedule` → kanaal ≠ weerkanaal, `when:2m`, plak lore-tekst in modal.
3. Wacht ≤ ~2,5 min → tekst verschijnt in dat kanaal.
4. `/announce list` / `cancel` voor een tweede pending post.
5. Absoluut: `when:2026-07-31 08:00` (toekomst in `WEATHER_TIMEZONE`).
