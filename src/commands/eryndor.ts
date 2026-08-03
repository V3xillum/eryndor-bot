import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import {
  CalendarFetchError,
  type EryndorCalendarService,
} from '../services/EryndorCalendarService.js';
import type { WeatherService } from '../services/WeatherService.js';
import { formatTemplate } from '../utils/helpers.js';

export function buildEryndorCommand() {
  return new SlashCommandBuilder()
    .setName('eryndor')
    .setDescription('Kalender, volle maan en hulp voor de bot')
    .addSubcommand((sub) =>
      sub
        .setName('help')
        .setDescription('Wat kun je met de bot? (DM’s krijgen ook de handout-link)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('today')
        .setDescription('Welke dag is het in Eryndor? Maanfase en feestdagen'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fullmoon')
        .setDescription('Wanneer is de volgende exacte volle maan?'),
    );
}

export function buildCalendarSetupSubcommand(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return sub
    .setName('setup')
    .setDescription('Kanaal voor ochtend-events en avond-volle-maan posts')
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Kanaal voor kalenderberichten')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    );
}

export function buildCalendarClearSubcommand(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return sub
    .setName('clear')
    .setDescription('Automatische kalenderposts uitzetten');
}

export async function handleEryndorCommand(
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
      content: weather.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'help':
      await handleHelp(interaction, weather, config);
      return;
    case 'today':
      await handleToday(interaction, calendar);
      return;
    case 'fullmoon':
      await handleFullMoon(interaction, calendar);
      return;
    default:
      await interaction.reply({
        content: weather.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

export async function dispatchEryndorAdmin(
  interaction: ChatInputCommandInteraction,
  deps: {
    calendar: EryndorCalendarService;
    weather: WeatherService;
    config: AppConfig;
  },
  sub: 'setup' | 'clear' | string,
): Promise<void> {
  const { calendar, weather, config } = deps;

  if (!interaction.guildId) {
    await interaction.reply({
      content: weather.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: calendar.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'setup':
      await handleSetup(interaction, weather, calendar);
      return;
    case 'clear':
      await handleClear(interaction, weather, calendar);
      return;
    default:
      await interaction.reply({
        content: weather.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleHelp(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
  config: AppConfig,
): Promise<void> {
  const isDm = config.allowedUserIds.includes(interaction.user.id);
  const embed = new EmbedBuilder().setTitle(weather.messages.helpEmbedTitle);

  if (isDm) {
    const url = config.handoutUrl;
    embed
      .setURL(url)
      .setDescription(formatTemplate(weather.messages.helpEmbedDescription, { url }))
      .addFields(
        {
          name: weather.messages.helpFieldEveryone,
          value: weather.messages.helpEveryoneBody,
        },
        {
          name: weather.messages.helpFieldDm,
          value: weather.messages.helpDmBody,
        },
      );
  } else {
    const url = config.playerHandoutUrl;
    embed
      .setURL(url)
      .setDescription(
        formatTemplate(weather.messages.helpEmbedDescriptionPlayer, { url }),
      )
      .addFields({
        name: weather.messages.helpFieldPlayer,
        value: weather.messages.helpEveryoneBody,
      });
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
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
