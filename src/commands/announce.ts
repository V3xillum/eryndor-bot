import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { AnnounceService } from '../services/AnnounceService.js';
import { formatTemplate, parseScheduleWhen, parseZonedDateTime } from '../utils/helpers.js';

const MODAL_PREFIX = 'announce:';
const BODY_MAX = 2000;
const PREVIEW_LEN = 80;

export function buildAnnounceCommand() {
  return new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Schedule free-text posts to a channel (separate from weather)')
    .addSubcommand((sub) =>
      sub
        .setName('schedule')
        .setDescription('Plan a text post for later (opens a text modal)')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel where the text will be posted')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('when')
            .setDescription('30m / 2h / 1d, or YYYY-MM-DD HH:mm (server timezone)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List pending scheduled posts for this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel a pending scheduled post by id')
        .addIntegerOption((opt) =>
          opt
            .setName('id')
            .setDescription('Post id from /announce list')
            .setRequired(true)
            .setMinValue(1),
        ),
    );
}

export async function handleAnnounceCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    announce: AnnounceService;
    config: AppConfig;
  },
): Promise<void> {
  const { announce, config } = deps;
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: announce.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: announce.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'schedule':
      await handleSchedule(interaction, announce, config);
      return;
    case 'list':
      await handleList(interaction, announce);
      return;
    case 'cancel':
      await handleCancel(interaction, announce);
      return;
    default:
      await interaction.reply({
        content: announce.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

export async function handleAnnounceModal(
  interaction: ModalSubmitInteraction,
  deps: {
    announce: AnnounceService;
    config: AppConfig;
  },
): Promise<void> {
  const { announce, config } = deps;

  if (!interaction.customId.startsWith(MODAL_PREFIX)) return;

  if (!interaction.guildId) {
    await interaction.reply({
      content: announce.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: announce.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  const parsed = parseAnnounceModalId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: announce.messages.commandError,
      ephemeral: true,
    });
    return;
  }

  const body = interaction.fields.getTextInputValue('body').trim();
  if (!body) {
    await interaction.reply({
      content: announce.messages.announceBodyEmpty,
      ephemeral: true,
    });
    return;
  }

  const postAt = new Date(parsed.postAtMs);
  if (!(postAt.getTime() > Date.now())) {
    await interaction.reply({
      content: announce.messages.announceWhenInPast,
      ephemeral: true,
    });
    return;
  }

  const row = announce.schedule({
    guildId: interaction.guildId,
    channelId: parsed.channelId,
    body,
    postAt,
    createdBy: interaction.user.id,
  });

  const unix = Math.floor(postAt.getTime() / 1000);
  await interaction.reply({
    content: formatTemplate(announce.messages.announceScheduleSuccess, {
      id: row.id,
      channel: `<#${parsed.channelId}>`,
      unix,
    }),
    ephemeral: true,
  });
}

async function handleSchedule(
  interaction: ChatInputCommandInteraction,
  announce: AnnounceService,
  config: AppConfig,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  const whenRaw = interaction.options.getString('when', true);
  const timeZone = config.eryndorCalendar.timeZone;

  const postAt = parseScheduleWhen(whenRaw, timeZone);
  if (!postAt) {
    const absolute = parseZonedDateTime(whenRaw, timeZone);
    if (absolute && absolute.getTime() <= Date.now()) {
      await interaction.reply({
        content: announce.messages.announceWhenInPast,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: formatTemplate(announce.messages.announceInvalidWhen, {
        timezone: timeZone,
      }),
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(buildAnnounceModalId(channel.id, postAt.getTime()))
    .setTitle(announce.messages.announceModalTitle)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('body')
          .setLabel(announce.messages.announceModalBodyLabel)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(BODY_MAX),
      ),
    );

  await interaction.showModal(modal);
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  announce: AnnounceService,
): Promise<void> {
  const pending = announce.listPending(interaction.guildId!);
  if (pending.length === 0) {
    await interaction.reply({
      content: announce.messages.announceListEmpty,
      ephemeral: true,
    });
    return;
  }

  const lines = pending.map((post) => {
    const unix = Math.floor(new Date(post.post_at).getTime() / 1000);
    const preview =
      post.body.length > PREVIEW_LEN
        ? `${post.body.slice(0, PREVIEW_LEN).replace(/\s+/g, ' ')}…`
        : post.body.replace(/\s+/g, ' ');
    return formatTemplate(announce.messages.announceListItem, {
      id: post.id,
      channel: `<#${post.channel_id}>`,
      unix,
      preview,
    });
  });

  await interaction.reply({
    content: `${announce.messages.announceListTitle}\n${lines.join('\n')}`,
    ephemeral: true,
  });
}

async function handleCancel(
  interaction: ChatInputCommandInteraction,
  announce: AnnounceService,
): Promise<void> {
  const id = interaction.options.getInteger('id', true);
  const ok = announce.cancel(interaction.guildId!, id);
  await interaction.reply({
    content: ok
      ? formatTemplate(announce.messages.announceCancelSuccess, { id })
      : formatTemplate(announce.messages.announceCancelNotFound, { id }),
    ephemeral: true,
  });
}

function buildAnnounceModalId(channelId: string, postAtMs: number): string {
  return `${MODAL_PREFIX}${channelId}:${postAtMs}`;
}

function parseAnnounceModalId(
  customId: string,
): { channelId: string; postAtMs: number } | null {
  if (!customId.startsWith(MODAL_PREFIX)) return null;
  const rest = customId.slice(MODAL_PREFIX.length);
  const sep = rest.lastIndexOf(':');
  if (sep <= 0) return null;
  const channelId = rest.slice(0, sep);
  const postAtMs = Number(rest.slice(sep + 1));
  if (!/^\d+$/.test(channelId) || !Number.isFinite(postAtMs)) return null;
  return { channelId, postAtMs };
}
