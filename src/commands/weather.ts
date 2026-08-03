import {
  ChannelType,
  SlashCommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { SchedulerService } from '../services/SchedulerService.js';
import { buildWeatherCard } from '../services/SchedulerService.js';
import type { WeatherService } from '../services/WeatherService.js';
import { parseMagicalMode } from '../content/loader.js';
import { formatMagicalModeNl, formatMinutesRangeNl, formatTemplate, parseDuration } from '../utils/helpers.js';
import {
  buildStatusEmbed,
  formatCooldownSettingLines,
  formatScheduleSettingLines,
  scheduleDisplayFromSettings,
} from './weatherStatusEmbed.js';

export function buildWeatherCommand() {
  return new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Bekijk het huidige weer in Eryndor')
    .addSubcommand((sub) =>
      sub
        .setName('current')
        .setDescription('Wat voor weer hangt er nu boven de wereld? (alleen voor jou)'),
    );
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

export function buildWeatherSeveritySubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Tijdelijk alleen weer van bepaalde zwaarte (mild ↔ heftig)')
        .addIntegerOption((opt) =>
          opt
            .setName('min')
            .setDescription('Lichtste weer dat mag (1 = mild)')
            .setRequired(true)
            .setMinValue(1),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('max')
            .setDescription('Zwaarste weer dat mag (hoger = heftiger)')
            .setRequired(true)
            .setMinValue(1),
        )
        .addStringOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Hoe lang geldt dit? (bijv. 2h, 1d)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Zwaarte-limiet opheffen (weer alles mogelijk)'),
    );
}

export function buildWeatherMagicalSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Tijdelijk alleen magisch weer, of juist géén')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Alleen magisch, of alleen gewoon weer')
            .setRequired(true)
            .addChoices(
              { name: 'Alleen magisch weer', value: 'only' },
              { name: 'Geen magisch weer', value: 'none' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Hoe lang geldt dit? (bijv. 2h, 1d)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Magie-filter opheffen (weer alles mogelijk)'),
    );
}

export function buildWeatherSettingsSubcommands(
  group: SlashCommandSubcommandGroupBuilder,
): SlashCommandSubcommandGroupBuilder {
  return group
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Toon ritme, berichtenvenster en afkoeling voor deze server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('interval')
        .setDescription('Hoe vaak wisselt het weer vanzelf? (bereik in minuten)')
        .addIntegerOption((opt) =>
          opt
            .setName('min')
            .setDescription('Kortste wachttijd tussen weerwissels (minuten)')
            .setRequired(true)
            .setMinValue(1),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('max')
            .setDescription('Langste wachttijd tussen weerwissels (minuten)')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('window')
        .setDescription('Tussen welke uren mag de bot automatisch weer posten?')
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Alleen binnen dit venster automatisch posten?')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('start')
            .setDescription('Venster start (HH:mm, bijv. 06:00)')
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('end')
            .setDescription('Venster einde (HH:mm, bijv. 23:00)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cooldown')
        .setDescription('Na zwaar weer: hoe mild moet de volgende worp zijn?')
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Afkoeling na zwaar weer aan of uit?')
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('after')
            .setDescription('Vanaf welke zwaarte telt weer als “zwaar”?')
            .setRequired(false)
            .setMinValue(1),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('max_next')
            .setDescription('Max. zwaarte van de volgende worp na afkoeling')
            .setRequired(false)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Zet ritme, venster en/of afkoeling terug naar standaard')
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Wat terugzetten?')
            .setRequired(true)
            .addChoices(
              { name: 'Ritme + berichtenvenster', value: 'schedule' },
              { name: 'Afkoeling', value: 'cooldown' },
              { name: 'Alles', value: 'all' },
            ),
        ),
    );
}

export async function handleWeatherCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    weather: WeatherService;
  },
): Promise<void> {
  const { weather } = deps;

  if (!interaction.guildId) {
    await interaction.reply({
      content: weather.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  await handleCurrent(interaction, weather);
}

export async function dispatchWeatherAdmin(
  interaction: ChatInputCommandInteraction,
  deps: {
    weather: WeatherService;
    scheduler: SchedulerService;
    config: AppConfig;
  },
  route: { group: 'severity' | 'magical' | 'settings' | null; sub: string },
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

  if (group === 'severity') {
    if (sub === 'set') {
      await handleSeveritySet(interaction, weather);
      return;
    }
    if (sub === 'clear') {
      await handleSeverityClear(interaction, weather);
      return;
    }
    await interaction.reply({ content: weather.messages.unknownSubcommand, ephemeral: true });
    return;
  }

  if (group === 'magical') {
    if (sub === 'set') {
      await handleMagicalSet(interaction, weather);
      return;
    }
    if (sub === 'clear') {
      await handleMagicalClear(interaction, weather);
      return;
    }
    await interaction.reply({ content: weather.messages.unknownSubcommand, ephemeral: true });
    return;
  }

  if (group === 'settings') {
    if (sub === 'show') {
      await handleSettingsShow(interaction, weather);
      return;
    }
    if (sub === 'interval') {
      await handleSettingsInterval(interaction, weather);
      return;
    }
    if (sub === 'window') {
      await handleSettingsWindow(interaction, weather);
      return;
    }
    if (sub === 'cooldown') {
      await handleSettingsCooldown(interaction, weather);
      return;
    }
    if (sub === 'clear') {
      await handleSettingsClear(interaction, weather);
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

async function handleCurrent(
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

async function handleSeveritySet(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const min = interaction.options.getInteger('min', true);
  const max = interaction.options.getInteger('max', true);
  const durationRaw = interaction.options.getString('duration', true);
  const ms = parseDuration(durationRaw);
  if (ms === null) {
    await interaction.reply({
      content: weather.messages.invalidDuration,
      ephemeral: true,
    });
    return;
  }

  try {
    const until = weather.setSeverityDial(interaction.guildId!, min, max, ms);
    await interaction.reply({
      content: formatTemplate(weather.messages.severitySetSuccess, {
        min,
        max,
        unix: Math.floor(until.getTime() / 1000),
      }),
      ephemeral: true,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'INVALID_SEVERITY_RANGE') {
      await interaction.reply({
        content: weather.messages.invalidSeverityRange,
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'SEVERITY_RANGE_EMPTY') {
      await interaction.reply({
        content: formatTemplate(weather.messages.severityRangeEmpty, { min, max }),
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'DIAL_FILTER_EMPTY') {
      await interaction.reply({
        content: weather.messages.dialFilterEmpty,
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'INVALID_DURATION') {
      await interaction.reply({
        content: weather.messages.invalidDuration,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}

async function handleSeverityClear(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const hadActive = weather.clearSeverityDial(interaction.guildId!);
  await interaction.reply({
    content: hadActive
      ? weather.messages.severityClearSuccess
      : weather.messages.severityClearNone,
    ephemeral: true,
  });
}

async function handleMagicalSet(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const modeRaw = interaction.options.getString('mode', true);
  const mode = parseMagicalMode(modeRaw);
  if (!mode) {
    await interaction.reply({
      content: weather.messages.invalidMagicalMode,
      ephemeral: true,
    });
    return;
  }

  const durationRaw = interaction.options.getString('duration', true);
  const ms = parseDuration(durationRaw);
  if (ms === null) {
    await interaction.reply({
      content: weather.messages.invalidDuration,
      ephemeral: true,
    });
    return;
  }

  try {
    const until = weather.setMagicalDial(interaction.guildId!, mode, ms);
    await interaction.reply({
      content: formatTemplate(weather.messages.magicalSetSuccess, {
        mode: formatMagicalModeNl(mode),
        unix: Math.floor(until.getTime() / 1000),
      }),
      ephemeral: true,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'INVALID_MAGICAL_MODE') {
      await interaction.reply({
        content: weather.messages.invalidMagicalMode,
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'MAGICAL_POOL_EMPTY') {
      await interaction.reply({
        content: formatTemplate(weather.messages.magicalPoolEmpty, { mode }),
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'DIAL_FILTER_EMPTY') {
      await interaction.reply({
        content: weather.messages.dialFilterEmpty,
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'INVALID_DURATION') {
      await interaction.reply({
        content: weather.messages.invalidDuration,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}

async function handleMagicalClear(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const hadActive = weather.clearMagicalDial(interaction.guildId!);
  await interaction.reply({
    content: hadActive
      ? weather.messages.magicalClearSuccess
      : weather.messages.magicalClearNone,
    ephemeral: true,
  });
}

async function handleSettingsShow(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const settings = weather.getScheduleSettings(interaction.guildId!);
  const cooldown = weather.getCooldownSettings(interaction.guildId!);
  const lines = [
    ...formatScheduleSettingLines(weather.messages, scheduleDisplayFromSettings(settings)),
    ...formatCooldownSettingLines(weather.messages, cooldown),
  ];

  await interaction.reply({
    content: `**${weather.messages.settingsShowTitle}**\n${lines.join('\n')}`,
    ephemeral: true,
  });
}

async function handleSettingsInterval(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const min = interaction.options.getInteger('min', true);
  const max = interaction.options.getInteger('max', true);

  try {
    const next = weather.setUpdateInterval(interaction.guildId!, min, max);
    await interaction.reply({
      content: formatTemplate(weather.messages.settingsIntervalSuccess, {
        range: formatMinutesRangeNl(min, max),
        unix: Math.floor(next.getTime() / 1000),
      }),
      ephemeral: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_UPDATE_INTERVAL') {
      await interaction.reply({
        content: weather.messages.invalidUpdateInterval,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}

async function handleSettingsWindow(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const enabled = interaction.options.getBoolean('enabled', true);
  const start = interaction.options.getString('start');
  const end = interaction.options.getString('end');

  try {
    const next = weather.setActiveWindow(interaction.guildId!, enabled, start, end);
    if (enabled) {
      const settings = weather.getScheduleSettings(interaction.guildId!);
      await interaction.reply({
        content: formatTemplate(weather.messages.settingsWindowSuccess, {
          start: settings.windowStart ?? '?',
          end: settings.windowEnd ?? '?',
          unix: Math.floor(next.getTime() / 1000),
        }),
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: formatTemplate(weather.messages.settingsWindowDisabledSuccess, {
          unix: Math.floor(next.getTime() / 1000),
        }),
        ephemeral: true,
      });
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'INVALID_ACTIVE_WINDOW') {
      await interaction.reply({
        content: weather.messages.invalidActiveWindow,
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'INVALID_TIME_OF_DAY') {
      await interaction.reply({
        content: weather.messages.invalidTimeOfDay,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}

async function handleSettingsCooldown(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const enabledOpt = interaction.options.getBoolean('enabled');
  const afterOpt = interaction.options.getInteger('after');
  const maxNextOpt = interaction.options.getInteger('max_next');

  const patch: {
    enabled?: boolean;
    afterSeverity?: number;
    maxNextSeverity?: number;
  } = {};
  if (enabledOpt !== null) patch.enabled = enabledOpt;
  if (afterOpt !== null) patch.afterSeverity = afterOpt;
  if (maxNextOpt !== null) patch.maxNextSeverity = maxNextOpt;

  try {
    const { settings, warnings } = weather.setCooldownSettings(interaction.guildId!, patch);
    const lines: string[] = [];
    if (!settings.enabled) {
      lines.push(weather.messages.settingsCooldownDisabledSuccess);
    } else {
      lines.push(
        formatTemplate(weather.messages.settingsCooldownSuccess, {
          after: settings.afterSeverity,
          max: settings.maxNextSeverity,
        }),
      );
    }
    lines.push(...warnings);

    await interaction.reply({
      content: lines.join('\n'),
      ephemeral: true,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'COOLDOWN_NOTHING_SET') {
      await interaction.reply({
        content: weather.messages.settingsCooldownNothingSet,
        ephemeral: true,
      });
      return;
    }
    if (error.message === 'INVALID_COOLDOWN_THRESHOLD') {
      await interaction.reply({
        content: weather.messages.invalidCooldownThreshold,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}

async function handleSettingsClear(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const scope = interaction.options.getString('scope', true) as 'schedule' | 'cooldown' | 'all';
  const { hadOverride, next } = weather.clearSettingsOverrides(interaction.guildId!, scope);
  const unix = next ? Math.floor(next.getTime() / 1000) : null;

  let content: string;
  if (scope === 'schedule') {
    content = formatTemplate(
      hadOverride ? weather.messages.settingsClearSuccess : weather.messages.settingsClearNone,
      { unix: unix ?? 0 },
    );
  } else if (scope === 'cooldown') {
    content = hadOverride
      ? weather.messages.settingsClearCooldownSuccess
      : weather.messages.settingsClearCooldownNone;
  } else {
    content = formatTemplate(
      hadOverride
        ? weather.messages.settingsClearAllSuccess
        : weather.messages.settingsClearAllNone,
      { unix: unix ?? 0 },
    );
  }

  await interaction.reply({
    content,
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
