/** Slash-/DB-friendly resource key: slug from a display name or typed input. */
export function normalizeResourceKey(input: string): string | null {
  const key = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
  if (!key || !/^[a-z]/.test(key)) return null;
  return key;
}

/** Normalize building display name to a lookup key. */
export function normalizeBuildingNameKey(name: string): string | null {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64);
  if (!key || !/^[a-z]/.test(key)) return null;
  return key;
}
