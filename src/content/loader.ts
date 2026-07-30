import fs from 'node:fs';
import path from 'node:path';
import type { MagicalMode, Messages, WeatherRules, WeatherTableEntry } from '../types.js';

const CONTENT_ROOT = path.resolve(process.cwd(), 'content');

export function loadWeatherTable(): WeatherTableEntry[] {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, 'weather-table.json'), 'utf8');
  const table = JSON.parse(raw) as WeatherTableEntry[];
  validateWeatherTable(table);
  return table;
}

export function loadWeatherRules(): WeatherRules {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, 'weather-rules.json'), 'utf8');
  const rules = JSON.parse(raw) as WeatherRules;
  validateWeatherRules(rules);
  return rules;
}

export function loadMessages(): Messages {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, 'messages.json'), 'utf8');
  return JSON.parse(raw) as Messages;
}

export function resolveImagePath(filename: string): string {
  return path.join(CONTENT_ROOT, 'images', filename);
}

function validateWeatherRules(rules: WeatherRules): void {
  if (
    !Number.isInteger(rules.cooldownAfterSeverity) ||
    rules.cooldownAfterSeverity < 1 ||
    !Number.isInteger(rules.cooldownMaxNextSeverity) ||
    rules.cooldownMaxNextSeverity < 1
  ) {
    throw new Error(
      'weather-rules.json: cooldownAfterSeverity and cooldownMaxNextSeverity must be integers >= 1',
    );
  }
}

function validateWeatherTable(table: WeatherTableEntry[]): void {
  if (!Array.isArray(table) || table.length === 0) {
    throw new Error('weather-table.json must be a non-empty array');
  }

  for (const entry of table) {
    if (entry.min < 1 || entry.max > 100 || entry.min > entry.max) {
      throw new Error(`Invalid range for type ${entry.type}: ${entry.min}-${entry.max}`);
    }
    if (!entry.type || !entry.image) {
      throw new Error(`Incomplete weather entry: ${JSON.stringify(entry)}`);
    }
    if (!Number.isInteger(entry.severity) || entry.severity < 1) {
      throw new Error(`Invalid severity for type ${entry.type}: ${entry.severity}`);
    }
    if (typeof entry.magical !== 'boolean') {
      throw new Error(`Type ${entry.type}: magical must be a boolean`);
    }

    const hasMin = entry.durationMinHours !== undefined;
    const hasMax = entry.durationMaxHours !== undefined;
    if (hasMin !== hasMax) {
      throw new Error(
        `Type ${entry.type}: durationMinHours and durationMaxHours must both be set or both omitted`,
      );
    }
    if (hasMin && hasMax) {
      const minH = entry.durationMinHours!;
      const maxH = entry.durationMaxHours!;
      if (!(minH > 0) || maxH < minH || !Number.isFinite(minH) || !Number.isFinite(maxH)) {
        throw new Error(
          `Type ${entry.type}: invalid duration range ${minH}–${maxH} hours`,
        );
      }
    }

    const imagePath = resolveImagePath(entry.image);
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Missing image for ${entry.type}: ${imagePath}`);
    }
  }
}

export function findEntryByType(
  table: WeatherTableEntry[],
  type: string,
): WeatherTableEntry | undefined {
  return table.find((entry) => entry.type === type);
}

export function findEntryByRoll(
  table: WeatherTableEntry[],
  roll: number,
): WeatherTableEntry | undefined {
  return table.find((entry) => roll >= entry.min && roll <= entry.max);
}

export function listWeatherTypes(table: WeatherTableEntry[]): string[] {
  return table.map((entry) => entry.type);
}

export function applySeverityDial(
  table: WeatherTableEntry[],
  dial: { min: number; max: number } | null,
): WeatherTableEntry[] {
  if (!dial) return table;
  return table.filter((e) => e.severity >= dial.min && e.severity <= dial.max);
}

export function applyMagicalDial(
  table: WeatherTableEntry[],
  mode: MagicalMode | null,
): WeatherTableEntry[] {
  if (!mode) return table;
  return table.filter((e) => (mode === 'only' ? e.magical : !e.magical));
}

/**
 * Entries matching an optional severity band and optional magical mode (intersection).
 */
export function filterDialIntersection(
  table: WeatherTableEntry[],
  dial: { min: number; max: number } | null,
  magicalMode: MagicalMode | null,
): WeatherTableEntry[] {
  return applyMagicalDial(applySeverityDial(table, dial), magicalMode);
}

/**
 * Pool for the next auto-roll /weather roll.
 * 1) Optional DM severity dial band
 * 2) Optional DM magical dial (only / none)
 * 3) After high severity, only milder entries within that base; if empty, raise the
 *    ceiling until at least one entry matches (within the base set).
 *    Skipped entirely when `cooldownEnabled` is false.
 */
export function resolveRollPool(
  table: WeatherTableEntry[],
  currentSeverity: number | null,
  rules: WeatherRules,
  dial: { min: number; max: number } | null = null,
  magicalMode: MagicalMode | null = null,
  cooldownEnabled = true,
): { pool: WeatherTableEntry[]; cooldownActive: boolean; effectiveMaxSeverity: number | null } {
  const base = filterDialIntersection(table, dial, magicalMode);

  if (base.length === 0) {
    throw new Error('EMPTY_DIAL_POOL');
  }

  if (
    !cooldownEnabled ||
    currentSeverity === null ||
    currentSeverity < rules.cooldownAfterSeverity
  ) {
    return { pool: base, cooldownActive: false, effectiveMaxSeverity: null };
  }

  const bandMax = Math.max(...base.map((e) => e.severity));
  let maxNext = rules.cooldownMaxNextSeverity;

  while (maxNext <= bandMax) {
    const pool = base.filter((e) => e.severity <= maxNext);
    if (pool.length > 0) {
      return { pool, cooldownActive: true, effectiveMaxSeverity: maxNext };
    }
    maxNext += 1;
  }

  return { pool: base, cooldownActive: true, effectiveMaxSeverity: bandMax };
}

export function countEntriesInSeverityRange(
  table: WeatherTableEntry[],
  min: number,
  max: number,
): number {
  return table.filter((e) => e.severity >= min && e.severity <= max).length;
}

export function countEntriesWithMagicalMode(
  table: WeatherTableEntry[],
  mode: MagicalMode,
): number {
  return applyMagicalDial(table, mode).length;
}

/**
 * Weighted pick by original d100 range width; returns a roll inside that entry's min–max.
 */
export function pickWeightedFromPool(pool: WeatherTableEntry[]): {
  entry: WeatherTableEntry;
  roll: number;
} {
  if (pool.length === 0) {
    throw new Error('Cannot pick from an empty weather pool');
  }

  const totalWeight = pool.reduce((sum, e) => sum + (e.max - e.min + 1), 0);
  let ticket = Math.floor(Math.random() * totalWeight) + 1;

  for (const entry of pool) {
    const width = entry.max - entry.min + 1;
    if (ticket <= width) {
      return { entry, roll: entry.min + ticket - 1 };
    }
    ticket -= width;
  }

  const last = pool[pool.length - 1]!;
  return { entry: last, roll: last.max };
}

export function entryHasDurationRange(entry: WeatherTableEntry): boolean {
  return entry.durationMinHours !== undefined && entry.durationMaxHours !== undefined;
}

export function parseMagicalMode(raw: string): MagicalMode | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'only' || normalized === 'none') return normalized;
  return null;
}
