import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ScheduledPost, WorldState } from '../types.js';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'storage', 'world.sqlite');

export function openDatabase(dbPath = DEFAULT_DB_PATH): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_state (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      thread_id TEXT,
      current_weather_type TEXT,
      current_weather_rolled_at DATETIME,
      next_update_at DATETIME,
      paused_until DATETIME,
      season TEXT DEFAULT 'spring',
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS weather_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      weather_type TEXT,
      posted_at DATETIME,
      forced BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      body TEXT NOT NULL,
      post_at DATETIME NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      posted_at DATETIME
    );
  `);

  // Backward-compatible additive columns (do not edit the CREATE above).
  const columns = db.prepare(`PRAGMA table_info(world_state)`).all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has('severity_min')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN severity_min INTEGER`);
  }
  if (!names.has('severity_max')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN severity_max INTEGER`);
  }
  if (!names.has('severity_override_until')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN severity_override_until DATETIME`);
  }
  if (!names.has('magical_mode')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN magical_mode TEXT`);
  }
  if (!names.has('magical_override_until')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN magical_override_until DATETIME`);
  }
  if (!names.has('update_min_minutes')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN update_min_minutes INTEGER`);
  }
  if (!names.has('update_max_minutes')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN update_max_minutes INTEGER`);
  }
  if (!names.has('active_window_enabled')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN active_window_enabled INTEGER`);
  }
  if (!names.has('active_window_start')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN active_window_start TEXT`);
  }
  if (!names.has('active_window_end')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN active_window_end TEXT`);
  }
  if (!names.has('cooldown_enabled')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN cooldown_enabled INTEGER`);
  }
  if (!names.has('cooldown_after_severity')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN cooldown_after_severity INTEGER`);
  }
  if (!names.has('cooldown_max_next_severity')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN cooldown_max_next_severity INTEGER`);
  }
  if (!names.has('calendar_channel_id')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN calendar_channel_id TEXT`);
  }
  if (!names.has('calendar_events_last_handled_date')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN calendar_events_last_handled_date TEXT`);
  }
  if (!names.has('calendar_fullmoon_last_handled_date')) {
    db.exec(`ALTER TABLE world_state ADD COLUMN calendar_fullmoon_last_handled_date TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
  `);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function ensureGuild(db: Database.Database, guildId: string): WorldState {
  const existing = getWorldState(db, guildId);
  if (existing) return existing;

  db.prepare(
    `INSERT INTO world_state (guild_id, season, updated_at) VALUES (?, 'spring', ?)`,
  ).run(guildId, nowIso());

  const created = getWorldState(db, guildId);
  if (!created) throw new Error(`Failed to create world_state for guild ${guildId}`);
  return created;
}

export function getWorldState(db: Database.Database, guildId: string): WorldState | null {
  return (
    db.prepare(`SELECT * FROM world_state WHERE guild_id = ?`).get(guildId) as
      | WorldState
      | undefined
  ) ?? null;
}

export function listGuildStates(db: Database.Database): WorldState[] {
  return db.prepare(`SELECT * FROM world_state`).all() as WorldState[];
}

export function updateSetup(
  db: Database.Database,
  guildId: string,
  channelId: string,
  threadId: string | null,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET channel_id = ?, thread_id = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(channelId, threadId, nowIso(), guildId);
}

export function updateCalendarSetup(
  db: Database.Database,
  guildId: string,
  channelId: string | null,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET calendar_channel_id = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(channelId, nowIso(), guildId);
}

/** Mark today's calendar-events check as done (posted or skipped empty). */
export function setCalendarEventsLastHandledDate(
  db: Database.Database,
  guildId: string,
  localDateIso: string,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET calendar_events_last_handled_date = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(localDateIso, nowIso(), guildId);
}

/** Mark today's full-moon evening check as done (posted Rising/exact or skipped). */
export function setCalendarFullMoonLastHandledDate(
  db: Database.Database,
  guildId: string,
  localDateIso: string,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET calendar_fullmoon_last_handled_date = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(localDateIso, nowIso(), guildId);
}

export function updateWeather(
  db: Database.Database,
  guildId: string,
  weatherType: string,
  forced: boolean,
): void {
  ensureGuild(db, guildId);
  const stamped = nowIso();
  db.prepare(
    `UPDATE world_state
     SET current_weather_type = ?, current_weather_rolled_at = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(weatherType, stamped, stamped, guildId);

  db.prepare(
    `INSERT INTO weather_log (guild_id, weather_type, posted_at, forced)
     VALUES (?, ?, ?, ?)`,
  ).run(guildId, weatherType, stamped, forced ? 1 : 0);
}

export function setNextUpdateAt(
  db: Database.Database,
  guildId: string,
  nextUpdateAt: string,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state SET next_update_at = ?, updated_at = ? WHERE guild_id = ?`,
  ).run(nextUpdateAt, nowIso(), guildId);
}

export function setPausedUntil(
  db: Database.Database,
  guildId: string,
  pausedUntil: string | null,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state SET paused_until = ?, updated_at = ? WHERE guild_id = ?`,
  ).run(pausedUntil, nowIso(), guildId);
}

export function getLatestWeatherLog(
  db: Database.Database,
  guildId: string,
): { weather_type: string; posted_at: string; forced: number } | null {
  return (
    (db
      .prepare(
        `SELECT weather_type, posted_at, forced
         FROM weather_log
         WHERE guild_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(guildId) as { weather_type: string; posted_at: string; forced: number } | undefined) ??
    null
  );
}

export function setSeverityOverride(
  db: Database.Database,
  guildId: string,
  min: number,
  max: number,
  untilIso: string,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET severity_min = ?, severity_max = ?, severity_override_until = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(min, max, untilIso, nowIso(), guildId);
}

export function clearSeverityOverride(db: Database.Database, guildId: string): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET severity_min = NULL, severity_max = NULL, severity_override_until = NULL, updated_at = ?
     WHERE guild_id = ?`,
  ).run(nowIso(), guildId);
}

export function setMagicalOverride(
  db: Database.Database,
  guildId: string,
  mode: 'only' | 'none',
  untilIso: string,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET magical_mode = ?, magical_override_until = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(mode, untilIso, nowIso(), guildId);
}

export function clearMagicalOverride(db: Database.Database, guildId: string): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET magical_mode = NULL, magical_override_until = NULL, updated_at = ?
     WHERE guild_id = ?`,
  ).run(nowIso(), guildId);
}

export function setUpdateInterval(
  db: Database.Database,
  guildId: string,
  minMinutes: number,
  maxMinutes: number,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET update_min_minutes = ?, update_max_minutes = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(minMinutes, maxMinutes, nowIso(), guildId);
}

export function setActiveWindowOverride(
  db: Database.Database,
  guildId: string,
  enabled: boolean,
  start: string | null,
  end: string | null,
): void {
  ensureGuild(db, guildId);
  db.prepare(
    `UPDATE world_state
     SET active_window_enabled = ?, active_window_start = ?, active_window_end = ?, updated_at = ?
     WHERE guild_id = ?`,
  ).run(enabled ? 1 : 0, start, end, nowIso(), guildId);
}

/** Clears guild schedule overrides (interval + active window) → fall back to `.env`. */
export function clearScheduleOverrides(db: Database.Database, guildId: string): boolean {
  ensureGuild(db, guildId);
  const state = getWorldState(db, guildId);
  const hadOverride = hasScheduleOverrides(state);

  db.prepare(
    `UPDATE world_state
     SET update_min_minutes = NULL,
         update_max_minutes = NULL,
         active_window_enabled = NULL,
         active_window_start = NULL,
         active_window_end = NULL,
         updated_at = ?
     WHERE guild_id = ?`,
  ).run(nowIso(), guildId);

  return hadOverride;
}

function hasScheduleOverrides(state: WorldState | null): boolean {
  return (
    state !== null &&
    (state.update_min_minutes != null ||
      state.update_max_minutes != null ||
      state.active_window_enabled != null ||
      state.active_window_start != null ||
      state.active_window_end != null)
  );
}

function hasCooldownOverrides(state: WorldState | null): boolean {
  return (
    state !== null &&
    (state.cooldown_enabled != null ||
      state.cooldown_after_severity != null ||
      state.cooldown_max_next_severity != null)
  );
}

/**
 * Patch per-guild cooldown overrides. Only provided keys are written;
 * omitted keys keep their current DB value (null = inherit content).
 */
export function setCooldownOverrides(
  db: Database.Database,
  guildId: string,
  patch: {
    enabled?: boolean;
    afterSeverity?: number;
    maxNextSeverity?: number;
  },
): void {
  ensureGuild(db, guildId);
  const state = getWorldState(db, guildId);
  const enabled =
    patch.enabled !== undefined
      ? patch.enabled
        ? 1
        : 0
      : (state?.cooldown_enabled ?? null);
  const afterSeverity =
    patch.afterSeverity !== undefined
      ? patch.afterSeverity
      : (state?.cooldown_after_severity ?? null);
  const maxNextSeverity =
    patch.maxNextSeverity !== undefined
      ? patch.maxNextSeverity
      : (state?.cooldown_max_next_severity ?? null);

  db.prepare(
    `UPDATE world_state
     SET cooldown_enabled = ?,
         cooldown_after_severity = ?,
         cooldown_max_next_severity = ?,
         updated_at = ?
     WHERE guild_id = ?`,
  ).run(enabled, afterSeverity, maxNextSeverity, nowIso(), guildId);
}

/** Clears guild cooldown overrides → fall back to `weather-rules.json`. */
export function clearCooldownOverrides(db: Database.Database, guildId: string): boolean {
  ensureGuild(db, guildId);
  const state = getWorldState(db, guildId);
  const hadOverride = hasCooldownOverrides(state);

  db.prepare(
    `UPDATE world_state
     SET cooldown_enabled = NULL,
         cooldown_after_severity = NULL,
         cooldown_max_next_severity = NULL,
         updated_at = ?
     WHERE guild_id = ?`,
  ).run(nowIso(), guildId);

  return hadOverride;
}

export function insertScheduledPost(
  db: Database.Database,
  input: {
    guildId: string;
    channelId: string;
    body: string;
    postAt: string;
    createdBy: string;
  },
): ScheduledPost {
  const createdAt = nowIso();
  const result = db
    .prepare(
      `INSERT INTO scheduled_posts
         (guild_id, channel_id, body, post_at, created_by, created_at, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      input.guildId,
      input.channelId,
      input.body,
      input.postAt,
      input.createdBy,
      createdAt,
    );

  const row = getScheduledPost(db, Number(result.lastInsertRowid));
  if (!row) throw new Error('Failed to insert scheduled_posts row');
  return row;
}

export function getScheduledPost(
  db: Database.Database,
  id: number,
): ScheduledPost | null {
  return (
    (db.prepare(`SELECT * FROM scheduled_posts WHERE id = ?`).get(id) as
      | ScheduledPost
      | undefined) ?? null
  );
}

export function listPendingScheduledPosts(
  db: Database.Database,
  guildId: string,
): ScheduledPost[] {
  return db
    .prepare(
      `SELECT * FROM scheduled_posts
       WHERE guild_id = ? AND posted_at IS NULL
       ORDER BY post_at ASC, id ASC`,
    )
    .all(guildId) as ScheduledPost[];
}

/** Pending posts whose post_at is at or before `nowIso`. */
export function listDueScheduledPosts(
  db: Database.Database,
  nowIsoValue = nowIso(),
): ScheduledPost[] {
  return db
    .prepare(
      `SELECT * FROM scheduled_posts
       WHERE posted_at IS NULL AND post_at <= ?
       ORDER BY post_at ASC, id ASC`,
    )
    .all(nowIsoValue) as ScheduledPost[];
}

export function markScheduledPostPosted(
  db: Database.Database,
  id: number,
  postedAt = nowIso(),
): void {
  db.prepare(
    `UPDATE scheduled_posts SET posted_at = ? WHERE id = ? AND posted_at IS NULL`,
  ).run(postedAt, id);
}

/** Deletes a pending post for this guild. Returns false if missing or already posted. */
export function cancelScheduledPost(
  db: Database.Database,
  guildId: string,
  id: number,
): boolean {
  const result = db
    .prepare(
      `DELETE FROM scheduled_posts
       WHERE id = ? AND guild_id = ? AND posted_at IS NULL`,
    )
    .run(id, guildId);
  return result.changes > 0;
}

export type ActivityLevel = 'ok' | 'warn' | 'error';

export function insertActivityLog(
  db: Database.Database,
  entry: { level: ActivityLevel; category: string; message: string; createdAt?: string },
): void {
  db.prepare(
    `INSERT INTO activity_log (created_at, level, category, message) VALUES (?, ?, ?, ?)`,
  ).run(entry.createdAt ?? nowIso(), entry.level, entry.category, entry.message);
}

export function countActivityByCategory(
  db: Database.Database,
  sinceIso: string,
  level: ActivityLevel = 'ok',
): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS n
       FROM activity_log
       WHERE created_at >= ? AND level = ?
       GROUP BY category`,
    )
    .all(sinceIso, level) as Array<{ category: string; n: number }>;

  const out: Record<string, number> = {};
  for (const row of rows) out[row.category] = row.n;
  return out;
}

export function listActivityIssues(
  db: Database.Database,
  sinceIso: string,
  limit: number,
): Array<{ created_at: string; level: string; category: string; message: string }> {
  return db
    .prepare(
      `SELECT created_at, level, category, message
       FROM activity_log
       WHERE created_at >= ? AND level IN ('warn', 'error')
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(sinceIso, limit) as Array<{
    created_at: string;
    level: string;
    category: string;
    message: string;
  }>;
}

export function pruneActivityLog(db: Database.Database, olderThanIso: string): void {
  db.prepare(`DELETE FROM activity_log WHERE created_at < ?`).run(olderThanIso);
}

export function getBotMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM bot_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setBotMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO bot_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
