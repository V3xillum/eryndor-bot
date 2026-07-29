/**
 * Gregorian day-of-year in a timezone, capped at 365 for Harptos (no leap day).
 * Matches Calendar of Eryndor DOY indexing.
 */
export function harptosDoyNow(date = new Date(), timeZone = 'Europe/Amsterdam'): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);

  if (![y, m, d].every((n) => Number.isFinite(n))) {
    throw new Error('Failed to resolve calendar date parts for Harptos DOY');
  }

  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) {
    monthLengths[1] = 29;
  }

  let n = d;
  for (let i = 0; i < m - 1; i++) {
    n += monthLengths[i];
  }
  return Math.min(n, 365);
}

export function dayJsonUrl(base: string, doy: number): string {
  const normalized = base.replace(/\/+$/, '');
  return `${normalized}/data/days/${String(doy).padStart(3, '0')}.json`;
}

export function fullMoonsJsonUrl(base: string): string {
  const normalized = base.replace(/\/+$/, '');
  return `${normalized}/data/full-moons.json`;
}
