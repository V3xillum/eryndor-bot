/** Temporary DM dial: only magical types, or only non-magical. */
export type MagicalMode = 'only' | 'none';

export interface WeatherTableEntry {
  min: number;
  max: number;
  type: string;
  image: string;
  severity: number;
  /** Whether this weather is magical (arcane / clockwork / etc.). */
  magical: boolean;
  /** Optional; both must be set together. Minutes until next auto-update while this type is current. */
  durationMinMinutes?: number;
  durationMaxMinutes?: number;
}

/** Transition / cooldown thresholds — loaded from content/weather-rules.json */
export interface WeatherRules {
  cooldownAfterSeverity: number;
  cooldownMaxNextSeverity: number;
}

export interface WorldState {
  guild_id: string;
  channel_id: string | null;
  thread_id: string | null;
  current_weather_type: string | null;
  current_weather_rolled_at: string | null;
  next_update_at: string | null;
  paused_until: string | null;
  season: string;
  updated_at: string | null;
  /** Temporary dial: inclusive severity band while override_until is in the future. */
  severity_min: number | null;
  severity_max: number | null;
  severity_override_until: string | null;
  /** Temporary dial: `only` | `none` while override_until is in the future. */
  magical_mode: MagicalMode | null;
  magical_override_until: string | null;
  /**
   * Optional per-guild auto-update interval (minutes). Both set together, or both null
   * (fall back to `.env` / defaults).
   */
  update_min_minutes: number | null;
  update_max_minutes: number | null;
  /**
   * Optional per-guild active posting window. `null` = inherit env;
   * `0` = disabled; `1` = enabled (use start/end or env defaults for missing times).
   */
  active_window_enabled: number | null;
  active_window_start: string | null;
  active_window_end: string | null;
  /**
   * Optional per-guild severity cooldown. `null` = inherit `weather-rules.json`;
   * `0` = disabled; `1` = enabled. Thresholds null = inherit content defaults.
   */
  cooldown_enabled: number | null;
  cooldown_after_severity: number | null;
  cooldown_max_next_severity: number | null;
  /** Channel for daily calendar-event posts (null = disabled). Separate from weather destination. */
  calendar_channel_id: string | null;
  /** Local calendar date (YYYY-MM-DD in WEATHER_TIMEZONE) already handled for event auto-post. */
  calendar_events_last_handled_date: string | null;
}

export interface WeatherResult {
  type: string;
  image: string;
  roll?: number;
  forced: boolean;
}

/** DM-scheduled free-text post (separate from weather destination). */
export interface ScheduledPost {
  id: number;
  guild_id: string;
  channel_id: string;
  body: string;
  post_at: string;
  created_by: string;
  created_at: string;
  posted_at: string | null;
}

export interface Messages {
  setupSuccess: string;
  rollSuccess: string;
  setSuccess: string;
  setSuccessWithDuration: string;
  setRollSuccess: string;
  setRollSuccessWithDuration: string;
  scheduleSuccess: string;
  pauseSuccess: string;
  resumeSuccess: string;
  nextNotScheduled: string;
  nextScheduled: string;
  nextPaused: string;
  nextWaitingWindow: string;
  statusEmbedTitle: string;
  statusEmbedTitleWithType: string;
  statusFieldCurrent: string;
  statusFieldSchedule: string;
  statusFieldRules: string;
  statusSeverity: string;
  statusForced: string;
  statusRolledAt: string;
  statusNext: string;
  statusNextNone: string;
  statusPaused: string;
  statusWaitingWindow: string;
  statusDurationType: string;
  statusDurationEnv: string;
  statusDurationGuild: string;
  statusInterval: string;
  statusWindowOn: string;
  statusWindowOff: string;
  settingsShowTitle: string;
  settingsIntervalSuccess: string;
  settingsWindowSuccess: string;
  settingsWindowDisabledSuccess: string;
  settingsCooldownSuccess: string;
  settingsCooldownDisabledSuccess: string;
  settingsCooldownWarnMaxNext: string;
  settingsCooldownWarnEmptyStartPool: string;
  settingsClearSuccess: string;
  settingsClearNone: string;
  settingsClearCooldownSuccess: string;
  settingsClearCooldownNone: string;
  settingsClearAllSuccess: string;
  settingsClearAllNone: string;
  settingsCooldownNothingSet: string;
  invalidUpdateInterval: string;
  invalidActiveWindow: string;
  invalidTimeOfDay: string;
  invalidCooldownThreshold: string;
  statusCooldownRulesOn: string;
  statusCooldownRulesOff: string;
  statusCooldownOn: string;
  statusDialOn: string;
  statusDialOff: string;
  statusMagical: string;
  statusMagicalDialOn: string;
  statusMagicalDialOff: string;
  severitySetSuccess: string;
  severityClearSuccess: string;
  severityClearNone: string;
  invalidSeverityRange: string;
  severityRangeEmpty: string;
  dialFilterEmpty: string;
  magicalSetSuccess: string;
  magicalClearSuccess: string;
  magicalClearNone: string;
  invalidMagicalMode: string;
  magicalPoolEmpty: string;
  noWeatherYet: string;
  notConfigured: string;
  unauthorized: string;
  invalidDuration: string;
  invalidRoll: string;
  unknownType: string;
  guildOnly: string;
  skippedNoChannel: string;
  unknownSubcommand: string;
  commandError: string;
  calendarLoadError: string;
  calendarTodayTitle: string;
  calendarEventsHeader: string;
  calendarNoEvents: string;
  calendarFullMoonTitle: string;
  calendarFullMoonWhen: string;
  calendarSetupSuccess: string;
  calendarClearSuccess: string;
  calendarClearNone: string;
  helpEmbedTitle: string;
  helpEmbedDescription: string;
  helpFieldEveryone: string;
  helpEveryoneBody: string;
  helpFieldDm: string;
  helpDmBody: string;
  announceScheduleSuccess: string;
  announceListEmpty: string;
  announceListTitle: string;
  announceListItem: string;
  announceCancelSuccess: string;
  announceCancelNotFound: string;
  announceInvalidWhen: string;
  announceWhenInPast: string;
  announceBodyEmpty: string;
  announceModalTitle: string;
  announceModalBodyLabel: string;
  announcePostFailedDm: string;
  announcePostFailedDmIntro: string;
}

export type CalendarEvent =
  | { type: 'festival'; name: string; icon: string; css?: string }
  | { type: 'birthday'; name: string }
  | {
      type: 'memorial';
      title: string;
      memorialType: 'festive' | 'death' | 'memorial';
      subtitle: string | null;
    };

export interface CalendarNextFullMoon {
  dayOfYear: number;
  daysUntil: number;
  whenText: string;
  label: string;
}

export interface CalendarDay {
  dayOfYear: number;
  refYear: number;
  timezone: string;
  leapYearNote: string | null;
  harptos: {
    label: string;
    month: string;
    day: number;
    special: string | null;
  };
  gregorian: {
    iso: string;
    year: number;
    month: number;
    day: number;
  };
  moon: {
    phase: string;
    emoji: string;
    isExactFullMoon: boolean;
  };
  events: CalendarEvent[];
  /** Optional while calendar API still includes it; bot no longer requires this for /world today. */
  nextFullMoon?: CalendarNextFullMoon;
}
