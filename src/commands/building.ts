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
  startMaterialWizard,
} from './buildingWizard.js';

export function buildBuildingCommand() {
  return new SlashCommandBuilder()
    .setName('building')
    .setDescription('Guild building projects')
    .addSubcommandGroup((group) =>
      group
        .setName('cost')
        .setDescription('Project costs and progress')
        .addSubcommand((sub) =>
          sub.setName('show').setDescription('Show costs and progress (menu)'),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List building projects'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Show project status (menu)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fund')
        .setDescription('Move materials from guild stock into a project (menu + amount)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('donate')
        .setDescription('Donate materials directly into a project (menu + amount)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('contribute')
        .setDescription('Spend time on a building project (menu + amount, 1 GC per unit)'),
    );
}

export function buildBuildingAdminSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a building project')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Project name').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel a project and return funded materials')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Project name').setRequired(true),
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
        .setDescription('Add a material cost (menu → type + amount; can add more)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buildtime')
        .setDescription('Set build time for phase 2 (default 100; 1 unit = 1 GC)'),
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
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: buildings.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (group === 'cost') {
    if (sub === 'show') {
      await startCostShowWizard(interaction, { buildings, resources });
      return;
    }
    await interaction.reply({
      content: buildings.messages.unknownSubcommand,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'list':
      await handleList(interaction, buildings);
      return;
    case 'status':
      await startCostShowWizard(interaction, { buildings, resources });
      return;
    case 'fund':
      await startMaterialWizard(interaction, { buildings, resources }, 'fund');
      return;
    case 'donate':
      await startMaterialWizard(interaction, { buildings, resources }, 'donate');
      return;
    case 'contribute':
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
