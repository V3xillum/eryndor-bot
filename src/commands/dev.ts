/**
 * Proof of concept — D&D Beyond character skillchecks via `/dev character`.
 * Disabled in register-commands / interactionCreate / index; code kept for later.
 * Re-enable by uncommenting those wiring sites and running `npm run register-commands`.
 */
import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { DdbCharacterService } from '../services/DdbCharacterService.js';
import type { Messages } from '../types.js';
import type { DdbClassInfo, SkillResult } from '../utils/ddbSkills.js';
import { formatTemplate } from '../utils/helpers.js';

/** Parchment / sheet ink — fits Eryndor muted palette. */
const EMBED_COLOR = 0x8b5e3c;

const ABILITY_SHORT: Record<string, string> = {
  Strength: 'Str',
  Dexterity: 'Dex',
  Constitution: 'Con',
  Intelligence: 'Int',
  Wisdom: 'Wis',
  Charisma: 'Cha',
};

const DDB_SHEET_URL = 'https://www.dndbeyond.com/characters';

export function buildDevCommand() {
  return new SlashCommandBuilder()
    .setName('dev')
    .setDescription('Dev / smoke-test commands (verborgen)')
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub
        .setName('character')
        .setDescription('Haal skillchecks op van een public D&D Beyond character')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('D&D Beyond character ID (sheet moet Public zijn)')
            .setRequired(true),
        ),
    );
}

export async function handleDevCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    ddb: DdbCharacterService;
    messages: Messages;
    config: AppConfig;
  },
): Promise<void> {
  const { ddb, messages, config } = deps;
  const sub = interaction.options.getSubcommand();

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  if (sub !== 'character') {
    await interaction.reply({
      content: messages.unknownSubcommand,
      ephemeral: true,
    });
    return;
  }

  const id = interaction.options.getString('id', true).trim();
  if (!/^\d+$/.test(id)) {
    await interaction.reply({
      content: messages.ddbCharacterInvalidId,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const result = await ddb.fetchOverview(id);
  if (!result.ok) {
    const content =
      result.reason === 'not_found'
        ? formatTemplate(messages.ddbCharacterNotFound, { id })
        : result.reason === 'private'
          ? formatTemplate(messages.ddbCharacterPrivate, { id })
          : result.reason === 'invalid_payload'
            ? messages.ddbCharacterInvalidPayload
            : messages.ddbCharacterFetchError;
    await interaction.editReply({ content });
    return;
  }

  const classSummary = formatClassSummary(result.classes, messages);
  const { left, right } = splitSkillColumns(result.skills, messages);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(result.name)
    .setURL(`${DDB_SHEET_URL}/${result.characterId}`)
    .setDescription(
      [
        formatTemplate(messages.ddbCharacterLevelLine, { level: result.level }),
        classSummary,
      ].join('\n'),
    )
    .addFields(
      {
        name: messages.ddbCharacterSkillsField,
        value: left,
        inline: true,
      },
      {
        name: '\u200b',
        value: right,
        inline: true,
      },
    )
    .setFooter({
      text: formatTemplate(messages.ddbCharacterSkillsFooter, {
        id: result.characterId,
      }),
    });

  await interaction.editReply({ embeds: [embed] });
}

function formatClassSummary(classes: DdbClassInfo[], messages: Messages): string {
  return classes
    .map((cls) =>
      cls.subclass
        ? formatTemplate(messages.ddbCharacterClassWithSubclass, {
            name: cls.name,
            level: cls.level,
            subclass: cls.subclass,
          })
        : formatTemplate(messages.ddbCharacterClassLine, {
            name: cls.name,
            level: cls.level,
          }),
    )
    .join(messages.ddbCharacterClassJoin);
}

function splitSkillColumns(
  skills: SkillResult[],
  messages: Messages,
): { left: string; right: string } {
  const mid = Math.ceil(skills.length / 2);
  return {
    left: skills.slice(0, mid).map((s) => formatSkillLine(s, messages)).join('\n'),
    right: skills.slice(mid).map((s) => formatSkillLine(s, messages)).join('\n'),
  };
}

function formatSkillLine(skill: SkillResult, messages: Messages): string {
  const flag = skill.expertise
    ? messages.ddbCharacterFlagExpertise
    : skill.proficient
      ? messages.ddbCharacterFlagProficient
      : messages.ddbCharacterFlagNone;
  return formatTemplate(messages.ddbCharacterSkillLine, {
    name: skill.name,
    ability: ABILITY_SHORT[skill.ability] ?? skill.ability,
    bonus: formatSigned(skill.bonus),
    flag,
  });
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
