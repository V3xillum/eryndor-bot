import { zonedCivilToUtc } from './activeWindow.js';

/**
 * Parses durations like 30m, 2h, 1d into milliseconds.
 * Returns null when the input is invalid.
 */
export function parseDuration(input: string): number | null {
  const match = /^(\d+)(m|h|d)$/i.exec(input.trim());
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * multipliers[unit];
}

/**
 * Parses wall-clock datetime in `timeZone` to a UTC Date.
 * Accepts Dutch `DD-MM-YYYY HH:mm` (or `/` separators) and ISO `YYYY-MM-DD HH:mm`
 * (`T` separator also allowed). Returns null when invalid or the local time does not exist.
 */
export function parseZonedDateTime(input: string, timeZone: string): Date | null {
  const trimmed = input.trim();
  const parsed = parseCivilDateTimeParts(trimmed);
  if (!parsed) return null;

  const { year, month, day, hour, minute } = parsed;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  return zonedCivilToUtc(year, month, day, hour, minute, timeZone);
}

function parseCivilDateTimeParts(
  input: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  // Dutch-first: 31-07-2026 08:00 or 31/07/2026 08:00
  const dutch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})$/.exec(input);
  if (dutch) {
    return {
      day: Number(dutch[1]),
      month: Number(dutch[2]),
      year: Number(dutch[3]),
      hour: Number(dutch[4]),
      minute: Number(dutch[5]),
    };
  }

  // ISO: 2026-07-31 08:00
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
      hour: Number(iso[4]),
      minute: Number(iso[5]),
    };
  }

  return null;
}

/**
 * Parses a schedule "when": relative `30m`/`2h`/`1d`, or absolute
 * `DD-MM-YYYY HH:mm` / `YYYY-MM-DD HH:mm` in `timeZone`. Must be strictly in the future.
 */
export function parseScheduleWhen(
  input: string,
  timeZone: string,
  now = new Date(),
): Date | null {
  const trimmed = input.trim();
  const relativeMs = parseDuration(trimmed);
  if (relativeMs !== null) {
    return new Date(now.getTime() + relativeMs);
  }

  const absolute = parseZonedDateTime(trimmed, timeZone);
  if (!absolute) return null;
  if (absolute.getTime() <= now.getTime()) return null;
  return absolute;
}

export function randomIntervalMs(minMinutes: number, maxMinutes: number): number {
  const minMs = minMinutes * 60_000;
  const maxMs = maxMinutes * 60_000;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

/** Formats a YYYY-MM-DD Gregorian date for Dutch display, e.g. "29 juli 2026". */
export function formatGregorianNl(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // UTC noon avoids timezone shifting the calendar day.
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function isPaused(pausedUntil: string | null, now = new Date()): boolean {
  if (!pausedUntil) return false;
  return new Date(pausedUntil).getTime() > now.getTime();
}
