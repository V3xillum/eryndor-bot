export interface TimeOfDay {
  hours: number;
  minutes: number;
}

export interface ActiveWindow {
  start: TimeOfDay;
  end: TimeOfDay;
  timeZone: string;
}

const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseTimeOfDay(raw: string, label = 'time'): TimeOfDay {
  const match = HH_MM.exec(raw.trim());
  if (!match) {
    throw new Error(`${label} must be HH:mm (00:00–23:59), got: ${raw}`);
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function formatTimeOfDay(t: TimeOfDay): string {
  return `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
}

export function timeOfDayToMinutes(t: TimeOfDay): number {
  return t.hours * 60 + t.minutes;
}

/** Local wall-clock parts in the configured IANA timezone. */
export function zonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) throw new Error(`Missing ${type} for timezone ${timeZone}`);
    return Number(value);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
    seconds: get('second'),
  };
}

/**
 * Instant for a civil date/time in `timeZone`.
 * Iterative UTC guess + offset correction (handles DST).
 * Returns null when the local time does not exist or the timezone is invalid.
 */
export function zonedCivilToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date | null {
  let utcMs = Date.UTC(year, month - 1, day, hours, minutes);
  try {
    for (let i = 0; i < 3; i++) {
      const parts = zonedParts(new Date(utcMs), timeZone);
      const asIfUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hours,
        parts.minutes,
      );
      const desired = Date.UTC(year, month - 1, day, hours, minutes);
      utcMs += desired - asIfUtc;
    }

    const verified = zonedParts(new Date(utcMs), timeZone);
    if (
      verified.year !== year ||
      verified.month !== month ||
      verified.day !== day ||
      verified.hours !== hours ||
      verified.minutes !== minutes
    ) {
      return null;
    }
    return new Date(utcMs);
  } catch {
    return null;
  }
}

/** Half-open window: active if start <= now < end in the given timezone. */
export function isWithinActiveWindow(now: Date, window: ActiveWindow): boolean {
  const parts = zonedParts(now, window.timeZone);
  const nowMinutes = parts.hours * 60 + parts.minutes;
  const start = timeOfDayToMinutes(window.start);
  const end = timeOfDayToMinutes(window.end);
  return nowMinutes >= start && nowMinutes < end;
}

/** Next instant at which the active window opens (today's start if still ahead, else tomorrow). */
export function nextWindowStart(now: Date, window: ActiveWindow): Date {
  const parts = zonedParts(now, window.timeZone);
  const startToday = zonedCivilToUtc(
    parts.year,
    parts.month,
    parts.day,
    window.start.hours,
    window.start.minutes,
    window.timeZone,
  );
  if (!startToday) {
    throw new Error(`Failed to resolve window start for timezone ${window.timeZone}`);
  }

  if (now.getTime() < startToday.getTime()) {
    return startToday;
  }

  const tomorrow = new Date(startToday.getTime() + 24 * 60 * 60 * 1000);
  const tParts = zonedParts(tomorrow, window.timeZone);
  const next = zonedCivilToUtc(
    tParts.year,
    tParts.month,
    tParts.day,
    window.start.hours,
    window.start.minutes,
    window.timeZone,
  );
  if (!next) {
    throw new Error(`Failed to resolve next window start for timezone ${window.timeZone}`);
  }
  return next;
}

/**
 * If `candidate` falls outside the window, move it to the next window start.
 * Manual commands are unaffected — only use this when scheduling automatic updates.
 */
export function clampToActiveWindow(candidate: Date, window: ActiveWindow): Date {
  if (isWithinActiveWindow(candidate, window)) return candidate;
  return nextWindowStart(candidate, window);
}
