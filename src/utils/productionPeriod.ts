import { zonedParts } from './activeWindow.js';
import type { ProductionInterval } from '../types.js';

/** Local calendar date YYYY-MM-DD in `timeZone`. */
export function localDateIso(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * ISO week period key for the local civil date, e.g. `2026-W31`.
 * Week starts Monday; year is the ISO week-year (Thursday rule).
 * @see https://en.wikipedia.org/wiki/ISO_week_date
 */
export function isoWeekPeriod(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  // Nearest Thursday: current date + 4 - current day number (Mon=1 … Sun=7)
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

export function periodKeyForInterval(
  interval: ProductionInterval,
  date: Date,
  timeZone: string,
): string {
  return interval === 'weekly'
    ? isoWeekPeriod(date, timeZone)
    : localDateIso(date, timeZone);
}
