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
