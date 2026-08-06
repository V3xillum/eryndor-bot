/**
 * Proof of concept — D&D Beyond character JSON → skill bonuses (+ identity).
 * Used by /dev character; kept for a future character-import feature.
 *
 * Parses a raw D&D Beyond character JSON payload
 * (from https://character-service.dndbeyond.com/character/v5/character/{id})
 * and computes each skill's total bonus, plus basic character identity.
 *
 * Usage:
 *   const overview = getCharacterOverview(json.data);
 *   // or skills only:
 *   const skills = getCharacterSkills(json.data);
 */

interface DdbStat {
  id: number; // 1=Str 2=Dex 3=Con 4=Int 5=Wis 6=Cha
  value: number | null;
}

interface DdbModifier {
  type: string;
  subType: string;
  isGranted: boolean;
  entityTypeId?: number;
  value: number | null;
}

interface DdbModifierGroups {
  race: DdbModifier[];
  class: DdbModifier[];
  background: DdbModifier[];
  item: DdbModifier[];
  feat: DdbModifier[];
  condition: DdbModifier[];
}

interface DdbClassDefinition {
  name: string;
}

interface DdbSubclassDefinition {
  name: string;
}

interface DdbClass {
  level: number;
  definition: DdbClassDefinition;
  subclassDefinition: DdbSubclassDefinition | null;
}

export interface DdbCharacter {
  name: string;
  stats: DdbStat[];
  bonusStats: DdbStat[];
  overrideStats: DdbStat[];
  modifiers: DdbModifierGroups;
  classes: DdbClass[];
}

type AbilityId = 1 | 2 | 3 | 4 | 5 | 6;

const ABILITY_NAMES: Record<AbilityId, string> = {
  1: 'Strength',
  2: 'Dexterity',
  3: 'Constitution',
  4: 'Intelligence',
  5: 'Wisdom',
  6: 'Charisma',
};

/** DDB modifier subType slugs for ability-score-increase bonuses. */
const ABILITY_SCORE_SUBTYPES: Record<AbilityId, string> = {
  1: 'strength-score',
  2: 'dexterity-score',
  3: 'constitution-score',
  4: 'intelligence-score',
  5: 'wisdom-score',
  6: 'charisma-score',
};

const SKILLS: { slug: string; name: string; ability: AbilityId }[] = [
  { slug: 'acrobatics', name: 'Acrobatics', ability: 2 },
  { slug: 'animal-handling', name: 'Animal Handling', ability: 5 },
  { slug: 'arcana', name: 'Arcana', ability: 4 },
  { slug: 'athletics', name: 'Athletics', ability: 1 },
  { slug: 'deception', name: 'Deception', ability: 6 },
  { slug: 'history', name: 'History', ability: 4 },
  { slug: 'insight', name: 'Insight', ability: 5 },
  { slug: 'intimidation', name: 'Intimidation', ability: 6 },
  { slug: 'investigation', name: 'Investigation', ability: 4 },
  { slug: 'medicine', name: 'Medicine', ability: 5 },
  { slug: 'nature', name: 'Nature', ability: 4 },
  { slug: 'perception', name: 'Perception', ability: 5 },
  { slug: 'performance', name: 'Performance', ability: 6 },
  { slug: 'persuasion', name: 'Persuasion', ability: 6 },
  { slug: 'religion', name: 'Religion', ability: 4 },
  { slug: 'sleight-of-hand', name: 'Sleight of Hand', ability: 2 },
  { slug: 'stealth', name: 'Stealth', ability: 2 },
  { slug: 'survival', name: 'Survival', ability: 5 },
];

export interface SkillResult {
  name: string;
  ability: string;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
  bonus: number;
}

export interface DdbClassInfo {
  name: string;
  level: number;
  subclass: string | null;
}

export interface CharacterOverview {
  name: string;
  level: number;
  classes: DdbClassInfo[];
  skills: SkillResult[];
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function proficiencyBonus(totalLevel: number): number {
  return Math.ceil(totalLevel / 4) + 1;
}

function finalStat(
  id: AbilityId,
  base: DdbStat[],
  bonus: DdbStat[],
  override: DdbStat[],
  allModifiers: DdbModifier[],
): number {
  const ov = override.find((s) => s.id === id)?.value;
  if (ov != null) return ov;
  const baseVal = base.find((s) => s.id === id)?.value ?? 10;
  const bonusStatVal = bonus.find((s) => s.id === id)?.value ?? 0;

  // Player-chosen ASIs are often isGranted: false but still active on the sheet.
  const modifierAsi = allModifiers
    .filter((m) => m.type === 'bonus' && m.subType === ABILITY_SCORE_SUBTYPES[id])
    .reduce((sum, m) => sum + (m.value ?? 0), 0);

  let score = baseVal + bonusStatVal + modifierAsi;

  const setModifier = allModifiers
    .filter(
      (m) =>
        m.type === 'set' &&
        m.subType === ABILITY_SCORE_SUBTYPES[id] &&
        m.isGranted,
    )
    .reduce((max, m) => Math.max(max, m.value ?? 0), 0);
  if (setModifier > score) score = setModifier;

  return score;
}

/**
 * Computes every skill's total bonus for a D&D Beyond character.
 * Includes ASI modifiers, item set-scores, flat skill bonuses, and
 * global ability-check bonuses.
 */
export function getCharacterSkills(character: DdbCharacter): SkillResult[] {
  const totalLevel = character.classes.reduce((sum, c) => sum + c.level, 0);
  const profBonus = proficiencyBonus(totalLevel);

  const allModifiers: DdbModifier[] = [
    ...character.modifiers.race,
    ...character.modifiers.class,
    ...character.modifiers.background,
    ...character.modifiers.item,
    ...character.modifiers.feat,
    ...character.modifiers.condition,
  ];

  const proficientSkills = new Set(
    allModifiers
      .filter((m) => m.type === 'proficiency' && m.isGranted)
      .map((m) => m.subType),
  );
  const expertSkills = new Set(
    allModifiers
      .filter((m) => m.type === 'expertise' && m.isGranted)
      .map((m) => m.subType),
  );

  return SKILLS.map(({ slug, name, ability }) => {
    const score = finalStat(
      ability,
      character.stats,
      character.bonusStats,
      character.overrideStats,
      allModifiers,
    );
    const modifier = abilityModifier(score);
    const proficient = proficientSkills.has(slug);
    const expertise = expertSkills.has(slug);

    let bonus = modifier;
    if (expertise) bonus += profBonus * 2;
    else if (proficient) bonus += profBonus;

    const flatSkillBonus = allModifiers
      .filter((m) => m.type === 'bonus' && m.subType === slug && m.isGranted)
      .reduce((sum, m) => sum + (m.value ?? 0), 0);
    bonus += flatSkillBonus;

    const globalCheckBonus = allModifiers
      .filter(
        (m) =>
          m.type === 'bonus' &&
          m.subType === 'ability-checks' &&
          m.isGranted,
      )
      .reduce((sum, m) => sum + (m.value ?? 0), 0);
    bonus += globalCheckBonus;

    return {
      name,
      ability: ABILITY_NAMES[ability],
      modifier,
      proficient,
      expertise,
      bonus,
    };
  });
}

export function getCharacterOverview(character: DdbCharacter): CharacterOverview {
  const classes: DdbClassInfo[] = character.classes.map((c) => ({
    name: c.definition.name,
    level: c.level,
    subclass: c.subclassDefinition?.name ?? null,
  }));
  const level = classes.reduce((sum, c) => sum + c.level, 0);

  return {
    name: character.name,
    level,
    classes,
    skills: getCharacterSkills(character),
  };
}

export function isDdbCharacter(value: unknown): value is DdbCharacter {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  if (typeof c.name !== 'string' || !c.name.trim()) return false;
  if (
    !Array.isArray(c.stats) ||
    !Array.isArray(c.bonusStats) ||
    !Array.isArray(c.overrideStats) ||
    !Array.isArray(c.classes) ||
    c.modifiers == null ||
    typeof c.modifiers !== 'object'
  ) {
    return false;
  }

  return c.classes.every((cls) => {
    if (!cls || typeof cls !== 'object') return false;
    const row = cls as Record<string, unknown>;
    if (typeof row.level !== 'number') return false;
    const def = row.definition;
    if (!def || typeof def !== 'object') return false;
    return typeof (def as Record<string, unknown>).name === 'string';
  });
}
