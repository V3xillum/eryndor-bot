import { zonedCivilToUtc, zonedParts, type TimeOfDay } from './activeWindow.js';

export type StatusReportCadence = 'daily' | 'weekly' | 'monthly';

/** Period identity for “already sent this cadence window” (local calendar). */
export function statusReportPeriodKey(
  now: Date,
  cadence: StatusReportCadence,
  timeZone: string,
): string {
  const parts = zonedParts(now, timeZone);
  if (cadence === 'daily') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }
  if (cadence === 'monthly') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  }
  const { isoYear, week } = isoWeekFromLocalDate(parts.year, parts.month, parts.day);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Start of the activity window for the status report being sent “now”.
 * Report-time → report-time (not midnight → report-time), so daily at 10:00
 * covers yesterday 10:00 inclusive through “now”.
 */
export function statusReportWindowStart(
  now: Date,
  cadence: StatusReportCadence,
  timeZone: string,
  postTime: TimeOfDay,
): Date {
  const parts = zonedParts(now, timeZone);

  if (cadence === 'daily') {
    const prev = addCivilDays(parts.year, parts.month, parts.day, -1);
    return requireCivil(
      prev.year,
      prev.month,
      prev.day,
      postTime.hours,
      postTime.minutes,
      timeZone,
    );
  }

  if (cadence === 'monthly') {
    const prev = addCivilMonths(parts.year, parts.month, 1, -1);
    return requireCivil(
      prev.year,
      prev.month,
      1,
      postTime.hours,
      postTime.minutes,
      timeZone,
    );
  }

  const { isoYear, week } = isoWeekFromLocalDate(parts.year, parts.month, parts.day);
  const monday = isoWeekMonday(isoYear, week);
  const prevMonday = addCivilDays(monday.year, monday.month, monday.day, -7);
  return requireCivil(
    prevMonday.year,
    prevMonday.month,
    prevMonday.day,
    postTime.hours,
    postTime.minutes,
    timeZone,
  );
}

function requireCivil(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const date = zonedCivilToUtc(year, month, day, hours, minutes, timeZone);
  if (!date) {
    throw new Error(`Could not resolve local time ${year}-${month}-${day} in ${timeZone}`);
  }
  return date;
}

function addCivilDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function addCivilMonths(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, day));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** ISO week number + ISO week-year for a civil Y-M-D. */
function isoWeekFromLocalDate(
  year: number,
  month: number,
  day: number,
): { isoYear: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear, week };
}

/** Monday of ISO week `week` in `isoYear`. */
function isoWeekMonday(
  isoYear: number,
  week: number,
): { year: number; month: number; day: number } {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return {
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  };
}
