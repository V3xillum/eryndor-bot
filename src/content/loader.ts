import fs from 'node:fs';
import path from 'node:path';
import type { Messages, WeatherTableEntry } from '../types.js';

const CONTENT_ROOT = path.resolve(process.cwd(), 'content');

export function loadWeatherTable(): WeatherTableEntry[] {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, 'weather-table.json'), 'utf8');
  const table = JSON.parse(raw) as WeatherTableEntry[];
  validateWeatherTable(table);
  return table;
}

export function loadMessages(): Messages {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, 'messages.json'), 'utf8');
  return JSON.parse(raw) as Messages;
}

export function resolveImagePath(filename: string): string {
  return path.join(CONTENT_ROOT, 'images', filename);
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
