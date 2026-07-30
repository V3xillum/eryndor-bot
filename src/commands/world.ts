import {
  ChannelType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import {
  CalendarFetchError,
  type EryndorCalendarService,
} from '../services/EryndorCalendarService.js';
import type { WeatherService } from '../services/WeatherService.js';
import { formatTemplate } from '../utils/helpers.js';

export function buildWorldCommand() {
  return new SlashCommandBuilder()
    .setName('world')
    .setDescription('Eryndor calendar and world info')
    .addSubcommand((sub) =>
      sub
        .setName('today')
        .setDescription('Show the current Harptos day, moon phase, and events'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fullmoon')
        .setDescription('Show the next exact Full Moon on the Eryndor calendar'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription(
          'Configure where morning calendar-event posts go (only on days with events)',
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for calendar-event posts')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Disable automatic morning calendar-event posts'),
    );
}

const ADMIN_SUBCOMMANDS = new Set(['setup', 'clear']);

export async function handleWorldCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    calendar: EryndorCalendarService;
    weather: WeatherService;
    config: AppConfig;
  },
): Promise<void> {
  const { calendar, weather, config } = deps;
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: calendar.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (ADMIN_SUBCOMMANDS.has(sub) && !config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: calendar.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'today':
      await handleToday(interaction, calendar);
      return;
    case 'fullmoon':
      await handleFullMoon(interaction, calendar);
      return;
    case 'setup':
      await handleSetup(interaction, weather, calendar);
      return;
    case 'clear':
      await handleClear(interaction, weather, calendar);
      return;
    default:
      await interaction.reply({
        content: calendar.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleToday(
  interaction: ChatInputCommandInteraction,
  calendar: EryndorCalendarService,
): Promise<void> {
  await interaction.deferReply();

  try {
    const day = await calendar.getToday();
    await interaction.editReply({ embeds: [calendar.buildTodayEmbed(day)] });
  } catch (error) {
    if (error instanceof CalendarFetchError) {
      await interaction.editReply({ content: calendar.messages.calendarLoadError });
      return;
    }
    throw error;
  }
}

async function handleFullMoon(
  interaction: ChatInputCommandInteraction,
  calendar: EryndorCalendarService,
): Promise<void> {
  await interaction.deferReply();

  try {
    const next = await calendar.getNextFullMoon();
    await interaction.editReply({ embeds: [calendar.buildFullMoonEmbed(next)] });
  } catch (error) {
    if (error instanceof CalendarFetchError) {
      await interaction.editReply({ content: calendar.messages.calendarLoadError });
      return;
    }
    throw error;
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
  calendar: EryndorCalendarService,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  weather.setupCalendarChannel(interaction.guildId!, channel.id);

  await interaction.reply({
    content: formatTemplate(calendar.messages.calendarSetupSuccess, {
      target: `<#${channel.id}>`,
    }),
    ephemeral: true,
  });
}

async function handleClear(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
  calendar: EryndorCalendarService,
): Promise<void> {
  const cleared = weather.clearCalendarChannel(interaction.guildId!);
  await interaction.reply({
    content: cleared
      ? calendar.messages.calendarClearSuccess
      : calendar.messages.calendarClearNone,
    ephemeral: true,
  });
}
