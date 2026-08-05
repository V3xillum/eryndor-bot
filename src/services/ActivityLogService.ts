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

/** How long `activity_log` rows are kept (and the rolling usage window in status reports). */
export const ACTIVITY_LOG_RETENTION_DAYS = PRUNE_AFTER_DAYS;

export type ActivityCategory =
  | 'weather'
  | 'calendar'
  | 'announce'
  | 'command'
  | 'system';

export type ActivityUsageSummary = {
  weather: number;
  calendar: number;
  announce: number;
  command: number;
  uniqueUsers: number;
};

export type ActivitySummary = ActivityUsageSummary & {
  issues: Array<{ created_at: string; level: string; category: string; message: string }>;
};

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

  summarize(since: Date): ActivitySummary {
    const sinceIso = since.toISOString();
    return {
      ...this.usageSince(sinceIso),
      issues: listActivityIssues(this.db, sinceIso, 8),
    };
  }

  /** Usage over the retained activity_log window (same horizon as prune). */
  summarizeRetained(now = new Date()): ActivityUsageSummary {
    const since = new Date(now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * 86_400_000);
    return this.usageSince(since.toISOString());
  }

  pruneOld(): void {
    const cutoff = new Date(Date.now() - PRUNE_AFTER_DAYS * 86_400_000).toISOString();
    pruneActivityLog(this.db, cutoff);
  }

  private usageSince(sinceIso: string): ActivityUsageSummary {
    const counts = countActivityByCategory(this.db, sinceIso, 'ok');
    return {
      weather: counts.weather ?? 0,
      calendar: counts.calendar ?? 0,
      announce: counts.announce ?? 0,
      command: counts.command ?? 0,
      uniqueUsers: countDistinctActivityActors(this.db, sinceIso, 'command'),
    };
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
