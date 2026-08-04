import {
  EmbedBuilder,
  SlashCommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { BuildingService } from '../services/BuildingService.js';
import type { ResourceService } from '../services/ResourceService.js';
import { formatTemplate } from '../utils/helpers.js';
import { guildNickname } from './resourceEmbeds.js';
import {
  startContributeWizard,
  startCostAddWizard,
  startCostShowWizard,
  startCostTimeWizard,
  startFundingAdjustWizard,
  startMaterialWizard,
  startSpentAdjustWizard,
} from './buildingWizard.js';

export function buildBuildingCommand() {
  return new SlashCommandBuilder()
    .setName('bouw')
    .setDescription('Bouwprojecten: materialen leveren en meewerken')
    .addSubcommand((sub) =>
      sub.setName('lijst').setDescription('Welke bouwprojecten lopen er?'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Detail van één project: materialen, tijd en fase (menu)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leveren')
        .setDescription('Lever materiaal aan een project (van buiten of jouw stash, + GC)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('uit-guild')
        .setDescription('Zet guild-voorraad in op een project (geen GC)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('meewerken')
        .setDescription('Besteed werktijd aan een project (1 GC per eenheid)'),
    );
}

export function buildBuildingAdminSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Start een nieuw bouwproject')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Naam van het project').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Annuleer een project; gestorte materialen gaan terug')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Naam van het project').setRequired(true),
        ),
    );
}

export function buildBuildingCostAdminSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Voeg een materiaalkost toe aan een project'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buildtime')
        .setDescription('Hoeveel werktijd is nodig om te bouwen?'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('funding')
        .setDescription('Corrigeer gestorte materialen (stil, zonder GC)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('spent')
        .setDescription('Corrigeer bestede werktijd (stil, zonder GC)'),
    );
}

export async function handleBuildingCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    buildings: BuildingService;
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { buildings, resources } = deps;
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: buildings.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'lijst':
      await handleList(interaction, buildings);
      return;
    case 'status':
      await startCostShowWizard(interaction, { buildings, resources });
      return;
    case 'uit-guild':
      await startMaterialWizard(interaction, { buildings, resources }, 'usestock');
      return;
    case 'leveren':
      await startMaterialWizard(interaction, { buildings, resources }, 'deliver');
      return;
    case 'meewerken':
      await startContributeWizard(interaction, { buildings, resources });
      return;
    default:
      await interaction.reply({
        content: buildings.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

export async function dispatchBuildingAdmin(
  interaction: ChatInputCommandInteraction,
  deps: {
    buildings: BuildingService;
    resources: ResourceService;
    config: AppConfig;
  },
  route: { group: 'cost' | null; sub: string },
): Promise<void> {
  const { buildings, resources, config } = deps;
  const { group, sub } = route;

  if (!interaction.guildId) {
    await interaction.reply({
      content: buildings.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: buildings.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  if (group === 'cost') {
    await handleCostGroup(interaction, buildings, resources);
    return;
  }

  switch (sub) {
    case 'create':
      await handleCreate(interaction, buildings);
      return;
    case 'cancel':
      await handleCancel(interaction, buildings);
      return;
    default:
      await interaction.reply({
        content: buildings.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  buildings: BuildingService,
): Promise<void> {
  const nickname = await resolveNickname(interaction);
  const result = buildings.create({
    guildId: interaction.guildId!,
    name: interaction.options.getString('name', true),
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingCreateSuccess, {
      name: result.building.name,
      time: String(result.building.time_required),
    }),
    ephemeral: true,
  });
}

async function handleCostGroup(
  interaction: ChatInputCommandInteraction,
  buildings: BuildingService,
  resources: ResourceService,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'add':
      await startCostAddWizard(interaction, { buildings, resources });
      return;
    case 'buildtime':
      await startCostTimeWizard(interaction, { buildings, resources });
      return;
    case 'funding':
      await startFundingAdjustWizard(interaction, { buildings, resources });
      return;
    case 'spent':
      await startSpentAdjustWizard(interaction, { buildings, resources });
      return;
    default:
      await interaction.reply({
        content: buildings.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  buildings: BuildingService,
): Promise<void> {
  const list = buildings.list(interaction.guildId!);
  if (list.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingListEmpty,
      ephemeral: true,
    });
    return;
  }
  const lines = list.map((b) =>
    formatTemplate(buildings.messages.buildingListItem, {
      name: b.name,
      status: buildings.statusLabel(b.status),
    }),
  );
  const embed = new EmbedBuilder()
    .setTitle(buildings.messages.buildingListTitle)
    .setDescription(lines.join('\n').slice(0, 4000));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCancel(
  interaction: ChatInputCommandInteraction,
  buildings: BuildingService,
): Promise<void> {
  const nickname = await resolveNickname(interaction);
  const result = buildings.cancel({
    guildId: interaction.guildId!,
    buildingName: interaction.options.getString('name', true),
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingCancelSuccess, {
      name: result.building.name,
    }),
    ephemeral: true,
  });
}

async function resolveNickname(
  interaction: ChatInputCommandInteraction,
): Promise<string> {
  const member =
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as GuildMember)
      : null;
  const apiNick =
    interaction.member && 'nick' in interaction.member
      ? (interaction.member.nick as string | null | undefined)
      : null;
  return guildNickname(member, interaction.user, apiNick);
}
