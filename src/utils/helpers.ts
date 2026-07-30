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
 * Parses wall-clock `YYYY-MM-DD HH:mm` (or `T` separator) in `timeZone` to a UTC Date.
 * Returns null when the input is invalid or the local time does not exist.
 */
export function parseZonedDateTime(input: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

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

  // Guess UTC, then correct so the zoned wall-clock matches (handles DST).
  let utcMs = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    if (!parts) return null;
    const asIfUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    utcMs += desired - asIfUtc;
  }

  const verified = getZonedParts(new Date(utcMs), timeZone);
  if (
    !verified ||
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) {
    return null;
  }

  return new Date(utcMs);
}

/**
 * Parses a schedule "when": relative `30m`/`2h`/`1d`, or absolute `YYYY-MM-DD HH:mm`
 * in `timeZone`. Must be strictly in the future.
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

function getZonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const read = (type: Intl.DateTimeFormatPartTypes): number | null => {
      const value = parts.find((p) => p.type === type)?.value;
      if (value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const year = read('year');
    const month = read('month');
    const day = read('day');
    const hour = read('hour');
    const minute = read('minute');
    if (
      year === null ||
      month === null ||
      day === null ||
      hour === null ||
      minute === null
    ) {
      return null;
    }
    return { year, month, day, hour, minute };
  } catch {
    return null;
  }
}

export function randomIntervalMs(minMinutes: number, maxMinutes: number): number {
  const minMs = minMinutes * 60_000;
  const maxMs = maxMinutes * 60_000;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function rollD100(): number {
  return Math.floor(Math.random() * 100) + 1;
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
