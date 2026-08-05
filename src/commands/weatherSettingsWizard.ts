import {
  ActionRowBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import { parseMagicalMode } from '../content/loader.js';
import type { WeatherService } from '../services/WeatherService.js';
import { addModalIntro } from '../utils/modalIntro.js';
import {
  formatMagicalModeNl,
  formatMinutesRangeNl,
  formatTemplate,
  parseDuration,
} from '../utils/helpers.js';
import {
  formatCooldownSettingLines,
  formatScheduleSettingLines,
  scheduleDisplayFromSettings,
} from './weatherStatusEmbed.js';

export const WEATHER_SETTINGS_WIZARD_PREFIX = 'wset:';

type HubAction =
  | 'interval'
  | 'window'
  | 'cooldown'
  | 'severity'
  | 'magical'
  | 'clear';

function parseParts(customId: string): string[] | null {
  if (!customId.startsWith(WEATHER_SETTINGS_WIZARD_PREFIX)) return null;
  return customId.slice(WEATHER_SETTINGS_WIZARD_PREFIX.length).split(':');
}

function assertOwner(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
  userId: string,
): boolean {
  return userId === interaction.user.id;
}

/** `/dm weather-settings menu` — overzicht + kies wat je wilt aanpassen. */
export async function startWeatherSettingsHub(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
): Promise<void> {
  const guildId = interaction.guildId!;
  const settings = weather.getScheduleSettings(guildId);
  const cooldown = weather.getCooldownSettings(guildId);
  const lines = [
    ...formatScheduleSettingLines(weather.messages, scheduleDisplayFromSettings(settings)),
    ...formatCooldownSettingLines(weather.messages, cooldown),
  ];

  const status = weather.getAdminStatus(guildId);
  if (status?.dialActive && status.dialUntil && status.dialMin != null && status.dialMax != null) {
    lines.push(
      formatTemplate(weather.messages.weatherSettingsHubDialSeverity, {
        min: String(status.dialMin),
        max: String(status.dialMax),
        unix: Math.floor(status.dialUntil.getTime() / 1000),
      }),
    );
  } else {
    lines.push(weather.messages.weatherSettingsHubDialSeverityNone);
  }
  if (
    status?.magicalDialActive &&
    status.magicalDialUntil &&
    status.magicalDialMode
  ) {
    lines.push(
      formatTemplate(weather.messages.weatherSettingsHubDialMagical, {
        mode: formatMagicalModeNl(status.magicalDialMode),
        unix: Math.floor(status.magicalDialUntil.getTime() / 1000),
      }),
    );
  } else {
    lines.push(weather.messages.weatherSettingsHubDialMagicalNone);
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `${WEATHER_SETTINGS_WIZARD_PREFIX}pick:${interaction.user.id}`,
      )
      .setPlaceholder(
        weather.messages.weatherSettingsHubPlaceholder.slice(0, 150),
      )
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubOptInterval)
          .setValue('interval')
          .setDescription(
            weather.messages.weatherSettingsHubOptIntervalDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubOptWindow)
          .setValue('window')
          .setDescription(
            weather.messages.weatherSettingsHubOptWindowDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubOptCooldown)
          .setValue('cooldown')
          .setDescription(
            weather.messages.weatherSettingsHubOptCooldownDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubOptSeverity)
          .setValue('severity')
          .setDescription(
            weather.messages.weatherSettingsHubOptSeverityDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubOptMagical)
          .setValue('magical')
          .setDescription(
            weather.messages.weatherSettingsHubOptMagicalDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubOptClear)
          .setValue('clear')
          .setDescription(
            weather.messages.weatherSettingsHubOptClearDesc.slice(0, 100),
          ),
      ),
  );

  await interaction.reply({
    content: `**${weather.messages.settingsShowTitle}**\n${lines.join('\n')}\n\n${weather.messages.weatherSettingsHubPrompt}`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleWeatherSettingsWizardSelect(
  interaction: StringSelectMenuInteraction,
  deps: { weather: WeatherService; config: AppConfig },
): Promise<void> {
  const { weather, config } = deps;
  const parts = parseParts(interaction.customId);
  if (!parts) return;

  const [step, userId] = parts;
  if (!assertOwner(interaction, userId!)) {
    await interaction.reply({
      content: weather.messages.weatherSettingsHubNotYours,
      ephemeral: true,
    });
    return;
  }
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

  if (step === 'clear') {
    const scope = interaction.values[0] as 'schedule' | 'cooldown' | 'all';
    if (scope !== 'schedule' && scope !== 'cooldown' && scope !== 'all') {
      await interaction.update({
        content: weather.messages.unknownSubcommand,
        components: [],
      });
      return;
    }
    const content = applySettingsClear(weather, interaction.guildId, scope);
    await interaction.update({ content, components: [] });
    return;
  }

  if (step === 'severity') {
    const choice = interaction.values[0];
    if (choice === 'clear') {
      const hadActive = weather.clearSeverityDial(interaction.guildId);
      await interaction.update({
        content: hadActive
          ? weather.messages.severityClearSuccess
          : weather.messages.severityClearNone,
        components: [],
      });
      return;
    }
    if (choice === 'set') {
      await interaction.showModal(buildSeverityModal(weather, interaction.user.id));
      return;
    }
    await interaction.update({
      content: weather.messages.unknownSubcommand,
      components: [],
    });
    return;
  }

  if (step === 'magical') {
    const choice = interaction.values[0];
    if (choice === 'clear') {
      const hadActive = weather.clearMagicalDial(interaction.guildId);
      await interaction.update({
        content: hadActive
          ? weather.messages.magicalClearSuccess
          : weather.messages.magicalClearNone,
        components: [],
      });
      return;
    }
    if (choice === 'set') {
      await interaction.showModal(buildMagicalModal(weather, interaction.user.id));
      return;
    }
    await interaction.update({
      content: weather.messages.unknownSubcommand,
      components: [],
    });
    return;
  }

  if (step !== 'pick') {
    await interaction.update({
      content: weather.messages.unknownSubcommand,
      components: [],
    });
    return;
  }

  const action = interaction.values[0] as HubAction;

  if (action === 'severity') {
    await interaction.update({
      content: weather.messages.weatherSettingsHubDialActionPromptSeverity,
      components: [dialActionRow(weather, 'severity', interaction.user.id)],
    });
    return;
  }

  if (action === 'magical') {
    await interaction.update({
      content: weather.messages.weatherSettingsHubDialActionPromptMagical,
      components: [dialActionRow(weather, 'magical', interaction.user.id)],
    });
    return;
  }

  if (action === 'clear') {
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `${WEATHER_SETTINGS_WIZARD_PREFIX}clear:${interaction.user.id}`,
        )
        .setPlaceholder(
          weather.messages.weatherSettingsHubClearPlaceholder.slice(0, 150),
        )
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(weather.messages.weatherSettingsHubClearSchedule)
            .setValue('schedule'),
          new StringSelectMenuOptionBuilder()
            .setLabel(weather.messages.weatherSettingsHubClearCooldown)
            .setValue('cooldown'),
          new StringSelectMenuOptionBuilder()
            .setLabel(weather.messages.weatherSettingsHubClearAll)
            .setValue('all'),
        ),
    );
    await interaction.update({
      content: weather.messages.weatherSettingsHubClearPrompt,
      components: [row],
    });
    return;
  }

  if (action === 'interval') {
    await interaction.showModal(
      buildIntervalModal(weather, interaction.user.id, interaction.guildId),
    );
    return;
  }
  if (action === 'window') {
    await interaction.showModal(
      buildWindowModal(weather, interaction.user.id, interaction.guildId),
    );
    return;
  }
  if (action === 'cooldown') {
    await interaction.showModal(
      buildCooldownModal(weather, interaction.user.id, interaction.guildId),
    );
    return;
  }

  await interaction.update({
    content: weather.messages.unknownSubcommand,
    components: [],
  });
}

function dialActionRow(
  weather: WeatherService,
  kind: 'severity' | 'magical',
  userId: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${WEATHER_SETTINGS_WIZARD_PREFIX}${kind}:${userId}`)
      .setPlaceholder(
        weather.messages.weatherSettingsHubDialActionPlaceholder.slice(0, 150),
      )
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubDialActionSet)
          .setValue('set')
          .setDescription(
            weather.messages.weatherSettingsHubDialActionSetDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.weatherSettingsHubDialActionClear)
          .setValue('clear')
          .setDescription(
            weather.messages.weatherSettingsHubDialActionClearDesc.slice(0, 100),
          ),
      ),
  );
}

export async function handleWeatherSettingsWizardModal(
  interaction: ModalSubmitInteraction,
  deps: { weather: WeatherService; config: AppConfig },
): Promise<void> {
  const { weather, config } = deps;
  const parts = parseParts(interaction.customId);
  if (!parts) return;

  const [step, action, userId] = parts;
  if (step !== 'form' || !action || !userId) return;

  if (!assertOwner(interaction, userId)) {
    await interaction.reply({
      content: weather.messages.weatherSettingsHubNotYours,
      ephemeral: true,
    });
    return;
  }
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

  let content: string;
  if (action === 'interval') {
    content = applyInterval(weather, interaction);
  } else if (action === 'window') {
    content = applyWindow(weather, interaction);
  } else if (action === 'cooldown') {
    content = applyCooldown(weather, interaction);
  } else if (action === 'severity') {
    content = applySeverity(weather, interaction);
  } else if (action === 'magical') {
    content = applyMagical(weather, interaction);
  } else {
    content = weather.messages.unknownSubcommand;
  }

  await interaction.reply({ content, ephemeral: true });
}

function buildIntervalModal(
  weather: WeatherService,
  userId: string,
  guildId: string,
): ModalBuilder {
  const settings = weather.getScheduleSettings(guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${WEATHER_SETTINGS_WIZARD_PREFIX}form:interval:${userId}`)
    .setTitle(weather.messages.weatherSettingsHubModalIntervalTitle.slice(0, 45));
  addModalIntro(modal, weather.messages.weatherSettingsHubModalIntervalIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldMinMinutes.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('min')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder(String(settings.updateMinMinutes)),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldMaxMinutes.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('max')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder(String(settings.updateMaxMinutes)),
      ),
  );
  return modal;
}

function buildWindowModal(
  weather: WeatherService,
  userId: string,
  guildId: string,
): ModalBuilder {
  const settings = weather.getScheduleSettings(guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${WEATHER_SETTINGS_WIZARD_PREFIX}form:window:${userId}`)
    .setTitle(weather.messages.weatherSettingsHubModalWindowTitle.slice(0, 45));
  addModalIntro(modal, weather.messages.weatherSettingsHubModalWindowIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldEnabled.slice(0, 45))
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('enabled')
          .setRequired(true)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(weather.messages.weatherSettingsHubEnabledOn)
              .setValue('true')
              .setDefault(settings.activeWindow !== null),
            new StringSelectMenuOptionBuilder()
              .setLabel(weather.messages.weatherSettingsHubEnabledOff)
              .setValue('false')
              .setDefault(settings.activeWindow === null),
          ),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldWindowStart.slice(0, 45))
      .setDescription(
        weather.messages.weatherSettingsHubFieldWindowTimeHint.slice(0, 100),
      )
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('start')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5)
          .setPlaceholder(settings.windowStart ?? '06:00'),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldWindowEnd.slice(0, 45))
      .setDescription(
        weather.messages.weatherSettingsHubFieldWindowTimeHint.slice(0, 100),
      )
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('end')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5)
          .setPlaceholder(settings.windowEnd ?? '23:00'),
      ),
  );
  return modal;
}

function buildCooldownModal(
  weather: WeatherService,
  userId: string,
  guildId: string,
): ModalBuilder {
  const cooldown = weather.getCooldownSettings(guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${WEATHER_SETTINGS_WIZARD_PREFIX}form:cooldown:${userId}`)
    .setTitle(weather.messages.weatherSettingsHubModalCooldownTitle.slice(0, 45));
  addModalIntro(modal, weather.messages.weatherSettingsHubModalCooldownIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldEnabled.slice(0, 45))
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('enabled')
          .setRequired(true)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(weather.messages.weatherSettingsHubEnabledOn)
              .setValue('true')
              .setDefault(cooldown.enabled),
            new StringSelectMenuOptionBuilder()
              .setLabel(weather.messages.weatherSettingsHubEnabledOff)
              .setValue('false')
              .setDefault(!cooldown.enabled),
          ),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldAfter.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('after')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(2)
          .setPlaceholder(String(cooldown.afterSeverity)),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldMaxNext.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('max_next')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(2)
          .setPlaceholder(String(cooldown.maxNextSeverity)),
      ),
  );
  return modal;
}

function buildSeverityModal(weather: WeatherService, userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${WEATHER_SETTINGS_WIZARD_PREFIX}form:severity:${userId}`)
    .setTitle(weather.messages.weatherSettingsHubModalSeverityTitle.slice(0, 45));
  addModalIntro(modal, weather.messages.weatherSettingsHubModalSeverityIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldSeverityMin.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('min')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setPlaceholder('1'),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldSeverityMax.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('max')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setPlaceholder('3'),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldDuration.slice(0, 45))
      .setDescription(
        weather.messages.weatherSettingsHubFieldDurationHint.slice(0, 100),
      )
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('duration')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setPlaceholder('2h'),
      ),
  );
  return modal;
}

function buildMagicalModal(weather: WeatherService, userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${WEATHER_SETTINGS_WIZARD_PREFIX}form:magical:${userId}`)
    .setTitle(weather.messages.weatherSettingsHubModalMagicalTitle.slice(0, 45));
  addModalIntro(modal, weather.messages.weatherSettingsHubModalMagicalIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldMagicalMode.slice(0, 45))
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('mode')
          .setRequired(true)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(weather.messages.weatherSettingsHubMagicalOnly)
              .setValue('only'),
            new StringSelectMenuOptionBuilder()
              .setLabel(weather.messages.weatherSettingsHubMagicalNone)
              .setValue('none'),
          ),
      ),
    new LabelBuilder()
      .setLabel(weather.messages.weatherSettingsHubFieldDuration.slice(0, 45))
      .setDescription(
        weather.messages.weatherSettingsHubFieldDurationHint.slice(0, 100),
      )
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('duration')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setPlaceholder('2h'),
      ),
  );
  return modal;
}

function applyInterval(
  weather: WeatherService,
  interaction: ModalSubmitInteraction,
): string {
  const min = Number(interaction.fields.getTextInputValue('min').trim());
  const max = Number(interaction.fields.getTextInputValue('max').trim());
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return weather.messages.invalidUpdateInterval;
  }
  try {
    const next = weather.setUpdateInterval(interaction.guildId!, min, max);
    return formatTemplate(weather.messages.settingsIntervalSuccess, {
      range: formatMinutesRangeNl(min, max),
      unix: Math.floor(next.getTime() / 1000),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_UPDATE_INTERVAL') {
      return weather.messages.invalidUpdateInterval;
    }
    throw error;
  }
}

function applyWindow(
  weather: WeatherService,
  interaction: ModalSubmitInteraction,
): string {
  const enabledRaw = interaction.fields.getStringSelectValues('enabled')[0];
  const enabled = enabledRaw === 'true';
  const start = interaction.fields.getTextInputValue('start').trim() || null;
  const end = interaction.fields.getTextInputValue('end').trim() || null;

  try {
    const next = weather.setActiveWindow(
      interaction.guildId!,
      enabled,
      start,
      end,
    );
    if (enabled) {
      const settings = weather.getScheduleSettings(interaction.guildId!);
      return formatTemplate(weather.messages.settingsWindowSuccess, {
        start: settings.windowStart ?? '?',
        end: settings.windowEnd ?? '?',
        unix: Math.floor(next.getTime() / 1000),
      });
    }
    return formatTemplate(weather.messages.settingsWindowDisabledSuccess, {
      unix: Math.floor(next.getTime() / 1000),
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'INVALID_ACTIVE_WINDOW') {
      return weather.messages.invalidActiveWindow;
    }
    if (error.message === 'INVALID_TIME_OF_DAY') {
      return weather.messages.invalidTimeOfDay;
    }
    throw error;
  }
}

function applyCooldown(
  weather: WeatherService,
  interaction: ModalSubmitInteraction,
): string {
  const enabledRaw = interaction.fields.getStringSelectValues('enabled')[0];
  const afterRaw = interaction.fields.getTextInputValue('after').trim();
  const maxRaw = interaction.fields.getTextInputValue('max_next').trim();

  const patch: {
    enabled?: boolean;
    afterSeverity?: number;
    maxNextSeverity?: number;
  } = { enabled: enabledRaw === 'true' };

  if (afterRaw !== '') {
    const after = Number(afterRaw);
    if (!Number.isInteger(after)) return weather.messages.invalidCooldownThreshold;
    patch.afterSeverity = after;
  }
  if (maxRaw !== '') {
    const maxNext = Number(maxRaw);
    if (!Number.isInteger(maxNext)) return weather.messages.invalidCooldownThreshold;
    patch.maxNextSeverity = maxNext;
  }

  try {
    const { settings, warnings } = weather.setCooldownSettings(
      interaction.guildId!,
      patch,
    );
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
    return lines.join('\n');
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'COOLDOWN_NOTHING_SET') {
      return weather.messages.settingsCooldownNothingSet;
    }
    if (error.message === 'INVALID_COOLDOWN_THRESHOLD') {
      return weather.messages.invalidCooldownThreshold;
    }
    throw error;
  }
}

function applySeverity(
  weather: WeatherService,
  interaction: ModalSubmitInteraction,
): string {
  const min = Number(interaction.fields.getTextInputValue('min').trim());
  const max = Number(interaction.fields.getTextInputValue('max').trim());
  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const ms = parseDuration(durationRaw);
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return weather.messages.invalidSeverityRange;
  }
  if (ms === null) return weather.messages.invalidDuration;

  try {
    const until = weather.setSeverityDial(interaction.guildId!, min, max, ms);
    return formatTemplate(weather.messages.severitySetSuccess, {
      min,
      max,
      unix: Math.floor(until.getTime() / 1000),
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'INVALID_SEVERITY_RANGE') {
      return weather.messages.invalidSeverityRange;
    }
    if (error.message === 'SEVERITY_RANGE_EMPTY') {
      return formatTemplate(weather.messages.severityRangeEmpty, { min, max });
    }
    if (error.message === 'DIAL_FILTER_EMPTY') {
      return weather.messages.dialFilterEmpty;
    }
    if (error.message === 'INVALID_DURATION') {
      return weather.messages.invalidDuration;
    }
    throw error;
  }
}

function applyMagical(
  weather: WeatherService,
  interaction: ModalSubmitInteraction,
): string {
  const modeRaw = interaction.fields.getStringSelectValues('mode')[0] ?? '';
  const mode = parseMagicalMode(modeRaw);
  if (!mode) return weather.messages.invalidMagicalMode;

  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const ms = parseDuration(durationRaw);
  if (ms === null) return weather.messages.invalidDuration;

  try {
    const until = weather.setMagicalDial(interaction.guildId!, mode, ms);
    return formatTemplate(weather.messages.magicalSetSuccess, {
      mode: formatMagicalModeNl(mode),
      unix: Math.floor(until.getTime() / 1000),
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'INVALID_MAGICAL_MODE') {
      return weather.messages.invalidMagicalMode;
    }
    if (error.message === 'MAGICAL_POOL_EMPTY') {
      return formatTemplate(weather.messages.magicalPoolEmpty, { mode });
    }
    if (error.message === 'DIAL_FILTER_EMPTY') {
      return weather.messages.dialFilterEmpty;
    }
    if (error.message === 'INVALID_DURATION') {
      return weather.messages.invalidDuration;
    }
    throw error;
  }
}

function applySettingsClear(
  weather: WeatherService,
  guildId: string,
  scope: 'schedule' | 'cooldown' | 'all',
): string {
  const { hadOverride, next } = weather.clearSettingsOverrides(guildId, scope);
  const unix = next ? Math.floor(next.getTime() / 1000) : 0;

  if (scope === 'schedule') {
    return formatTemplate(
      hadOverride ? weather.messages.settingsClearSuccess : weather.messages.settingsClearNone,
      { unix },
    );
  }
  if (scope === 'cooldown') {
    return hadOverride
      ? weather.messages.settingsClearCooldownSuccess
      : weather.messages.settingsClearCooldownNone;
  }
  return formatTemplate(
    hadOverride
      ? weather.messages.settingsClearAllSuccess
      : weather.messages.settingsClearAllNone,
    { unix },
  );
}
