import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { ResourceService } from '../services/ResourceService.js';
import { formatTemplate } from '../utils/helpers.js';
import {
  buildBuyEmbed,
  buildDonateEmbed,
  buildPersonalAddEmbed,
  buildPersonalRemoveEmbed,
  guildNickname,
  postSilentEmbed,
} from './resourceEmbeds.js';

const ADMIN_SUBCOMMANDS = new Set(['setup', 'clear', 'adjust', 'cap']);
const ADMIN_GROUPS = new Set(['type']);

export function buildResourceCommand() {
  return new SlashCommandBuilder()
    .setName('resource')
    .setDescription('Guild resource stockpile')
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
    .addSubcommandGroup((group) =>
      group
        .setName('type')
        .setDescription('Manage resource types (DM)')
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
        )
        .addSubcommand((sub) =>
          sub.setName('list').setDescription('List resource types'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('donate')
        .setDescription('Donate resources to the guild stockpile')
        .addStringOption((opt) =>
          opt.setName('type').setDescription('Resource name (e.g. Hout)').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription('How many to donate')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(9999),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy resources from the guild stockpile')
        .addStringOption((opt) =>
          opt.setName('type').setDescription('Resource name').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription('How many to buy')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(9999),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('stock').setDescription('Show the guild stockpile'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cap')
        .setDescription('Show or set the per-type storage cap (DM)')
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription('New cap (omit to show current)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(999999),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('personal')
        .setDescription('Your personal resource stash')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add resources to your personal stash')
            .addStringOption((opt) =>
              opt.setName('type').setDescription('Resource name').setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName('amount')
                .setDescription('How many to add')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(9999),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove resources from your personal stash')
            .addStringOption((opt) =>
              opt.setName('type').setDescription('Resource name').setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName('amount')
                .setDescription('How many to remove')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(9999),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName('show').setDescription('Show your personal stash'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('adjust')
        .setDescription('Adjust stock without GC (DM)')
        .addStringOption((opt) =>
          opt.setName('type').setDescription('Resource name').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription('Delta (can be negative)')
            .setRequired(true)
            .setMinValue(-9999)
            .setMaxValue(9999),
        ),
    );
}

export async function handleResourceCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { resources, config } = deps;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: resources.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const needsAdmin =
    (group != null && ADMIN_GROUPS.has(group)) || ADMIN_SUBCOMMANDS.has(sub);
  // type list is public
  const isTypeList = group === 'type' && sub === 'list';
  if (needsAdmin && !isTypeList && !config.allowedUserIds.includes(interaction.user.id)) {
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

  if (group === 'personal') {
    await handlePersonalGroup(interaction, resources);
    return;
  }

  switch (sub) {
    case 'setup':
      await handleSetup(interaction, resources);
      return;
    case 'clear':
      await handleClear(interaction, resources);
      return;
    case 'donate':
      await handleDonate(interaction, resources);
      return;
    case 'buy':
      await handleBuy(interaction, resources);
      return;
    case 'stock':
      await handleStock(interaction, resources);
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
  const settings = resources.getSettings(interaction.guildId!);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const member =
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as GuildMember)
      : null;
  const apiNick =
    interaction.member && 'nick' in interaction.member
      ? (interaction.member.nick as string | null | undefined)
      : null;
  const nickname = guildNickname(member, interaction.user, apiNick);

  const result = resources.donate({
    guildId: interaction.guildId!,
    keyRaw: interaction.options.getString('type', true),
    amount: interaction.options.getInteger('amount', true),
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  const embed = buildDonateEmbed(resources.messages, {
    nickname,
    amount: result.amount,
    typeName: result.type.display_name,
    gc: result.gc,
    stockAfter: result.stockAfter,
    overflow: result.overflow,
  });

  const channel = await fetchResourceChannel(interaction, settings.channel_id);
  const posted = await postSilentEmbed(channel, embed);
  if (!posted) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  let reply = formatTemplate(resources.messages.resourceDonateSuccess, {
    amount: String(result.amount),
    name: result.type.display_name,
    added: String(result.added),
    gc: String(result.gc),
    stock: String(result.stockAfter),
  });
  if (result.overflow > 0) {
    reply +=
      '\n' +
      formatTemplate(resources.messages.resourceDonateOverflowNote, {
        overflow: String(result.overflow),
        name: result.type.display_name,
        personal: String(result.personalAfter ?? 0),
      });
  }

  await interaction.reply({
    content: reply,
    ephemeral: true,
  });
}

async function handleBuy(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const settings = resources.getSettings(interaction.guildId!);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const member =
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as GuildMember)
      : null;
  const apiNick =
    interaction.member && 'nick' in interaction.member
      ? (interaction.member.nick as string | null | undefined)
      : null;
  const nickname = guildNickname(member, interaction.user, apiNick);

  const result = resources.buy({
    guildId: interaction.guildId!,
    keyRaw: interaction.options.getString('type', true),
    amount: interaction.options.getInteger('amount', true),
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  const embed = buildBuyEmbed(resources.messages, {
    nickname,
    amount: result.amount,
    typeName: result.type.display_name,
    gc: result.gc,
    stockAfter: result.stockAfter,
  });

  const channel = await fetchResourceChannel(interaction, settings.channel_id);
  const posted = await postSilentEmbed(channel, embed);
  if (!posted) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: formatTemplate(resources.messages.resourceBuySuccess, {
      amount: String(result.amount),
      name: result.type.display_name,
      gc: String(result.gc),
      stock: String(result.stockAfter),
    }),
    ephemeral: true,
  });
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

  const settings = resources.getSettings(interaction.guildId!);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'add') {
    const result = resources.personalAdd({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      keyRaw: interaction.options.getString('type', true),
      amount: interaction.options.getInteger('amount', true),
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const embed = buildPersonalAddEmbed(resources.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
      stockAfter: result.stockAfter,
    });
    const channel = await fetchResourceChannel(interaction, settings.channel_id);
    const posted = await postSilentEmbed(channel, embed);
    if (!posted) {
      await interaction.reply({
        content: resources.messages.resourceNotConfigured,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: formatTemplate(resources.messages.resourcePersonalAddSuccess, {
        amount: String(result.amount),
        name: result.type.display_name,
        stock: String(result.stockAfter),
      }),
      ephemeral: true,
    });
    return;
  }

  if (sub === 'remove') {
    const result = resources.personalRemove({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      keyRaw: interaction.options.getString('type', true),
      amount: interaction.options.getInteger('amount', true),
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const embed = buildPersonalRemoveEmbed(resources.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
      stockAfter: result.stockAfter,
    });
    const channel = await fetchResourceChannel(interaction, settings.channel_id);
    const posted = await postSilentEmbed(channel, embed);
    if (!posted) {
      await interaction.reply({
        content: resources.messages.resourceNotConfigured,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: formatTemplate(resources.messages.resourcePersonalRemoveSuccess, {
        amount: String(result.amount),
        name: result.type.display_name,
        stock: String(result.stockAfter),
      }),
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: resources.messages.unknownSubcommand,
    ephemeral: true,
  });
}

async function handleAdjust(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const nickname = resolveNicknameSync(interaction);
  const result = resources.adjust({
    guildId: interaction.guildId!,
    keyRaw: interaction.options.getString('type', true),
    delta: interaction.options.getInteger('amount', true),
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  let reply = formatTemplate(resources.messages.resourceAdjustSuccess, {
    key: result.type.key,
    delta: String(result.delta),
    stock: String(result.stockAfter),
  });
  if (result.overflow > 0) {
    reply +=
      '\n' +
      formatTemplate(resources.messages.resourceAdjustOverflowNote, {
        overflow: String(result.overflow),
        personal: String(result.personalAfter ?? 0),
      });
  }
  await interaction.reply({
    content: reply,
    ephemeral: true,
  });
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

async function fetchResourceChannel(
  interaction: ChatInputCommandInteraction,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  const cached = interaction.guild?.channels.cache.get(channelId);
  if (cached?.isTextBased() && !cached.isDMBased()) {
    return cached;
  }
  try {
    const fetched = await interaction.guild?.channels.fetch(channelId);
    if (fetched?.isTextBased() && !fetched.isDMBased()) {
      return fetched;
    }
  } catch {
    return null;
  }
  return null;
}
