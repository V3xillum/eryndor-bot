export interface WeatherTableEntry {
  min: number;
  max: number;
  type: string;
  image: string;
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
}

export interface WeatherResult {
  type: string;
  image: string;
  roll?: number;
  forced: boolean;
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
