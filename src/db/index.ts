import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { WorldState } from '../types.js';

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
