import 'dotenv/config';
import {
  parseTimeOfDay,
  timeOfDayToMinutes,
  type ActiveWindow,
} from './utils/activeWindow.js';

/** Defaults match the original 6–18h window, expressed in minutes for easy local testing. */
const DEFAULT_UPDATE_MIN_MINUTES = 6 * 60;
const DEFAULT_UPDATE_MAX_MINUTES = 18 * 60;
const DEFAULT_ACTIVE_START = '06:00';
const DEFAULT_ACTIVE_END = '23:00';
const DEFAULT_TIMEZONE = 'Europe/Amsterdam';
const DEFAULT_ERYNDOR_BASE_URL = 'https://v3xillum.github.io/eryndor';
const DEFAULT_ERYNDOR_FALLBACK_URL = 'https://raw.githubusercontent.com/V3xillum/eryndor/main';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (minutes), got: ${raw}`);
  }
  return value;
}

function loadActiveWindow(): ActiveWindow | null {
  const disabled = (process.env.WEATHER_ACTIVE_WINDOW_ENABLED ?? 'true').trim().toLowerCase();
  if (disabled === 'false' || disabled === '0' || disabled === 'off') {
    return null;
  }

  const start = parseTimeOfDay(
    process.env.WEATHER_ACTIVE_START?.trim() || DEFAULT_ACTIVE_START,
    'WEATHER_ACTIVE_START',
  );
  const end = parseTimeOfDay(
    process.env.WEATHER_ACTIVE_END?.trim() || DEFAULT_ACTIVE_END,
    'WEATHER_ACTIVE_END',
  );
  const timeZone = process.env.WEATHER_TIMEZONE?.trim() || DEFAULT_TIMEZONE;

  if (timeOfDayToMinutes(start) >= timeOfDayToMinutes(end)) {
    throw new Error(
      'WEATHER_ACTIVE_START must be earlier than WEATHER_ACTIVE_END (same-day window only)',
    );
  }

  // Validate timezone early.
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid WEATHER_TIMEZONE: ${timeZone}`);
  }

  return { start, end, timeZone };
}

function loadTimezone(name: string, fallback: string): string {
  const timeZone = process.env[name]?.trim() || fallback;
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid ${name}: ${timeZone}`);
  }
  return timeZone;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function loadConfig() {
  const allowedUserIds = (process.env.ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const updateMinMinutes = optionalPositiveInt(
    'WEATHER_UPDATE_MIN_MINUTES',
    DEFAULT_UPDATE_MIN_MINUTES,
  );
  const updateMaxMinutes = optionalPositiveInt(
    'WEATHER_UPDATE_MAX_MINUTES',
    DEFAULT_UPDATE_MAX_MINUTES,
  );

  if (updateMinMinutes > updateMaxMinutes) {
    throw new Error(
      `WEATHER_UPDATE_MIN_MINUTES (${updateMinMinutes}) must be <= WEATHER_UPDATE_MAX_MINUTES (${updateMaxMinutes})`,
    );
  }

  const calendarTimeZone = loadTimezone('WEATHER_TIMEZONE', DEFAULT_TIMEZONE);

  return {
    token: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
    allowedUserIds,
    updateMinMinutes,
    updateMaxMinutes,
    activeWindow: loadActiveWindow(),
    eryndorCalendar: {
      baseUrl: normalizeBaseUrl(
        process.env.ERYNDOR_CALENDAR_BASE_URL || DEFAULT_ERYNDOR_BASE_URL,
      ),
      fallbackUrl: normalizeBaseUrl(
        process.env.ERYNDOR_CALENDAR_FALLBACK_URL || DEFAULT_ERYNDOR_FALLBACK_URL,
      ),
      timeZone: calendarTimeZone,
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
