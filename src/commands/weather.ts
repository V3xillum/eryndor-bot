import {
  ChannelType,
  SlashCommandSubcommandGroupBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { SchedulerService } from '../services/SchedulerService.js';
import { buildWeatherCard } from '../services/SchedulerService.js';
import type { WeatherService } from '../services/WeatherService.js';
import { formatTemplate, parseDuration } from '../utils/helpers.js';
import { buildStatusEmbed } from './weatherStatusEmbed.js';
import { startWeatherSettingsHub } from './weatherSettingsWizard.js';

/** Player-facing current weather reply (also used by `/eryndor weer`). */
export async function replyCurrentWeather(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const result = weather.getCurrentWeather(interaction.guildId!);
  if (!result) {
    await interaction.reply({
      content: weather.messages.noWeatherYet,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    ...buildWeatherCard(result),
    ephemeral: true,
  });
}

export function buildWeatherAdminSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Kies in welk kanaal (of thread) het weer verschijnt')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Kanaal voor weerberichten')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('thread')
            .setDescription('Optionele thread voor weerberichten')
            .addChannelTypes(
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
              ChannelType.AnnouncementThread,
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Overzicht: weer, planning, limieten en afkoeling'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('next')
        .setDescription('Wanneer wisselt het weer de volgende keer vanzelf?'),
    )
    .addSubcommand((sub) =>
      sub.setName('roll').setDescription('Gooi nieuw weer (d100) en post het meteen'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Zet het weer zelf (type of jouw d100) en post het')
        .addStringOption((opt) =>
          opt
            .setName('value')
            .setDescription('Weertype (bijv. storm) of d100-worp (1–100)')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Hoe lang dit weer aanhoudt (bijv. 15m, 2h)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('schedule')
        .setDescription('Houd dit weer, plan alleen wanneer het weer wisselt')
        .addStringOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Over hoeveel tijd wisselt het weer? (bijv. 15m, 2h, 1d)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pause')
        .setDescription('Pauzeer automatisch weer (handig tijdens een sessie)')
        .addStringOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Hoe lang pauzeren? (bijv. 30m, 2h, 1d)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('resume').setDescription('Hervat automatisch weer na een pauze'),
    );
}

export function buildWeatherSettingsSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group.addSubcommand((sub) =>
    sub
      .setName('menu')
      .setDescription(
        'Ritme, venster, afkoeling en tijdelijke limieten in één menu',
      ),
  );
}

export async function dispatchWeatherAdmin(
  interaction: ChatInputCommandInteraction,
  deps: {
    weather: WeatherService;
    scheduler: SchedulerService;
    config: AppConfig;
  },
  route: { group: 'settings' | null; sub: string },
): Promise<void> {
  const { weather, scheduler, config } = deps;
  const { group, sub } = route;

  if (!interaction.guildId) {
    await interaction.reply({
      content: weather.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: weather.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  if (group === 'settings') {
    if (sub === 'menu') {
      await startWeatherSettingsHub(interaction, weather);
      return;
    }
    await interaction.reply({ content: weather.messages.unknownSubcommand, ephemeral: true });
    return;
  }

  switch (sub) {
    case 'setup':
      await handleSetup(interaction, weather);
      return;
    case 'status':
      await handleStatus(interaction, weather);
      return;
    case 'next':
      await handleNext(interaction, weather);
      return;
    case 'roll':
      await handleRoll(interaction, weather, scheduler);
      return;
    case 'set':
      await handleSet(interaction, weather, scheduler);
      return;
    case 'schedule':
      await handleSchedule(interaction, weather);
      return;
    case 'pause':
      await handlePause(interaction, weather);
      return;
    case 'resume':
      await handleResume(interaction, weather);
      return;
    default:
      await interaction.reply({ content: weather.messages.unknownSubcommand, ephemeral: true });
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  const thread = interaction.options.getChannel('thread');

  const guildId = interaction.guildId!;
  weather.setup(guildId, channel.id, thread?.id ?? null);

  // Start the auto-update clock if this guild has never been scheduled.
  const state = weather.getWorldState(guildId);
  if (!state?.next_update_at) {
    weather.scheduleNextUpdate(guildId);
  }

  const target = thread ? `<#${thread.id}>` : `<#${channel.id}>`;
  await interaction.reply({
    content: formatTemplate(weather.messages.setupSuccess, { target }),
    ephemeral: true,
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const status = weather.getAdminStatus(interaction.guildId!);
  if (!status) {
    await interaction.reply({
      content: weather.messages.noWeatherYet,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [buildStatusEmbed(weather.messages, status)],
    ephemeral: true,
  });
}

async function handleNext(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const status = weather.getScheduleStatus(interaction.guildId!);
  const lines: string[] = [];

  if (status.pausedUntil) {
    lines.push(
      formatTemplate(weather.messages.nextPaused, {
        unix: Math.floor(status.pausedUntil.getTime() / 1000),
      }),
    );
  }

  if (!status.nextUpdateAt) {
    lines.push(weather.messages.nextNotScheduled);
  } else if (status.dueButWaitingForWindow) {
    lines.push(weather.messages.nextWaitingWindow);
    lines.push(
      formatTemplate(weather.messages.nextScheduled, {
        unix: Math.floor(status.nextUpdateAt.getTime() / 1000),
      }),
    );
  } else {
    lines.push(
      formatTemplate(weather.messages.nextScheduled, {
        unix: Math.floor(status.nextUpdateAt.getTime() / 1000),
      }),
    );
  }

  await interaction.reply({
    content: lines.join('\n'),
    ephemeral: true,
  });
}

async function handleRoll(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
  scheduler: SchedulerService,
): Promise<void> {
  const state = weather.getWorldState(interaction.guildId!);
  if (!state?.channel_id && !state?.thread_id) {
    await interaction.reply({
      content: weather.messages.notConfigured,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const result = weather.rollWeather(interaction.guildId!);
    const posted = await scheduler.postWeather(interaction.guildId!, result);

    if (!posted) {
      await interaction.editReply({ content: weather.messages.notConfigured });
      return;
    }

    await interaction.editReply({
      content: formatTemplate(weather.messages.rollSuccess, {
        roll: result.roll ?? '?',
        type: result.type,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPTY_DIAL_POOL') {
      await interaction.editReply({ content: weather.messages.dialFilterEmpty });
      return;
    }
    throw error;
  }
}

async function handleSet(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
  scheduler: SchedulerService,
): Promise<void> {
  const value = interaction.options.getString('value', true);
  const durationRaw = interaction.options.getString('duration');
  let durationMs: number | undefined;

  if (durationRaw !== null) {
    const parsed = parseDuration(durationRaw);
    if (parsed === null) {
      await interaction.reply({
        content: weather.messages.invalidDuration,
        ephemeral: true,
      });
      return;
    }
    durationMs = parsed;
  }

  const state = weather.getWorldState(interaction.guildId!);
  if (!state?.channel_id && !state?.thread_id) {
    await interaction.reply({
      content: weather.messages.notConfigured,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = weather.setFromInput(interaction.guildId!, value, durationMs);
    const posted = await scheduler.postWeather(interaction.guildId!, result);
    if (!posted) {
      await interaction.editReply({ content: weather.messages.notConfigured });
      return;
    }

    const scheduled = weather.getWorldState(interaction.guildId!)?.next_update_at;
    const nextUnix = scheduled
      ? Math.floor(new Date(scheduled).getTime() / 1000)
      : undefined;

    if (result.roll !== undefined) {
      const template =
        durationMs !== undefined
          ? weather.messages.setRollSuccessWithDuration
          : weather.messages.setRollSuccess;
      await interaction.editReply({
        content: formatTemplate(template, {
          roll: result.roll,
          type: result.type,
          unix: nextUnix ?? 0,
        }),
      });
    } else if (durationMs !== undefined && nextUnix !== undefined) {
      await interaction.editReply({
        content: formatTemplate(weather.messages.setSuccessWithDuration, {
          type: result.type,
          unix: nextUnix,
        }),
      });
    } else {
      await interaction.editReply({
        content: formatTemplate(weather.messages.setSuccess, { type: result.type }),
      });
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;

    if (error.message.startsWith('UNKNOWN_TYPE:')) {
      await interaction.editReply({
        content: formatTemplate(weather.messages.unknownType, {
          type: value,
          types: weather.getAvailableTypes().join(', '),
        }),
      });
      return;
    }
    if (error.message.startsWith('INVALID_ROLL:') || error.message.startsWith('NO_TABLE_ENTRY:')) {
      await interaction.editReply({
        content: formatTemplate(weather.messages.invalidRoll, { value }),
      });
      return;
    }
    throw error;
  }
}

async function handleSchedule(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const durationRaw = interaction.options.getString('duration', true);
  const ms = parseDuration(durationRaw);
  if (ms === null) {
    await interaction.reply({
      content: weather.messages.invalidDuration,
      ephemeral: true,
    });
    return;
  }

  const state = weather.getWorldState(interaction.guildId!);
  if (!state?.current_weather_type) {
    await interaction.reply({
      content: weather.messages.noWeatherYet,
      ephemeral: true,
    });
    return;
  }

  const next = weather.scheduleIn(interaction.guildId!, ms);
  await interaction.reply({
    content: formatTemplate(weather.messages.scheduleSuccess, {
      type: state.current_weather_type,
      unix: Math.floor(next.getTime() / 1000),
    }),
    ephemeral: true,
  });
}

async function handlePause(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const durationRaw = interaction.options.getString('duration', true);
  const ms = parseDuration(durationRaw);
  if (ms === null) {
    await interaction.reply({
      content: weather.messages.invalidDuration,
      ephemeral: true,
    });
    return;
  }

  const until = new Date(Date.now() + ms);
  weather.pause(interaction.guildId!, until);

  await interaction.reply({
    content: formatTemplate(weather.messages.pauseSuccess, {
      unix: Math.floor(until.getTime() / 1000),
    }),
    ephemeral: true,
  });
}

async function handleResume(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const next = weather.resume(interaction.guildId!);
  await interaction.reply({
    content: formatTemplate(weather.messages.resumeSuccess, {
      unix: Math.floor(next.getTime() / 1000),
    }),
    ephemeral: true,
  });
}
