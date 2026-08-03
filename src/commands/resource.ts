import {
  ChannelType,
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
import { startResourceAmountWizard } from './resourceWizard.js';

export function buildResourceCommand() {
  return new SlashCommandBuilder()
    .setName('resource')
    .setDescription('Guild resource stockpile')
    .addSubcommandGroup((group) =>
      group
        .setName('type')
        .setDescription('Resource types')
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('List resource types'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('donate')
        .setDescription('Donate to the guild stockpile (form: type + amount)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy from the guild stockpile (form: type + amount)'),
    )
    .addSubcommand((sub) =>
      sub.setName('stock').setDescription('Show the guild stockpile'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('overview')
        .setDescription(
          'Private overview: guild stock, your stash, and building progress',
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('personal')
        .setDescription('Your personal resource stash')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add to your personal stash (form: type + amount)'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove from your personal stash (form: type + amount)'),
        )
        .addSubcommand((sub) =>
          sub.setName('show').setDescription('Show your personal stash'),
        ),
    );
}

export function buildResourceAdminSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure the channel for public resource posts')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for silent donate/buy/personal/building posts')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Clear the resource channel setup'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('adjust')
        .setDescription(
          'Correct guild stock without a public GC post (add or remove via form)',
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cap')
        .setDescription('Show or set the per-type storage cap')
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription('New cap (omit to show current)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(999999),
        ),
    );
}

export function buildResourceTypeAdminSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a resource type (id is derived from the name)')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Display name (e.g. Hout)')
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('sell')
            .setDescription('GC received when donating one unit')
            .setRequired(true)
            .setMinValue(0),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('buy')
            .setDescription('GC cost when buying (default 2× sell)')
            .setRequired(false)
            .setMinValue(0),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit a resource type (stable id stays the same)')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Current name or id (e.g. Hout / hout)')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('rename')
            .setDescription('New display name (does not change the id)')
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('sell')
            .setDescription('New sell GC')
            .setRequired(false)
            .setMinValue(0),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('buy')
            .setDescription('New buy GC')
            .setRequired(false)
            .setMinValue(0),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a resource type (stock must be 0)')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Name or id to remove')
            .setRequired(true),
        ),
    );
}

export async function handleResourceCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    resources: ResourceService;
    buildings: BuildingService;
    config: AppConfig;
  },
): Promise<void> {
  const { resources, buildings } = deps;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: resources.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (group === 'type') {
    await handleTypeGroup(interaction, resources);
    return;
  }

  if (group === 'personal') {
    await handlePersonalGroup(interaction, resources);
    return;
  }

  switch (sub) {
    case 'donate':
      await handleDonate(interaction, resources);
      return;
    case 'buy':
      await handleBuy(interaction, resources);
      return;
    case 'stock':
      await handleStock(interaction, resources);
      return;
    case 'overview':
      await handleOverview(interaction, resources, buildings);
      return;
    default:
      await interaction.reply({
        content: resources.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

export async function dispatchResourceAdmin(
  interaction: ChatInputCommandInteraction,
  deps: {
    resources: ResourceService;
    config: AppConfig;
  },
  route: { group: 'type' | null; sub: string },
): Promise<void> {
  const { resources, config } = deps;
  const { group, sub } = route;

  if (!interaction.guildId) {
    await interaction.reply({
      content: resources.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: resources.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  if (group === 'type') {
    await handleTypeGroup(interaction, resources);
    return;
  }

  switch (sub) {
    case 'setup':
      await handleSetup(interaction, resources);
      return;
    case 'clear':
      await handleClear(interaction, resources);
      return;
    case 'cap':
      await handleCap(interaction, resources);
      return;
    case 'adjust':
      await handleAdjust(interaction, resources);
      return;
    default:
      await interaction.reply({
        content: resources.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  resources.setup(interaction.guildId!, channel.id);
  await interaction.reply({
    content: formatTemplate(resources.messages.resourceSetupSuccess, {
      target: `<#${channel.id}>`,
    }),
    ephemeral: true,
  });
}

async function handleClear(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const cleared = resources.clear(interaction.guildId!);
  await interaction.reply({
    content: cleared
      ? resources.messages.resourceClearSuccess
      : resources.messages.resourceClearNone,
    ephemeral: true,
  });
}

async function handleTypeGroup(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const nickname = resolveNicknameSync(interaction);

  switch (sub) {
    case 'add': {
      const result = resources.addType({
        guildId: interaction.guildId!,
        displayName: interaction.options.getString('name', true),
        sellGc: interaction.options.getInteger('sell', true),
        buyGc: interaction.options.getInteger('buy'),
        actorUserId: interaction.user.id,
        actorNickname: nickname,
      });
      if (!result.ok) {
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
      await interaction.reply({
        content: formatTemplate(resources.messages.resourceTypeAddSuccess, {
          name: result.type.display_name,
          key: result.type.key,
          sell: String(result.type.sell_gc),
          buy: String(result.type.buy_gc),
        }),
        ephemeral: true,
      });
      return;
    }
    case 'edit': {
      const result = resources.editType({
        guildId: interaction.guildId!,
        nameRaw: interaction.options.getString('name', true),
        displayName: interaction.options.getString('rename'),
        sellGc: interaction.options.getInteger('sell'),
        buyGc: interaction.options.getInteger('buy'),
        actorUserId: interaction.user.id,
        actorNickname: nickname,
      });
      if (!result.ok) {
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
      await interaction.reply({
        content: formatTemplate(resources.messages.resourceTypeEditSuccess, {
          name: result.type.display_name,
          key: result.type.key,
          sell: String(result.type.sell_gc),
          buy: String(result.type.buy_gc),
        }),
        ephemeral: true,
      });
      return;
    }
    case 'remove': {
      const result = resources.removeType({
        guildId: interaction.guildId!,
        nameRaw: interaction.options.getString('name', true),
        actorUserId: interaction.user.id,
        actorNickname: nickname,
      });
      if (!result.ok) {
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
      await interaction.reply({
        content: formatTemplate(resources.messages.resourceTypeRemoveSuccess, {
          name: result.type.display_name,
          key: result.type.key,
        }),
        ephemeral: true,
      });
      return;
    }
    case 'list': {
      const types = resources.listTypes(interaction.guildId!);
      if (types.length === 0) {
        await interaction.reply({
          content: resources.messages.resourceTypeListEmpty,
          ephemeral: true,
        });
        return;
      }
      const lines = types.map((t) =>
        formatTemplate(resources.messages.resourceTypeListItem, {
          name: t.display_name,
          key: t.key,
          sell: String(t.sell_gc),
          buy: String(t.buy_gc),
        }),
      );
      const embed = new EmbedBuilder()
        .setTitle(resources.messages.resourceTypeListTitle)
        .setDescription(lines.join('\n').slice(0, 4000));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    default:
      await interaction.reply({
        content: resources.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleDonate(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  await startResourceAmountWizard(interaction, resources, 'donate');
}

async function handleBuy(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  await startResourceAmountWizard(interaction, resources, 'buy');
}

async function handleStock(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const rows = resources.stockOverview(interaction.guildId!);
  const cap = resources.getStorageCap(interaction.guildId!);
  if (rows.length === 0) {
    await interaction.reply({
      content:
        resources.messages.resourceStockEmpty +
        '\n' +
        formatTemplate(resources.messages.resourceStockCapNote, {
          cap: String(cap),
        }),
      ephemeral: true,
    });
    return;
  }
  const lines = rows.map((row) =>
    formatTemplate(resources.messages.resourceStockLine, {
      name: row.type.display_name,
      qty: String(row.quantity),
      cap: String(cap),
    }),
  );
  const embed = new EmbedBuilder()
    .setTitle(resources.messages.resourceStockTitle)
    .setDescription(
      (
        formatTemplate(resources.messages.resourceStockCapNote, {
          cap: String(cap),
        }) +
        '\n\n' +
        lines.join('\n')
      ).slice(0, 4000),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCap(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const amount = interaction.options.getInteger('amount');
  if (amount == null) {
    const cap = resources.getStorageCap(interaction.guildId!);
    await interaction.reply({
      content: formatTemplate(resources.messages.resourceCapShow, {
        cap: String(cap),
      }),
      ephemeral: true,
    });
    return;
  }

  const result = resources.setStorageCap(interaction.guildId!, amount);
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: formatTemplate(resources.messages.resourceCapSuccess, {
      cap: String(result.cap),
    }),
    ephemeral: true,
  });
}

async function handlePersonalGroup(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const nickname = resolveNicknameSync(interaction);

  if (sub === 'show') {
    const rows = resources.personalOverview(
      interaction.guildId!,
      interaction.user.id,
    );
    if (rows.length === 0) {
      await interaction.reply({
        content: resources.messages.resourcePersonalEmpty,
        ephemeral: true,
      });
      return;
    }
    const lines = rows.map((row) =>
      formatTemplate(resources.messages.resourcePersonalLine, {
        name: row.type.display_name,
        qty: String(row.quantity),
      }),
    );
    const embed = new EmbedBuilder()
      .setTitle(
        formatTemplate(resources.messages.resourcePersonalTitle, { nickname }),
      )
      .setDescription(lines.join('\n').slice(0, 4000));
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === 'add') {
    await startResourceAmountWizard(interaction, resources, 'personal_add');
    return;
  }

  if (sub === 'remove') {
    await startResourceAmountWizard(interaction, resources, 'personal_remove');
    return;
  }

  await interaction.reply({
    content: resources.messages.unknownSubcommand,
    ephemeral: true,
  });
}

async function handleOverview(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
  buildings: BuildingService,
): Promise<void> {
  const guildId = interaction.guildId!;
  const nickname = resolveNicknameSync(interaction);
  const embeds: EmbedBuilder[] = [];

  const cap = resources.getStorageCap(guildId);
  const stockRows = resources.stockOverview(guildId);
  const stockLines =
    stockRows.length === 0
      ? [resources.messages.resourceStockEmpty]
      : stockRows.map((row) =>
          formatTemplate(resources.messages.resourceStockLine, {
            name: row.type.display_name,
            qty: String(row.quantity),
            cap: String(cap),
          }),
        );
  embeds.push(
    new EmbedBuilder()
      .setTitle(resources.messages.resourceOverviewGuildTitle)
      .setDescription(
        (
          formatTemplate(resources.messages.resourceStockCapNote, {
            cap: String(cap),
          }) +
          '\n\n' +
          stockLines.join('\n')
        ).slice(0, 4000),
      ),
  );

  const personalRows = resources.personalOverview(guildId, interaction.user.id);
  const personalLines =
    personalRows.length === 0
      ? [resources.messages.resourcePersonalEmpty]
      : personalRows.map((row) =>
          formatTemplate(resources.messages.resourcePersonalLine, {
            name: row.type.display_name,
            qty: String(row.quantity),
          }),
        );
  embeds.push(
    new EmbedBuilder()
      .setTitle(
        formatTemplate(resources.messages.resourceOverviewPersonalTitle, {
          nickname,
        }),
      )
      .setDescription(personalLines.join('\n').slice(0, 4000)),
  );

  const buildingList = buildings
    .list(guildId)
    .filter((b) => b.status !== 'cancelled');
  const buildingBlocks: string[] = [];
  if (buildingList.length === 0) {
    buildingBlocks.push(buildings.messages.buildingListEmpty);
  } else {
    for (const b of buildingList.slice(0, 15)) {
      const detail = buildings.detailById(guildId, b.id);
      if (!detail.ok) continue;
      const materialLines =
        detail.materials.length === 0
          ? [buildings.messages.buildingCostShowEmpty]
          : detail.materials.map((m) =>
              formatTemplate(buildings.messages.buildingCostShowLine, {
                type: m.displayName,
                funded: String(m.funded),
                required: String(m.required),
              }),
            );
      const phaseLine = formatTemplate(
        resources.messages.resourceOverviewBuildingPhase,
        { phase: detail.statusLabel },
      );
      const timeLine = formatTemplate(
        resources.messages.resourceOverviewBuildingTime,
        {
          spent: String(detail.building.time_spent),
          required: String(detail.building.time_required),
        },
      );
      buildingBlocks.push(
        [
          formatTemplate(resources.messages.resourceOverviewBuildingHeader, {
            name: detail.building.name,
          }),
          phaseLine,
          ...materialLines,
          timeLine,
        ].join('\n'),
      );
    }
  }
  embeds.push(
    new EmbedBuilder()
      .setTitle(resources.messages.resourceOverviewBuildingsTitle)
      .setDescription(buildingBlocks.join('\n\n').slice(0, 4000)),
  );

  await interaction.reply({ embeds, ephemeral: true });
}

async function handleAdjust(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  await startResourceAmountWizard(interaction, resources, 'adjust');
}

function resolveNicknameSync(interaction: ChatInputCommandInteraction): string {
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
