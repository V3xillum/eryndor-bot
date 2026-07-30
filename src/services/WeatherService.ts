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
  formatTimeOfDay,
  isWithinActiveWindow,
  parseTimeOfDay,
  timeOfDayToMinutes,
  type ActiveWindow,
  type TimeOfDay,
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
  updateMinMinutes: number;
  updateMaxMinutes: number;
  intervalFromGuild: boolean;
  activeWindowEnabled: boolean;
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
  windowFromGuild: boolean;
  cooldownActive: boolean;
  effectiveMaxNextSeverity: number | null;
  cooldownEnabled: boolean;
  cooldownAfterSeverity: number;
  cooldownMaxNextSeverity: number;
  cooldownFromGuild: boolean;
  dialActive: boolean;
  dialMin: number | null;
  dialMax: number | null;
  dialUntil: Date | null;
  magicalDialActive: boolean;
  magicalDialMode: MagicalMode | null;
  magicalDialUntil: Date | null;
}

export interface GuildScheduleSettings {
  updateMinMinutes: number;
  updateMaxMinutes: number;
  intervalFromGuild: boolean;
  activeWindow: ActiveWindow | null;
  windowFromGuild: boolean;
  /** Raw HH:mm for display when window is on. */
  windowStart: string | null;
  windowEnd: string | null;
}

export interface GuildCooldownSettings {
  enabled: boolean;
  afterSeverity: number;
  maxNextSeverity: number;
  /** True when any cooldown column is overridden on the guild. */
  fromGuild: boolean;
}

export type SettingsClearScope = 'schedule' | 'cooldown' | 'all';

export class WeatherService {
  private readonly table: WeatherTableEntry[];
  private readonly rules: WeatherRules;
  readonly messages: Messages;
  private readonly defaultUpdateMinMinutes: number;
  private readonly defaultUpdateMaxMinutes: number;
  private readonly defaultActiveWindow: ActiveWindow | null;
  private readonly timeZone: string;

  constructor(
    private readonly db: Database.Database,
    options: {
      updateMinMinutes: number;
      updateMaxMinutes: number;
      activeWindow: ActiveWindow | null;
      timeZone: string;
    },
  ) {
    this.table = loadWeatherTable();
    this.rules = loadWeatherRules();
    this.messages = loadMessages();
    this.defaultUpdateMinMinutes = options.updateMinMinutes;
    this.defaultUpdateMaxMinutes = options.updateMaxMinutes;
    this.defaultActiveWindow = options.activeWindow;
    this.timeZone = options.timeZone;
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

  /** Effective interval + active window for a guild (DB override, else `.env` defaults). */
  getScheduleSettings(guildId: string): GuildScheduleSettings {
    const state = dbQueries.getWorldState(this.db, guildId);
    return this.resolveScheduleSettings(state);
  }

  /** Effective cooldown rules for a guild (DB override, else `weather-rules.json`). */
  getCooldownSettings(guildId: string): GuildCooldownSettings {
    const state = dbQueries.getWorldState(this.db, guildId);
    return this.resolveCooldownSettings(state);
  }

  private resolveScheduleSettings(state: WorldState | null | undefined): GuildScheduleSettings {
    const intervalFromGuild =
      state?.update_min_minutes != null && state?.update_max_minutes != null;
    const updateMinMinutes = intervalFromGuild
      ? state!.update_min_minutes!
      : this.defaultUpdateMinMinutes;
    const updateMaxMinutes = intervalFromGuild
      ? state!.update_max_minutes!
      : this.defaultUpdateMaxMinutes;

    const windowFromGuild =
      state?.active_window_enabled != null ||
      state?.active_window_start != null ||
      state?.active_window_end != null;

    const enabled =
      state?.active_window_enabled != null
        ? state.active_window_enabled === 1
        : this.defaultActiveWindow !== null;

    let activeWindow: ActiveWindow | null = null;
    let windowStart: string | null = null;
    let windowEnd: string | null = null;

    if (enabled) {
      const startTod = this.resolveWindowTimeOfDay(
        state?.active_window_start,
        this.defaultActiveWindow?.start ?? { hours: 6, minutes: 0 },
      );
      const endTod = this.resolveWindowTimeOfDay(
        state?.active_window_end,
        this.defaultActiveWindow?.end ?? { hours: 23, minutes: 0 },
      );
      activeWindow = {
        start: startTod,
        end: endTod,
        timeZone: this.defaultActiveWindow?.timeZone ?? this.timeZone,
      };
      windowStart = formatTimeOfDay(startTod);
      windowEnd = formatTimeOfDay(endTod);
    }

    return {
      updateMinMinutes,
      updateMaxMinutes,
      intervalFromGuild,
      activeWindow,
      windowFromGuild,
      windowStart,
      windowEnd,
    };
  }

  private resolveCooldownSettings(state: WorldState | null | undefined): GuildCooldownSettings {
    const fromGuild =
      state?.cooldown_enabled != null ||
      state?.cooldown_after_severity != null ||
      state?.cooldown_max_next_severity != null;

    const enabled =
      state?.cooldown_enabled != null ? state.cooldown_enabled === 1 : true;
    const afterSeverity =
      state?.cooldown_after_severity != null
        ? state.cooldown_after_severity
        : this.rules.cooldownAfterSeverity;
    const maxNextSeverity =
      state?.cooldown_max_next_severity != null
        ? state.cooldown_max_next_severity
        : this.rules.cooldownMaxNextSeverity;

    return {
      enabled,
      afterSeverity,
      maxNextSeverity,
      fromGuild,
    };
  }

  private toRollRules(cooldown: GuildCooldownSettings): WeatherRules {
    return {
      cooldownAfterSeverity: cooldown.afterSeverity,
      cooldownMaxNextSeverity: cooldown.maxNextSeverity,
    };
  }

  private resolveWindowTimeOfDay(
    raw: string | null | undefined,
    fallback: TimeOfDay,
  ): TimeOfDay {
    if (!raw) return fallback;
    try {
      return parseTimeOfDay(raw, 'active_window');
    } catch {
      return fallback;
    }
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
    const cooldown = this.resolveCooldownSettings(state);
    let poolInfo: {
      cooldownActive: boolean;
      effectiveMaxSeverity: number | null;
    } = { cooldownActive: false, effectiveMaxSeverity: null };
    try {
      poolInfo = resolveRollPool(
        this.table,
        entry?.severity ?? null,
        this.toRollRules(cooldown),
        dial ? { min: dial.min, max: dial.max } : null,
        magicalDial?.mode ?? null,
        cooldown.enabled,
      );
    } catch (error) {
      // Content changed after dials were set — still show dial state without cooldown detail.
      if (!(error instanceof Error) || error.message !== 'EMPTY_DIAL_POOL') {
        throw error;
      }
    }
    const hasDuration = entry ? entryHasDurationRange(entry) : false;
    const scheduleSettings = this.resolveScheduleSettings(state);

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
      updateMinMinutes: scheduleSettings.updateMinMinutes,
      updateMaxMinutes: scheduleSettings.updateMaxMinutes,
      intervalFromGuild: scheduleSettings.intervalFromGuild,
      activeWindowEnabled: scheduleSettings.activeWindow !== null,
      activeWindowStart: scheduleSettings.windowStart,
      activeWindowEnd: scheduleSettings.windowEnd,
      windowFromGuild: scheduleSettings.windowFromGuild,
      cooldownActive: poolInfo.cooldownActive,
      effectiveMaxNextSeverity: poolInfo.effectiveMaxSeverity,
      cooldownEnabled: cooldown.enabled,
      cooldownAfterSeverity: cooldown.afterSeverity,
      cooldownMaxNextSeverity: cooldown.maxNextSeverity,
      cooldownFromGuild: cooldown.fromGuild,
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
        currentLines.push(
          formatTemplate(
            status.intervalFromGuild
              ? this.messages.statusDurationGuild
              : this.messages.statusDurationEnv,
            {
              min: status.updateMinMinutes,
              max: status.updateMaxMinutes,
            },
          ),
        );
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
    scheduleLines.push(
      formatTemplate(this.messages.statusInterval, {
        min: status.updateMinMinutes,
        max: status.updateMaxMinutes,
        source: status.intervalFromGuild ? 'guild' : '.env',
      }),
    );
    if (status.activeWindowEnabled && status.activeWindowStart && status.activeWindowEnd) {
      scheduleLines.push(
        formatTemplate(this.messages.statusWindowOn, {
          start: status.activeWindowStart,
          end: status.activeWindowEnd,
        }),
      );
      scheduleLines.push(
        status.windowFromGuild
          ? this.messages.statusWindowOverride
          : this.messages.statusWindowDefault,
      );
    } else {
      scheduleLines.push(this.messages.statusWindowOff);
    }
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
    if (status.cooldownEnabled) {
      rulesLines.push(
        formatTemplate(this.messages.statusCooldownRulesOn, {
          after: status.cooldownAfterSeverity,
          max: status.cooldownMaxNextSeverity,
          source: status.cooldownFromGuild ? 'guild' : 'content',
        }),
      );
      if (status.cooldownActive && status.effectiveMaxNextSeverity !== null) {
        rulesLines.push(
          formatTemplate(this.messages.statusCooldownOn, {
            maxSeverity: status.effectiveMaxNextSeverity,
            defaultMax: status.cooldownMaxNextSeverity,
          }),
        );
      }
    } else {
      rulesLines.push(
        formatTemplate(this.messages.statusCooldownRulesOff, {
          source: status.cooldownFromGuild ? 'guild' : 'content',
        }),
      );
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

  /**
   * Per-guild fallback interval (minutes) when the current type has no duration range.
   * Reschedules the next auto-update immediately.
   */
  setUpdateInterval(guildId: string, minMinutes: number, maxMinutes: number): Date {
    if (
      !Number.isInteger(minMinutes) ||
      !Number.isInteger(maxMinutes) ||
      minMinutes <= 0 ||
      maxMinutes < minMinutes
    ) {
      throw new Error('INVALID_UPDATE_INTERVAL');
    }
    dbQueries.setUpdateInterval(this.db, guildId, minMinutes, maxMinutes);
    return this.scheduleNextUpdate(guildId);
  }

  /**
   * Per-guild active posting window. Timezone always comes from `.env` (`WEATHER_TIMEZONE`).
   * When enabling without start/end, keeps existing guild times or falls back to env defaults.
   * Reschedules immediately.
   */
  setActiveWindow(
    guildId: string,
    enabled: boolean,
    startRaw?: string | null,
    endRaw?: string | null,
  ): Date {
    const state = dbQueries.getWorldState(this.db, guildId);
    const defaults = this.defaultActiveWindow;

    let start: string | null = state?.active_window_start ?? null;
    let end: string | null = state?.active_window_end ?? null;

    try {
      if (startRaw != null && startRaw.trim() !== '') {
        start = formatTimeOfDay(parseTimeOfDay(startRaw.trim(), 'start'));
      }
      if (endRaw != null && endRaw.trim() !== '') {
        end = formatTimeOfDay(parseTimeOfDay(endRaw.trim(), 'end'));
      }

      if (enabled) {
        const startTod = start
          ? parseTimeOfDay(start, 'start')
          : (defaults?.start ?? { hours: 6, minutes: 0 });
        const endTod = end
          ? parseTimeOfDay(end, 'end')
          : (defaults?.end ?? { hours: 23, minutes: 0 });

        if (timeOfDayToMinutes(startTod) >= timeOfDayToMinutes(endTod)) {
          throw new Error('INVALID_ACTIVE_WINDOW');
        }

        start = formatTimeOfDay(startTod);
        end = formatTimeOfDay(endTod);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_ACTIVE_WINDOW') {
        throw error;
      }
      throw new Error('INVALID_TIME_OF_DAY');
    }

    dbQueries.setActiveWindowOverride(this.db, guildId, enabled, start, end);
    return this.scheduleNextUpdate(guildId);
  }

  /** Clears guild interval + window overrides → `.env` defaults. Reschedules. */
  clearScheduleOverrides(guildId: string): { hadOverride: boolean; next: Date } {
    const hadOverride = dbQueries.clearScheduleOverrides(this.db, guildId);
    const next = this.scheduleNextUpdate(guildId);
    return { hadOverride, next };
  }

  /**
   * Per-guild severity cooldown overrides (field-level merge; omitted keys keep current DB).
   * Does not change current weather or reschedule — applies on the next roll.
   */
  setCooldownSettings(
    guildId: string,
    patch: {
      enabled?: boolean;
      afterSeverity?: number;
      maxNextSeverity?: number;
    },
  ): { settings: GuildCooldownSettings; warnings: string[] } {
    if (
      patch.enabled === undefined &&
      patch.afterSeverity === undefined &&
      patch.maxNextSeverity === undefined
    ) {
      throw new Error('COOLDOWN_NOTHING_SET');
    }

    if (
      (patch.afterSeverity !== undefined &&
        (!Number.isInteger(patch.afterSeverity) || patch.afterSeverity < 1)) ||
      (patch.maxNextSeverity !== undefined &&
        (!Number.isInteger(patch.maxNextSeverity) || patch.maxNextSeverity < 1))
    ) {
      throw new Error('INVALID_COOLDOWN_THRESHOLD');
    }

    dbQueries.setCooldownOverrides(this.db, guildId, patch);
    const settings = this.getCooldownSettings(guildId);
    const warnings: string[] = [];

    if (settings.enabled && settings.maxNextSeverity >= settings.afterSeverity) {
      warnings.push(
        formatTemplate(this.messages.settingsCooldownWarnMaxNext, {
          max: settings.maxNextSeverity,
          after: settings.afterSeverity,
        }),
      );
    }

    if (
      settings.enabled &&
      this.table.every((e) => e.severity > settings.maxNextSeverity)
    ) {
      warnings.push(
        formatTemplate(this.messages.settingsCooldownWarnEmptyStartPool, {
          max: settings.maxNextSeverity,
        }),
      );
    }

    return { settings, warnings };
  }

  /**
   * Clear guild settings by scope. Schedule clears reschedule; cooldown-only does not.
   */
  clearSettingsOverrides(
    guildId: string,
    scope: SettingsClearScope,
  ): { hadOverride: boolean; next: Date | null } {
    let hadOverride = false;
    let next: Date | null = null;

    if (scope === 'schedule' || scope === 'all') {
      const cleared = dbQueries.clearScheduleOverrides(this.db, guildId);
      hadOverride = hadOverride || cleared;
      next = this.scheduleNextUpdate(guildId);
    }

    if (scope === 'cooldown' || scope === 'all') {
      const cleared = dbQueries.clearCooldownOverrides(this.db, guildId);
      hadOverride = hadOverride || cleared;
    }

    return { hadOverride, next };
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
    const cooldown = this.resolveCooldownSettings(state);

    const { pool } = resolveRollPool(
      this.table,
      currentSeverity,
      this.toRollRules(cooldown),
      dial ? { min: dial.min, max: dial.max } : null,
      magicalDial?.mode ?? null,
      cooldown.enabled,
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
   * or the guild/env fallback interval when the entry has no duration fields.
   */
  scheduleNextUpdate(guildId: string): Date {
    const state = dbQueries.getWorldState(this.db, guildId);
    const entry = state?.current_weather_type
      ? findEntryByType(this.table, state.current_weather_type)
      : undefined;
    const settings = this.resolveScheduleSettings(state);

    const intervalMs =
      entry && entryHasDurationRange(entry)
        ? randomIntervalFromHours(entry.durationMinHours!, entry.durationMaxHours!)
        : randomIntervalMs(settings.updateMinMinutes, settings.updateMaxMinutes);

    let next = new Date(Date.now() + intervalMs);
    if (settings.activeWindow) {
      next = clampToActiveWindow(next, settings.activeWindow);
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

  isInActiveWindow(guildId: string, now = new Date()): boolean {
    const settings = this.getScheduleSettings(guildId);
    if (!settings.activeWindow) return true;
    return isWithinActiveWindow(now, settings.activeWindow);
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
    const dueButWaitingForWindow = due && !this.isInActiveWindow(guildId, now);

    return { nextUpdateAt, pausedUntil, dueButWaitingForWindow };
  }

  /** Guilds whose automatic update is due — never outside that guild's active window. */
  dueGuilds(now = new Date()): WorldState[] {
    return this.listGuildStates().filter((state) => {
      if (!state.next_update_at) return false;
      if (isPaused(state.paused_until, now)) return false;
      if (new Date(state.next_update_at).getTime() > now.getTime()) return false;

      const settings = this.resolveScheduleSettings(state);
      if (settings.activeWindow && !isWithinActiveWindow(now, settings.activeWindow)) {
        return false;
      }
      return true;
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
