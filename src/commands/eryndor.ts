import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import {
  CalendarFetchError,
  type EryndorCalendarService,
} from '../services/EryndorCalendarService.js';
import type { BuildingService } from '../services/BuildingService.js';
import type { ProductionService } from '../services/ProductionService.js';
import type { ResourceService } from '../services/ResourceService.js';
import type { WeatherService } from '../services/WeatherService.js';
import { formatTemplate } from '../utils/helpers.js';
import { buildProductionListEmbed } from './productionWizard.js';
import { buildEconomyOverviewEmbeds } from './resource.js';
import { guildNickname } from './resourceEmbeds.js';
import { replyCurrentWeather } from './weather.js';

export function buildEryndorCommand() {
  return new SlashCommandBuilder()
    .setName('eryndor')
    .setDescription('Wereldinfo, overzicht en hulp voor de bot')
    .addSubcommand((sub) =>
      sub
        .setName('overzicht')
        .setDescription(
          'Alles in één: kalender, voorraad, bouw en productie (alleen voor jou)',
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('weer')
        .setDescription('Wat voor weer hangt er nu boven de wereld? (alleen voor jou)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('hulp')
        .setDescription('Wat kun je met de bot? (DM’s krijgen ook de handout-link)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('vandaag')
        .setDescription('Welke dag is het in Eryndor? Maanfase en feestdagen (alleen voor jou)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('vollemaan')
        .setDescription('Wanneer is de volgende exacte volle maan? (alleen voor jou)'),
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
    resources: ResourceService;
    buildings: BuildingService;
    production: ProductionService;
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
    case 'overzicht':
      await handleOverview(interaction, deps);
      return;
    case 'weer':
      await replyCurrentWeather(interaction, weather);
      return;
    case 'hulp':
      await handleHelp(interaction, weather, config);
      return;
    case 'vandaag':
      await handleToday(interaction, calendar);
      return;
    case 'vollemaan':
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

async function handleOverview(
  interaction: ChatInputCommandInteraction,
  deps: {
    calendar: EryndorCalendarService;
    resources: ResourceService;
    buildings: BuildingService;
    production: ProductionService;
  },
): Promise<void> {
  const { calendar, resources, buildings, production } = deps;
  const guildId = interaction.guildId!;
  await interaction.deferReply({ ephemeral: true });

  const embeds: EmbedBuilder[] = [];
  let calendarNote: string | undefined;

  try {
    const [day, nextMoon] = await Promise.all([
      calendar.getToday(),
      calendar.getNextFullMoon(),
    ]);
    embeds.push(calendar.buildTodayEmbed(day));
    embeds.push(calendar.buildFullMoonEmbed(nextMoon));
  } catch (error) {
    if (error instanceof CalendarFetchError) {
      calendarNote = calendar.messages.calendarLoadError;
    } else {
      throw error;
    }
  }

  const nickname = resolveNicknameSync(interaction);
  embeds.push(
    ...buildEconomyOverviewEmbeds(
      resources,
      buildings,
      guildId,
      interaction.user.id,
      nickname,
    ),
  );

  const productionEmbed = buildProductionListEmbed(production, resources, guildId);
  embeds.push(
    productionEmbed ??
      new EmbedBuilder()
        .setTitle(production.messages.productionListTitle)
        .setDescription(production.messages.productionListEmpty),
  );

  await interaction.editReply({
    content: calendarNote,
    embeds: embeds.slice(0, 10),
  });
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
  await interaction.deferReply({ ephemeral: true });

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
  await interaction.deferReply({ ephemeral: true });

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
