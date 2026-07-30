import type Database from 'better-sqlite3';
import { EmbedBuilder } from 'discord.js';
import {
  countEntriesInSeverityRange,
  countEntriesWithMagicalMode,
  entryHasDurationRange,
  filterDialIntersection,
  findEntryByRoll,
  findEntryByType,
  listWeatherTypes,
  loadMessages,
  loadWeatherRules,
  loadWeatherTable,
  pickWeightedFromPool,
  resolveRollPool,
} from '../content/loader.js';
import * as dbQueries from '../db/index.js';
import type {
  MagicalMode,
  Messages,
  WeatherResult,
  WeatherRules,
  WeatherTableEntry,
  WorldState,
} from '../types.js';
import {
  clampToActiveWindow,
  isWithinActiveWindow,
  type ActiveWindow,
} from '../utils/activeWindow.js';
import {
  formatTemplate,
  isPaused,
  randomIntervalFromHours,
  randomIntervalMs,
} from '../utils/helpers.js';

export interface WeatherAdminStatus {
  type: string | null;
  severity: number | null;
  magical: boolean | null;
  forced: boolean;
  rolledAt: Date | null;
  nextUpdateAt: Date | null;
  pausedUntil: Date | null;
  dueButWaitingForWindow: boolean;
  durationMinHours: number | null;
  durationMaxHours: number | null;
  usesEnvDuration: boolean | null;
  cooldownActive: boolean;
  effectiveMaxNextSeverity: number | null;
  cooldownAfterSeverity: number;
  cooldownMaxNextSeverity: number;
  dialActive: boolean;
  dialMin: number | null;
  dialMax: number | null;
  dialUntil: Date | null;
  magicalDialActive: boolean;
  magicalDialMode: MagicalMode | null;
  magicalDialUntil: Date | null;
}

export class WeatherService {
  private readonly table: WeatherTableEntry[];
  private readonly rules: WeatherRules;
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
    this.rules = loadWeatherRules();
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

  /** Active dial band if override_until is still in the future; otherwise null. */
  getActiveSeverityDial(
    guildId: string,
    now = new Date(),
  ): { min: number; max: number; until: Date } | null {
    const state = dbQueries.getWorldState(this.db, guildId);
    return this.readActiveDial(state, now);
  }

  getActiveMagicalDial(
    guildId: string,
    now = new Date(),
  ): { mode: MagicalMode; until: Date } | null {
    const state = dbQueries.getWorldState(this.db, guildId);
    return this.readActiveMagicalDial(state, now);
  }

  private readActiveDial(
    state: WorldState | null | undefined,
    now: Date,
  ): { min: number; max: number; until: Date } | null {
    if (
      !state ||
      state.severity_min == null ||
      state.severity_max == null ||
      !state.severity_override_until
    ) {
      return null;
    }
    const until = new Date(state.severity_override_until);
    if (until.getTime() <= now.getTime()) return null;
    return { min: state.severity_min, max: state.severity_max, until };
  }

  private readActiveMagicalDial(
    state: WorldState | null | undefined,
    now: Date,
  ): { mode: MagicalMode; until: Date } | null {
    if (!state || !state.magical_mode || !state.magical_override_until) {
      return null;
    }
    if (state.magical_mode !== 'only' && state.magical_mode !== 'none') {
      return null;
    }
    const until = new Date(state.magical_override_until);
    if (until.getTime() <= now.getTime()) return null;
    return { mode: state.magical_mode, until };
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

  getAdminStatus(guildId: string, now = new Date()): WeatherAdminStatus | null {
    const state = dbQueries.getWorldState(this.db, guildId);
    const dial = this.readActiveDial(state, now);
    const magicalDial = this.readActiveMagicalDial(state, now);
    const entry = state?.current_weather_type
      ? findEntryByType(this.table, state.current_weather_type)
      : undefined;

    if (!entry && !dial && !magicalDial) return null;

    const schedule = this.getScheduleStatus(guildId, now);
    const log = entry ? dbQueries.getLatestWeatherLog(this.db, guildId) : null;
    let poolInfo: {
      cooldownActive: boolean;
      effectiveMaxSeverity: number | null;
    } = { cooldownActive: false, effectiveMaxSeverity: null };
    try {
      poolInfo = resolveRollPool(
        this.table,
        entry?.severity ?? null,
        this.rules,
        dial ? { min: dial.min, max: dial.max } : null,
        magicalDial?.mode ?? null,
      );
    } catch (error) {
      // Content changed after dials were set — still show dial state without cooldown detail.
      if (!(error instanceof Error) || error.message !== 'EMPTY_DIAL_POOL') {
        throw error;
      }
    }
    const hasDuration = entry ? entryHasDurationRange(entry) : false;

    return {
      type: entry?.type ?? null,
      severity: entry?.severity ?? null,
      magical: entry?.magical ?? null,
      forced: Boolean(entry && log?.forced === 1 && log.weather_type === entry.type),
      rolledAt: state?.current_weather_rolled_at
        ? new Date(state.current_weather_rolled_at)
        : null,
      nextUpdateAt: schedule.nextUpdateAt,
      pausedUntil: schedule.pausedUntil,
      dueButWaitingForWindow: schedule.dueButWaitingForWindow,
      durationMinHours: hasDuration && entry ? entry.durationMinHours! : null,
      durationMaxHours: hasDuration && entry ? entry.durationMaxHours! : null,
      usesEnvDuration: entry ? !hasDuration : null,
      cooldownActive: poolInfo.cooldownActive,
      effectiveMaxNextSeverity: poolInfo.effectiveMaxSeverity,
      cooldownAfterSeverity: this.rules.cooldownAfterSeverity,
      cooldownMaxNextSeverity: this.rules.cooldownMaxNextSeverity,
      dialActive: dial !== null,
      dialMin: dial?.min ?? null,
      dialMax: dial?.max ?? null,
      dialUntil: dial?.until ?? null,
      magicalDialActive: magicalDial !== null,
      magicalDialMode: magicalDial?.mode ?? null,
      magicalDialUntil: magicalDial?.until ?? null,
    };
  }

  buildStatusEmbed(status: WeatherAdminStatus): EmbedBuilder {
    const title =
      status.type !== null
        ? formatTemplate(this.messages.statusEmbedTitleWithType, { type: status.type })
        : this.messages.statusEmbedTitle;

    const currentLines: string[] = [];
    if (status.type !== null && status.severity !== null) {
      currentLines.push(
        formatTemplate(this.messages.statusSeverity, { severity: status.severity }),
      );
      if (status.magical !== null) {
        currentLines.push(
          formatTemplate(this.messages.statusMagical, {
            magical: status.magical ? 'ja' : 'nee',
          }),
        );
      }
      currentLines.push(
        formatTemplate(this.messages.statusForced, {
          forced: status.forced ? 'ja' : 'nee',
        }),
      );
      if (status.rolledAt) {
        currentLines.push(
          formatTemplate(this.messages.statusRolledAt, {
            unix: Math.floor(status.rolledAt.getTime() / 1000),
          }),
        );
      }
      if (status.usesEnvDuration === true) {
        currentLines.push(this.messages.statusDurationEnv);
      } else if (status.usesEnvDuration === false) {
        currentLines.push(
          formatTemplate(this.messages.statusDurationType, {
            min: status.durationMinHours ?? '?',
            max: status.durationMaxHours ?? '?',
          }),
        );
      }
    } else {
      currentLines.push(this.messages.noWeatherYet);
    }

    const scheduleLines: string[] = [];
    if (status.pausedUntil) {
      scheduleLines.push(
        formatTemplate(this.messages.statusPaused, {
          unix: Math.floor(status.pausedUntil.getTime() / 1000),
        }),
      );
    }
    if (status.dueButWaitingForWindow) {
      scheduleLines.push(this.messages.statusWaitingWindow);
    }
    if (status.nextUpdateAt) {
      scheduleLines.push(
        formatTemplate(this.messages.statusNext, {
          unix: Math.floor(status.nextUpdateAt.getTime() / 1000),
        }),
      );
    } else if (status.type !== null) {
      scheduleLines.push(this.messages.statusNextNone);
    }
    if (scheduleLines.length === 0) {
      scheduleLines.push(this.messages.statusNextNone);
    }

    const rulesLines: string[] = [];
    if (status.dialActive && status.dialUntil && status.dialMin !== null && status.dialMax !== null) {
      rulesLines.push(
        formatTemplate(this.messages.statusDialOn, {
          min: status.dialMin,
          max: status.dialMax,
          unix: Math.floor(status.dialUntil.getTime() / 1000),
        }),
      );
    } else {
      rulesLines.push(this.messages.statusDialOff);
    }
    if (
      status.magicalDialActive &&
      status.magicalDialUntil &&
      status.magicalDialMode !== null
    ) {
      rulesLines.push(
        formatTemplate(this.messages.statusMagicalDialOn, {
          mode: status.magicalDialMode,
          unix: Math.floor(status.magicalDialUntil.getTime() / 1000),
        }),
      );
    } else {
      rulesLines.push(this.messages.statusMagicalDialOff);
    }
    if (status.cooldownActive && status.effectiveMaxNextSeverity !== null) {
      rulesLines.push(
        formatTemplate(this.messages.statusCooldownOn, {
          maxSeverity: status.effectiveMaxNextSeverity,
          defaultMax: status.cooldownMaxNextSeverity,
        }),
      );
    } else {
      rulesLines.push(this.messages.statusCooldownOff);
    }

    return new EmbedBuilder()
      .setColor(severityEmbedColor(status.severity))
      .setTitle(title)
      .addFields(
        {
          name: this.messages.statusFieldCurrent,
          value: currentLines.join('\n'),
        },
        {
          name: this.messages.statusFieldSchedule,
          value: scheduleLines.join('\n'),
        },
        {
          name: this.messages.statusFieldRules,
          value: rulesLines.join('\n'),
        },
      );
  }

  /**
   * Temporary severity band for auto-rolls / `/weather roll`.
   * Does not change current weather; expires at `until`.
   * Rejects empty severity bands and empty intersection with an active magical dial.
   */
  setSeverityDial(guildId: string, min: number, max: number, durationMs: number): Date {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      throw new Error('INVALID_SEVERITY_RANGE');
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('INVALID_DURATION');
    }
    if (countEntriesInSeverityRange(this.table, min, max) === 0) {
      throw new Error('SEVERITY_RANGE_EMPTY');
    }

    const magicalDial = this.getActiveMagicalDial(guildId);
    if (
      filterDialIntersection(this.table, { min, max }, magicalDial?.mode ?? null).length === 0
    ) {
      throw new Error('DIAL_FILTER_EMPTY');
    }

    const until = new Date(Date.now() + durationMs);
    dbQueries.setSeverityOverride(this.db, guildId, min, max, until.toISOString());
    return until;
  }

  /** Clears the dial; returns false if none was active. */
  clearSeverityDial(guildId: string, now = new Date()): boolean {
    const active = this.getActiveSeverityDial(guildId, now);
    dbQueries.clearSeverityOverride(this.db, guildId);
    return active !== null;
  }

  /**
   * Temporary magical filter for auto-rolls / `/weather roll`.
   * Rejects empty magical pools and empty intersection with an active severity dial.
   */
  setMagicalDial(guildId: string, mode: MagicalMode, durationMs: number): Date {
    if (mode !== 'only' && mode !== 'none') {
      throw new Error('INVALID_MAGICAL_MODE');
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('INVALID_DURATION');
    }
    if (countEntriesWithMagicalMode(this.table, mode) === 0) {
      throw new Error('MAGICAL_POOL_EMPTY');
    }

    const severityDial = this.getActiveSeverityDial(guildId);
    const dial = severityDial ? { min: severityDial.min, max: severityDial.max } : null;
    if (filterDialIntersection(this.table, dial, mode).length === 0) {
      throw new Error('DIAL_FILTER_EMPTY');
    }

    const until = new Date(Date.now() + durationMs);
    dbQueries.setMagicalOverride(this.db, guildId, mode, until.toISOString());
    return until;
  }

  /** Clears the magical dial; returns false if none was active. */
  clearMagicalDial(guildId: string, now = new Date()): boolean {
    const active = this.getActiveMagicalDial(guildId, now);
    dbQueries.clearMagicalOverride(this.db, guildId);
    return active !== null;
  }

  rollWeather(guildId: string): WeatherResult {
    const state = dbQueries.getWorldState(this.db, guildId);
    const currentEntry = state?.current_weather_type
      ? findEntryByType(this.table, state.current_weather_type)
      : undefined;
    const currentSeverity = currentEntry?.severity ?? null;
    const now = new Date();
    const dial = this.readActiveDial(state, now);
    const magicalDial = this.readActiveMagicalDial(state, now);

    const { pool } = resolveRollPool(
      this.table,
      currentSeverity,
      this.rules,
      dial ? { min: dial.min, max: dial.max } : null,
      magicalDial?.mode ?? null,
    );
    const { entry, roll } = pickWeightedFromPool(pool);

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
   * Bypasses severity cooldown and dials (DM may escalate deliberately).
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

  /**
   * Schedule next auto-update from the **current** weather type's duration range,
   * or the global env interval when the entry has no duration fields.
   */
  scheduleNextUpdate(guildId: string): Date {
    const state = dbQueries.getWorldState(this.db, guildId);
    const entry = state?.current_weather_type
      ? findEntryByType(this.table, state.current_weather_type)
      : undefined;

    const intervalMs =
      entry && entryHasDurationRange(entry)
        ? randomIntervalFromHours(entry.durationMinHours!, entry.durationMaxHours!)
        : randomIntervalMs(this.updateMinMinutes, this.updateMaxMinutes);

    let next = new Date(Date.now() + intervalMs);
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

function severityEmbedColor(severity: number | null): number {
  if (severity === null) return 0x607d8b;
  if (severity <= 1) return 0x7cb342;
  if (severity === 2) return 0xc0ca33;
  if (severity === 3) return 0xffb300;
  if (severity === 4) return 0xfb8c00;
  return 0xe53935;
}
