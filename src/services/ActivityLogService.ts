import type Database from 'better-sqlite3';
import {
  countActivityByCategory,
  countDistinctActivityActors,
  insertActivityLog,
  listActivityIssues,
  pruneActivityLog,
  type ActivityLevel,
} from '../db/index.js';

const PRUNE_AFTER_DAYS = 40;
const ISSUE_MESSAGE_MAX = 160;

export type ActivityCategory =
  | 'weather'
  | 'calendar'
  | 'announce'
  | 'command'
  | 'system';

export class ActivityLogService {
  constructor(private readonly db: Database.Database) {}

  ok(category: ActivityCategory, message: string, actorUserId?: string): void {
    this.write('ok', category, message, actorUserId);
  }

  warn(category: ActivityCategory, message: string, actorUserId?: string): void {
    console.warn(message);
    this.write('warn', category, message, actorUserId);
  }

  error(
    category: ActivityCategory,
    message: string,
    error?: unknown,
    actorUserId?: string,
  ): void {
    if (error !== undefined) console.error(message, error);
    else console.error(message);
    const detail =
      error instanceof Error
        ? `${message}: ${error.message}`
        : error !== undefined
          ? `${message}: ${String(error)}`
          : message;
    this.write('error', category, detail, actorUserId);
  }

  summarize(since: Date): {
    weather: number;
    calendar: number;
    announce: number;
    command: number;
    uniqueUsers: number;
    issues: Array<{ created_at: string; level: string; category: string; message: string }>;
  } {
    const sinceIso = since.toISOString();
    const counts = countActivityByCategory(this.db, sinceIso, 'ok');
    return {
      weather: counts.weather ?? 0,
      calendar: counts.calendar ?? 0,
      announce: counts.announce ?? 0,
      command: counts.command ?? 0,
      uniqueUsers: countDistinctActivityActors(this.db, sinceIso, 'command'),
      issues: listActivityIssues(this.db, sinceIso, 8),
    };
  }

  pruneOld(): void {
    const cutoff = new Date(Date.now() - PRUNE_AFTER_DAYS * 86_400_000).toISOString();
    pruneActivityLog(this.db, cutoff);
  }

  private write(
    level: ActivityLevel,
    category: ActivityCategory,
    message: string,
    actorUserId?: string,
  ): void {
    const trimmed =
      message.length > ISSUE_MESSAGE_MAX
        ? `${message.slice(0, ISSUE_MESSAGE_MAX - 1)}…`
        : message;
    insertActivityLog(this.db, {
      level,
      category,
      message: trimmed,
      actorUserId: actorUserId ?? null,
    });
  }
}
