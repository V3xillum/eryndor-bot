import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Building,
  BuildingCost,
  BuildingFunding,
  BuildingStatus,
  GuildStockRow,
  ProductionInterval,
  ProductionSource,
  ResourceLedgerEntry,
  ResourceSettings,
  ResourceType,
  ScheduledPost,
  WorldState,
} from '../types.js';
import { normalizeResourceKey } from '../utils/resourceKeys.js';

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

    CREATE TABLE IF NOT EXISTS resource_settings (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      updated_at DATETIME NOT NULL,
      storage_cap INTEGER NOT NULL DEFAULT 300,
      production_last_post_date TEXT
    );

    CREATE TABLE IF NOT EXISTS resource_types (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      sell_gc INTEGER NOT NULL,
      buy_gc INTEGER NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (guild_id, key)
    );

    CREATE TABLE IF NOT EXISTS guild_stock (
      guild_id TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, resource_key)
    );

    CREATE TABLE IF NOT EXISTS player_stock (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, resource_key)
    );

    CREATE TABLE IF NOT EXISTS production_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      workers INTEGER NOT NULL DEFAULT 0,
      max_workers INTEGER NOT NULL DEFAULT 5,
      yield_per_worker INTEGER NOT NULL,
      interval TEXT NOT NULL,
      last_paid_period TEXT,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_production_sources_guild_name
      ON production_sources (guild_id, name_key);

    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      status TEXT NOT NULL,
      time_required INTEGER NOT NULL DEFAULT 0,
      time_spent INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS building_costs (
      building_id INTEGER NOT NULL,
      resource_key TEXT NOT NULL,
      required_qty INTEGER NOT NULL,
      PRIMARY KEY (building_id, resource_key)
    );

    CREATE TABLE IF NOT EXISTS building_funding (
      building_id INTEGER NOT NULL,
      resource_key TEXT NOT NULL,
      deposited_qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (building_id, resource_key)
    );

    CREATE TABLE IF NOT EXISTS resource_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_nickname TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_key TEXT,
      amount INTEGER NOT NULL,
      gc_delta INTEGER NOT NULL DEFAULT 0,
      building_id INTEGER,
      stock_after INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_resource_ledger_guild_created
      ON resource_ledger (guild_id, created_at);
  `);

  // Active projects only — cancelled names can be reused.
  db.exec(`DROP INDEX IF EXISTS idx_buildings_guild_name_key`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_buildings_guild_name_key_active
      ON buildings (guild_id, name_key)
      WHERE status != 'cancelled'
  `);

  // Older rows used schema default 0; new inserts use DEFAULT_BUILD_TIME (100).
  db.prepare(
    `UPDATE buildings
     SET time_required = 100
     WHERE time_required = 0
       AND status IN ('funding', 'building')`,
  ).run();

  // Additive columns on resource_settings (older DBs).
  const resourceSettingsCols = db
    .prepare(`PRAGMA table_info(resource_settings)`)
    .all() as Array<{ name: string }>;
  const rsNames = new Set(resourceSettingsCols.map((c) => c.name));
  if (!rsNames.has('storage_cap')) {
    db.exec(
      `ALTER TABLE resource_settings ADD COLUMN storage_cap INTEGER NOT NULL DEFAULT 300`,
    );
  }
  if (!rsNames.has('production_last_post_date')) {
    db.exec(`ALTER TABLE resource_settings ADD COLUMN production_last_post_date TEXT`);
  }
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

// --- Guild resources & buildings ---

export function getResourceSettings(
  db: Database.Database,
  guildId: string,
): ResourceSettings | null {
  return (
    (db.prepare(`SELECT * FROM resource_settings WHERE guild_id = ?`).get(guildId) as
      | ResourceSettings
      | undefined) ?? null
  );
}

export function upsertResourceSettings(
  db: Database.Database,
  guildId: string,
  channelId: string,
): ResourceSettings {
  const updatedAt = nowIso();
  db.prepare(
    `INSERT INTO resource_settings (guild_id, channel_id, updated_at, storage_cap)
     VALUES (?, ?, ?, 300)
     ON CONFLICT(guild_id) DO UPDATE SET
       channel_id = excluded.channel_id,
       updated_at = excluded.updated_at`,
  ).run(guildId, channelId, updatedAt);
  const row = getResourceSettings(db, guildId);
  if (!row) throw new Error(`Failed to upsert resource_settings for ${guildId}`);
  return row;
}

export function setStorageCap(
  db: Database.Database,
  guildId: string,
  cap: number,
): ResourceSettings | null {
  const existing = getResourceSettings(db, guildId);
  if (!existing) return null;
  db.prepare(
    `UPDATE resource_settings SET storage_cap = ?, updated_at = ? WHERE guild_id = ?`,
  ).run(cap, nowIso(), guildId);
  return getResourceSettings(db, guildId);
}

export function setProductionLastPostDate(
  db: Database.Database,
  guildId: string,
  dateIso: string,
): void {
  db.prepare(
    `UPDATE resource_settings SET production_last_post_date = ? WHERE guild_id = ?`,
  ).run(dateIso, guildId);
}

export const DEFAULT_STORAGE_CAP = 300;

export function getStorageCap(db: Database.Database, guildId: string): number {
  const settings = getResourceSettings(db, guildId);
  const cap = settings?.storage_cap;
  if (typeof cap === 'number' && Number.isInteger(cap) && cap > 0) return cap;
  return DEFAULT_STORAGE_CAP;
}

/**
 * Add to guild stock respecting per-type storage cap.
 * Returns how much was stored, how much overflowed, and quantity after.
 */
export function addGuildStockCapped(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
  amount: number,
  cap = getStorageCap(db, guildId),
): { added: number; overflow: number; stockAfter: number } {
  if (amount <= 0) {
    return { added: 0, overflow: 0, stockAfter: getStockQuantity(db, guildId, resourceKey) };
  }
  const current = getStockQuantity(db, guildId, resourceKey);
  const room = Math.max(0, cap - current);
  const added = Math.min(amount, room);
  const overflow = amount - added;
  const stockAfter = setStockQuantity(db, guildId, resourceKey, current + added);
  return { added, overflow, stockAfter };
}

export function clearResourceSettings(db: Database.Database, guildId: string): boolean {
  const result = db.prepare(`DELETE FROM resource_settings WHERE guild_id = ?`).run(guildId);
  return result.changes > 0;
}

export function getResourceType(
  db: Database.Database,
  guildId: string,
  key: string,
): ResourceType | null {
  return (
    (db
      .prepare(`SELECT * FROM resource_types WHERE guild_id = ? AND key = ?`)
      .get(guildId, key) as ResourceType | undefined) ?? null
  );
}

/**
 * Resolve a type by stable key slug and/or current display name
 * (so renamed types remain findable by their visible name).
 */
export function findResourceType(
  db: Database.Database,
  guildId: string,
  raw: string,
): ResourceType | null {
  const slug = normalizeResourceKey(raw);
  if (slug) {
    const byKey = getResourceType(db, guildId, slug);
    if (byKey) return byKey;
  }

  const needle = raw.trim().toLowerCase();
  if (!needle) return null;

  const rows = listResourceTypes(db, guildId);
  return rows.find((t) => t.display_name.toLowerCase() === needle) ?? null;
}

export function listResourceTypes(db: Database.Database, guildId: string): ResourceType[] {
  return db
    .prepare(
      `SELECT * FROM resource_types WHERE guild_id = ? ORDER BY key ASC`,
    )
    .all(guildId) as ResourceType[];
}

export function insertResourceType(
  db: Database.Database,
  input: {
    guildId: string;
    key: string;
    displayName: string;
    sellGc: number;
    buyGc: number;
  },
): ResourceType {
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO resource_types (guild_id, key, display_name, sell_gc, buy_gc, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.guildId,
    input.key,
    input.displayName,
    input.sellGc,
    input.buyGc,
    createdAt,
  );
  const row = getResourceType(db, input.guildId, input.key);
  if (!row) throw new Error('Failed to insert resource_types row');
  return row;
}

export function updateResourceType(
  db: Database.Database,
  guildId: string,
  key: string,
  patch: { displayName?: string; sellGc?: number; buyGc?: number },
): ResourceType | null {
  const existing = getResourceType(db, guildId, key);
  if (!existing) return null;

  const displayName = patch.displayName ?? existing.display_name;
  const sellGc = patch.sellGc ?? existing.sell_gc;
  const buyGc = patch.buyGc ?? existing.buy_gc;

  db.prepare(
    `UPDATE resource_types
     SET display_name = ?, sell_gc = ?, buy_gc = ?
     WHERE guild_id = ? AND key = ?`,
  ).run(displayName, sellGc, buyGc, guildId, key);

  return getResourceType(db, guildId, key);
}

export function deleteResourceType(
  db: Database.Database,
  guildId: string,
  key: string,
): boolean {
  const result = db
    .prepare(`DELETE FROM resource_types WHERE guild_id = ? AND key = ?`)
    .run(guildId, key);
  return result.changes > 0;
}

export function getStockQuantity(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
): number {
  const row = db
    .prepare(
      `SELECT quantity FROM guild_stock WHERE guild_id = ? AND resource_key = ?`,
    )
    .get(guildId, resourceKey) as { quantity: number } | undefined;
  return row?.quantity ?? 0;
}

export function listGuildStock(db: Database.Database, guildId: string): GuildStockRow[] {
  return db
    .prepare(
      `SELECT * FROM guild_stock
       WHERE guild_id = ? AND quantity > 0
       ORDER BY resource_key ASC`,
    )
    .all(guildId) as GuildStockRow[];
}

/** Sets absolute quantity (clamped to >= 0). Returns quantity after write. */
export function setStockQuantity(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
  quantity: number,
): number {
  const q = Math.max(0, quantity);
  if (q === 0) {
    db.prepare(
      `DELETE FROM guild_stock WHERE guild_id = ? AND resource_key = ?`,
    ).run(guildId, resourceKey);
    return 0;
  }
  db.prepare(
    `INSERT INTO guild_stock (guild_id, resource_key, quantity)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id, resource_key) DO UPDATE SET quantity = excluded.quantity`,
  ).run(guildId, resourceKey, q);
  return q;
}

export function addStockQuantity(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
  delta: number,
): number {
  const next = getStockQuantity(db, guildId, resourceKey) + delta;
  return setStockQuantity(db, guildId, resourceKey, next);
}

export function getPlayerStockQuantity(
  db: Database.Database,
  guildId: string,
  userId: string,
  resourceKey: string,
): number {
  const row = db
    .prepare(
      `SELECT quantity FROM player_stock
       WHERE guild_id = ? AND user_id = ? AND resource_key = ?`,
    )
    .get(guildId, userId, resourceKey) as { quantity: number } | undefined;
  return row?.quantity ?? 0;
}

export function listPlayerStock(
  db: Database.Database,
  guildId: string,
  userId: string,
): Array<{ guild_id: string; user_id: string; resource_key: string; quantity: number }> {
  return db
    .prepare(
      `SELECT * FROM player_stock
       WHERE guild_id = ? AND user_id = ? AND quantity > 0
       ORDER BY resource_key ASC`,
    )
    .all(guildId, userId) as Array<{
    guild_id: string;
    user_id: string;
    resource_key: string;
    quantity: number;
  }>;
}

/** All personal stock rows with qty > 0 for a guild (status-report backup). */
export function listAllPlayerStock(
  db: Database.Database,
  guildId: string,
): Array<{ user_id: string; resource_key: string; quantity: number }> {
  return db
    .prepare(
      `SELECT user_id, resource_key, quantity FROM player_stock
       WHERE guild_id = ? AND quantity > 0
       ORDER BY user_id ASC, resource_key ASC`,
    )
    .all(guildId) as Array<{ user_id: string; resource_key: string; quantity: number }>;
}

export function setPlayerStockQuantity(
  db: Database.Database,
  guildId: string,
  userId: string,
  resourceKey: string,
  quantity: number,
): number {
  const q = Math.max(0, quantity);
  if (q === 0) {
    db.prepare(
      `DELETE FROM player_stock
       WHERE guild_id = ? AND user_id = ? AND resource_key = ?`,
    ).run(guildId, userId, resourceKey);
    return 0;
  }
  db.prepare(
    `INSERT INTO player_stock (guild_id, user_id, resource_key, quantity)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id, resource_key) DO UPDATE SET
       quantity = excluded.quantity`,
  ).run(guildId, userId, resourceKey, q);
  return q;
}

export function addPlayerStockQuantity(
  db: Database.Database,
  guildId: string,
  userId: string,
  resourceKey: string,
  delta: number,
): number {
  const next = getPlayerStockQuantity(db, guildId, userId, resourceKey) + delta;
  return setPlayerStockQuantity(db, guildId, userId, resourceKey, next);
}

export function totalPlayerStockForKey(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS n FROM player_stock
       WHERE guild_id = ? AND resource_key = ?`,
    )
    .get(guildId, resourceKey) as { n: number };
  return row.n;
}

export function insertResourceLedger(
  db: Database.Database,
  entry: {
    guildId: string;
    actorUserId: string;
    actorNickname: string;
    action: string;
    resourceKey?: string | null;
    amount: number;
    gcDelta?: number;
    buildingId?: number | null;
    stockAfter?: number | null;
  },
): ResourceLedgerEntry {
  const createdAt = nowIso();
  const result = db
    .prepare(
      `INSERT INTO resource_ledger
         (guild_id, created_at, actor_user_id, actor_nickname, action,
          resource_key, amount, gc_delta, building_id, stock_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.guildId,
      createdAt,
      entry.actorUserId,
      entry.actorNickname,
      entry.action,
      entry.resourceKey ?? null,
      entry.amount,
      entry.gcDelta ?? 0,
      entry.buildingId ?? null,
      entry.stockAfter ?? null,
    );

  const row = db
    .prepare(`SELECT * FROM resource_ledger WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ResourceLedgerEntry | undefined;
  if (!row) throw new Error('Failed to insert resource_ledger row');
  return row;
}

export function listResourceLedgerSince(
  db: Database.Database,
  guildId: string,
  sinceIso: string,
  limit: number,
): ResourceLedgerEntry[] {
  return db
    .prepare(
      `SELECT * FROM resource_ledger
       WHERE guild_id = ? AND created_at >= ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(guildId, sinceIso, limit) as ResourceLedgerEntry[];
}

export function countResourceLedgerSince(
  db: Database.Database,
  guildId: string,
  sinceIso: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM resource_ledger
       WHERE guild_id = ? AND created_at >= ?`,
    )
    .get(guildId, sinceIso) as { n: number };
  return row.n;
}

export function isResourceKeyInActiveBuildings(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok
       FROM buildings b
       JOIN building_costs c ON c.building_id = b.id
       WHERE b.guild_id = ? AND c.resource_key = ?
         AND b.status IN ('funding', 'building')
       LIMIT 1`,
    )
    .get(guildId, resourceKey) as { ok: number } | undefined;
  if (row) return true;

  const funded = db
    .prepare(
      `SELECT 1 AS ok
       FROM buildings b
       JOIN building_funding f ON f.building_id = b.id
       WHERE b.guild_id = ? AND f.resource_key = ? AND f.deposited_qty > 0
         AND b.status IN ('funding', 'building')
       LIMIT 1`,
    )
    .get(guildId, resourceKey) as { ok: number } | undefined;
  return Boolean(funded);
}

export function getBuildingById(db: Database.Database, id: number): Building | null {
  return (
    (db.prepare(`SELECT * FROM buildings WHERE id = ?`).get(id) as Building | undefined) ??
    null
  );
}

export function getBuildingByNameKey(
  db: Database.Database,
  guildId: string,
  nameKey: string,
): Building | null {
  return (
    (db
      .prepare(
        `SELECT * FROM buildings
         WHERE guild_id = ? AND name_key = ? AND status != 'cancelled'`,
      )
      .get(guildId, nameKey) as Building | undefined) ?? null
  );
}

export function listBuildings(
  db: Database.Database,
  guildId: string,
  includeCancelled = false,
): Building[] {
  if (includeCancelled) {
    return db
      .prepare(
        `SELECT * FROM buildings WHERE guild_id = ? ORDER BY id ASC`,
      )
      .all(guildId) as Building[];
  }
  return db
    .prepare(
      `SELECT * FROM buildings
       WHERE guild_id = ? AND status != 'cancelled'
       ORDER BY
         CASE status
           WHEN 'funding' THEN 0
           WHEN 'building' THEN 1
           WHEN 'complete' THEN 2
           ELSE 3
         END,
         id ASC`,
    )
    .all(guildId) as Building[];
}

export const DEFAULT_BUILD_TIME = 100;

export function insertBuilding(
  db: Database.Database,
  input: { guildId: string; name: string; nameKey: string; timeRequired?: number },
): Building {
  const createdAt = nowIso();
  const timeRequired =
    input.timeRequired != null && Number.isInteger(input.timeRequired) && input.timeRequired > 0
      ? input.timeRequired
      : DEFAULT_BUILD_TIME;
  const result = db
    .prepare(
      `INSERT INTO buildings
         (guild_id, name, name_key, status, time_required, time_spent, created_at, completed_at)
       VALUES (?, ?, ?, 'funding', ?, 0, ?, NULL)`,
    )
    .run(input.guildId, input.name, input.nameKey, timeRequired, createdAt);

  const row = getBuildingById(db, Number(result.lastInsertRowid));
  if (!row) throw new Error('Failed to insert buildings row');
  return row;
}

export function updateBuildingStatus(
  db: Database.Database,
  id: number,
  status: BuildingStatus,
  completedAt: string | null = null,
): void {
  db.prepare(
    `UPDATE buildings SET status = ?, completed_at = ? WHERE id = ?`,
  ).run(status, completedAt, id);
}

export function updateBuildingTimeRequired(
  db: Database.Database,
  id: number,
  timeRequired: number,
): void {
  db.prepare(`UPDATE buildings SET time_required = ? WHERE id = ?`).run(timeRequired, id);
}

export function updateBuildingTimeSpent(
  db: Database.Database,
  id: number,
  timeSpent: number,
): void {
  db.prepare(`UPDATE buildings SET time_spent = ? WHERE id = ?`).run(timeSpent, id);
}

export function listBuildingCosts(
  db: Database.Database,
  buildingId: number,
): BuildingCost[] {
  return db
    .prepare(
      `SELECT * FROM building_costs WHERE building_id = ? ORDER BY resource_key ASC`,
    )
    .all(buildingId) as BuildingCost[];
}

export function upsertBuildingCost(
  db: Database.Database,
  buildingId: number,
  resourceKey: string,
  requiredQty: number,
): void {
  db.prepare(
    `INSERT INTO building_costs (building_id, resource_key, required_qty)
     VALUES (?, ?, ?)
     ON CONFLICT(building_id, resource_key) DO UPDATE SET
       required_qty = excluded.required_qty`,
  ).run(buildingId, resourceKey, requiredQty);
}

export function listBuildingFunding(
  db: Database.Database,
  buildingId: number,
): BuildingFunding[] {
  return db
    .prepare(
      `SELECT * FROM building_funding WHERE building_id = ? ORDER BY resource_key ASC`,
    )
    .all(buildingId) as BuildingFunding[];
}

export function getBuildingFundingQty(
  db: Database.Database,
  buildingId: number,
  resourceKey: string,
): number {
  const row = db
    .prepare(
      `SELECT deposited_qty FROM building_funding
       WHERE building_id = ? AND resource_key = ?`,
    )
    .get(buildingId, resourceKey) as { deposited_qty: number } | undefined;
  return row?.deposited_qty ?? 0;
}

export function addBuildingFunding(
  db: Database.Database,
  buildingId: number,
  resourceKey: string,
  delta: number,
): number {
  const next = getBuildingFundingQty(db, buildingId, resourceKey) + delta;
  db.prepare(
    `INSERT INTO building_funding (building_id, resource_key, deposited_qty)
     VALUES (?, ?, ?)
     ON CONFLICT(building_id, resource_key) DO UPDATE SET
       deposited_qty = excluded.deposited_qty`,
  ).run(buildingId, resourceKey, next);
  return next;
}

export function buildingHasAnyFunding(db: Database.Database, buildingId: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM building_funding
       WHERE building_id = ? AND deposited_qty > 0
       LIMIT 1`,
    )
    .get(buildingId) as { ok: number } | undefined;
  return Boolean(row);
}

export function listOpenBuildingsForReport(db: Database.Database, guildId: string): Building[] {
  return db
    .prepare(
      `SELECT * FROM buildings
       WHERE guild_id = ? AND status IN ('funding', 'building')
       ORDER BY id ASC`,
    )
    .all(guildId) as Building[];
}

export function listGuildIdsWithResourceData(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT guild_id FROM resource_settings
       UNION
       SELECT guild_id FROM resource_types
       UNION
       SELECT guild_id FROM buildings
       UNION
       SELECT guild_id FROM player_stock
       UNION
       SELECT guild_id FROM production_sources`,
    )
    .all() as Array<{ guild_id: string }>;
  return rows.map((r) => r.guild_id);
}

export function isResourceKeyInProduction(
  db: Database.Database,
  guildId: string,
  resourceKey: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM production_sources
       WHERE guild_id = ? AND resource_key = ?
       LIMIT 1`,
    )
    .get(guildId, resourceKey) as { ok: number } | undefined;
  return Boolean(row);
}

export function listProductionSources(
  db: Database.Database,
  guildId: string,
): ProductionSource[] {
  return db
    .prepare(
      `SELECT * FROM production_sources
       WHERE guild_id = ?
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(guildId) as ProductionSource[];
}

export function getProductionSourceById(
  db: Database.Database,
  id: number,
): ProductionSource | null {
  return (
    (db
      .prepare(`SELECT * FROM production_sources WHERE id = ?`)
      .get(id) as ProductionSource | undefined) ?? null
  );
}

export function getProductionSourceByNameKey(
  db: Database.Database,
  guildId: string,
  nameKey: string,
): ProductionSource | null {
  return (
    (db
      .prepare(
        `SELECT * FROM production_sources WHERE guild_id = ? AND name_key = ?`,
      )
      .get(guildId, nameKey) as ProductionSource | undefined) ?? null
  );
}

export function insertProductionSource(
  db: Database.Database,
  input: {
    guildId: string;
    name: string;
    nameKey: string;
    resourceKey: string;
    workers: number;
    maxWorkers: number;
    yieldPerWorker: number;
    interval: ProductionInterval;
  },
): ProductionSource {
  const stamped = nowIso();
  const result = db
    .prepare(
      `INSERT INTO production_sources
         (guild_id, name, name_key, resource_key, workers, max_workers,
          yield_per_worker, interval, last_paid_period, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      input.guildId,
      input.name,
      input.nameKey,
      input.resourceKey,
      input.workers,
      input.maxWorkers,
      input.yieldPerWorker,
      input.interval,
      stamped,
      stamped,
    );
  const row = getProductionSourceById(db, Number(result.lastInsertRowid));
  if (!row) throw new Error('Failed to insert production_sources row');
  return row;
}

export function updateProductionWorkers(
  db: Database.Database,
  id: number,
  workers: number,
): ProductionSource | null {
  db.prepare(
    `UPDATE production_sources SET workers = ?, updated_at = ? WHERE id = ?`,
  ).run(workers, nowIso(), id);
  return getProductionSourceById(db, id);
}

export function updateProductionYield(
  db: Database.Database,
  id: number,
  yieldPerWorker: number,
): ProductionSource | null {
  db.prepare(
    `UPDATE production_sources
     SET yield_per_worker = ?, updated_at = ?
     WHERE id = ?`,
  ).run(yieldPerWorker, nowIso(), id);
  return getProductionSourceById(db, id);
}

export function updateProductionLastPaid(
  db: Database.Database,
  id: number,
  period: string,
): void {
  db.prepare(
    `UPDATE production_sources
     SET last_paid_period = ?, updated_at = ?
     WHERE id = ?`,
  ).run(period, nowIso(), id);
}

export function deleteProductionSource(db: Database.Database, id: number): boolean {
  const result = db.prepare(`DELETE FROM production_sources WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function listGuildIdsWithProductionSettings(
  db: Database.Database,
): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.guild_id AS guild_id
       FROM resource_settings s
       JOIN production_sources p ON p.guild_id = s.guild_id
       WHERE s.channel_id IS NOT NULL AND s.channel_id != ''`,
    )
    .all() as Array<{ guild_id: string }>;
  return rows.map((r) => r.guild_id);
}
