/**
 * Proof of concept — fetch + parse public D&D Beyond characters for /dev.
 * Not wired while the PoC command is commented out; keep for later character import.
 */
import {
  getCharacterOverview,
  isDdbCharacter,
  type CharacterOverview,
  type DdbCharacter,
} from '../utils/ddbSkills.js';

const CHARACTER_URL =
  'https://character-service.dndbeyond.com/character/v5/character';

export type DdbFetchFailure =
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'private' }
  | { ok: false; reason: 'invalid_payload' }
  | { ok: false; reason: 'network' };

export type DdbFetchResult =
  | ({ ok: true; characterId: string } & CharacterOverview)
  | DdbFetchFailure;

export class DdbCharacterService {
  async fetchOverview(characterId: string): Promise<DdbFetchResult> {
    const id = characterId.trim();
    if (!/^\d+$/.test(id)) {
      return { ok: false, reason: 'not_found' };
    }

    let response: Response;
    try {
      response = await fetch(`${CHARACTER_URL}/${id}`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      return { ok: false, reason: 'network' };
    }

    if (response.status === 404) {
      return { ok: false, reason: 'not_found' };
    }
    if (response.status === 403) {
      return { ok: false, reason: 'private' };
    }
    if (!response.ok) {
      return { ok: false, reason: 'network' };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'invalid_payload' };
    }

    const data = extractCharacterData(body);
    if (!data) {
      return { ok: false, reason: 'invalid_payload' };
    }

    const overview = getCharacterOverview(data);
    return { ok: true, characterId: id, ...overview };
  }
}

function extractCharacterData(body: unknown): DdbCharacter | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const data = root.data ?? root;
  return isDdbCharacter(data) ? data : null;
}
