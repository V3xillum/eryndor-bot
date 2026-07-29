import type Database from 'better-sqlite3';
import {
  findEntryByRoll,
  findEntryByType,
  listWeatherTypes,
  loadMessages,
  loadWeatherTable,
} from '../content/loader.js';
import * as dbQueries from '../db/index.js';
import type { Messages, WeatherResult, WeatherTableEntry, WorldState } from '../types.js';
import {
  clampToActiveWindow,
  isWithinActiveWindow,
  type ActiveWindow,
} from '../utils/activeWindow.js';
import {
  isPaused,
  randomIntervalMs,
  rollD100,
} from '../utils/helpers.js';

export class WeatherService {
  private readonly table: WeatherTableEntry[];
  readonly messages: Messages;
  private readonly updateMinMinutes: number;
  private readonly updateMaxMinutes: number;
  private readonly activeWindow: ActiveWindow | null;

  constructor(
    private readonly db: Database.Database,
    options: {
      updateMinMinutes: number;
      updateMaxMinutes: number;
      activeWindow: ActiveWindow | null;
    },
  ) {
    this.table = loadWeatherTable();
    this.messages = loadMessages();
    this.updateMinMinutes = options.updateMinMinutes;
    this.updateMaxMinutes = options.updateMaxMinutes;
    this.activeWindow = options.activeWindow;
  }

  getAvailableTypes(): string[] {
    return listWeatherTypes(this.table);
  }

  getWorldState(guildId: string): WorldState | null {
    return dbQueries.getWorldState(this.db, guildId);
  }

  listGuildStates(): WorldState[] {
    return dbQueries.listGuildStates(this.db);
  }

  getCurrentWeather(guildId: string): WeatherResult | null {
    const state = dbQueries.getWorldState(this.db, guildId);
    if (!state?.current_weather_type) return null;

    const entry = findEntryByType(this.table, state.current_weather_type);
    if (!entry) return null;

    return {
      type: entry.type,
      image: entry.image,
      forced: false,
    };
  }

  rollWeather(guildId: string): WeatherResult {
    const roll = rollD100();
    const entry = findEntryByRoll(this.table, roll);
    if (!entry) {
      throw new Error(`No weather table entry covers roll ${roll}`);
    }

    dbQueries.updateWeather(this.db, guildId, entry.type, false);
    this.scheduleNextUpdate(guildId);

    return {
      type: entry.type,
      image: entry.image,
      roll,
      forced: false,
    };
  }

  /**
   * Apply weather from a type name (`storm`) or a physical d100 result (`81`).
   * Type → forced=true; numeric roll → forced=false (external die).
   */
  setFromInput(guildId: string, input: string, durationMs?: number): WeatherResult {
    const trimmed = input.trim();
    const asRoll = /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;

    if (asRoll !== null) {
      if (asRoll < 1 || asRoll > 100) {
        throw new Error(`INVALID_ROLL:${trimmed}`);
      }
      const entry = findEntryByRoll(this.table, asRoll);
      if (!entry) {
        throw new Error(`NO_TABLE_ENTRY:${asRoll}`);
      }
      dbQueries.updateWeather(this.db, guildId, entry.type, false);
      this.applySchedule(guildId, durationMs);
      return {
        type: entry.type,
        image: entry.image,
        roll: asRoll,
        forced: false,
      };
    }

    const entry = findEntryByType(this.table, trimmed);
    if (!entry) {
      throw new Error(`UNKNOWN_TYPE:${trimmed}`);
    }

    dbQueries.updateWeather(this.db, guildId, entry.type, true);
    this.applySchedule(guildId, durationMs);

    return {
      type: entry.type,
      image: entry.image,
      forced: true,
    };
  }

  /** @deprecated Prefer setFromInput — kept name for clarity at call sites that only force types. */
  setWeather(guildId: string, type: string, durationMs?: number): WeatherResult {
    return this.setFromInput(guildId, type, durationMs);
  }

  private applySchedule(guildId: string, durationMs?: number): void {
    if (durationMs !== undefined) {
      this.scheduleIn(guildId, durationMs);
    } else {
      this.scheduleNextUpdate(guildId);
    }
  }

  scheduleNextUpdate(guildId: string): Date {
    let next = new Date(
      Date.now() + randomIntervalMs(this.updateMinMinutes, this.updateMaxMinutes),
    );
    if (this.activeWindow) {
      next = clampToActiveWindow(next, this.activeWindow);
    }
    dbQueries.setNextUpdateAt(this.db, guildId, next.toISOString());
    return next;
  }

  /**
   * Exact delay until the next automatic update (no active-window clamp).
   * Clears pause so the scheduled time can fire.
   */
  scheduleIn(guildId: string, durationMs: number): Date {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('INVALID_DURATION');
    }
    const next = new Date(Date.now() + durationMs);
    dbQueries.setPausedUntil(this.db, guildId, null);
    dbQueries.setNextUpdateAt(this.db, guildId, next.toISOString());
    return next;
  }

  pause(guildId: string, until: Date): void {
    dbQueries.setPausedUntil(this.db, guildId, until.toISOString());
  }

  resume(guildId: string): Date {
    dbQueries.setPausedUntil(this.db, guildId, null);
    return this.scheduleNextUpdate(guildId);
  }

  setup(guildId: string, channelId: string, threadId: string | null): void {
    dbQueries.updateSetup(this.db, guildId, channelId, threadId);
  }

  isGuildPaused(guildId: string, now = new Date()): boolean {
    const state = dbQueries.getWorldState(this.db, guildId);
    return isPaused(state?.paused_until ?? null, now);
  }

  isInActiveWindow(now = new Date()): boolean {
    if (!this.activeWindow) return true;
    return isWithinActiveWindow(now, this.activeWindow);
  }

  getScheduleStatus(guildId: string, now = new Date()): {
    nextUpdateAt: Date | null;
    pausedUntil: Date | null;
    dueButWaitingForWindow: boolean;
  } {
    const state = dbQueries.getWorldState(this.db, guildId);
    const nextUpdateAt = state?.next_update_at ? new Date(state.next_update_at) : null;
    const pausedUntil =
      state?.paused_until && isPaused(state.paused_until, now)
        ? new Date(state.paused_until)
        : null;

    const due =
      nextUpdateAt !== null && nextUpdateAt.getTime() <= now.getTime() && pausedUntil === null;
    const dueButWaitingForWindow = due && !this.isInActiveWindow(now);

    return { nextUpdateAt, pausedUntil, dueButWaitingForWindow };
  }

  /** Guilds whose automatic update is due — never outside the active window. */
  dueGuilds(now = new Date()): WorldState[] {
    if (this.activeWindow && !isWithinActiveWindow(now, this.activeWindow)) {
      return [];
    }

    return this.listGuildStates().filter((state) => {
      if (!state.next_update_at) return false;
      if (isPaused(state.paused_until, now)) return false;
      return new Date(state.next_update_at).getTime() <= now.getTime();
    });
  }
}
