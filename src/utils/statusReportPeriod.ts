import { zonedCivilToUtc, zonedParts } from './activeWindow.js';

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

/** Start of the current cadence window in `timeZone` (inclusive), as UTC Date. */
export function statusReportWindowStart(
  now: Date,
  cadence: StatusReportCadence,
  timeZone: string,
): Date {
  const parts = zonedParts(now, timeZone);
  if (cadence === 'daily') {
    return requireCivil(parts.year, parts.month, parts.day, 0, 0, timeZone);
  }
  if (cadence === 'monthly') {
    return requireCivil(parts.year, parts.month, 1, 0, 0, timeZone);
  }
  const { isoYear, week } = isoWeekFromLocalDate(parts.year, parts.month, parts.day);
  const monday = isoWeekMonday(isoYear, week);
  return requireCivil(monday.year, monday.month, monday.day, 0, 0, timeZone);
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
