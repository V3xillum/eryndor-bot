import { EmbedBuilder } from 'discord.js';
import type { Messages } from '../types.js';
import type {
  GuildCooldownSettings,
  GuildScheduleSettings,
  WeatherAdminStatus,
} from '../services/WeatherService.js';
import { formatTemplate } from '../utils/helpers.js';

export interface ScheduleDisplayInput {
  updateMinMinutes: number;
  updateMaxMinutes: number;
  intervalFromGuild: boolean;
  /** When true, windowStart/End are shown. */
  activeWindowEnabled: boolean;
  windowFromGuild: boolean;
  windowStart: string | null;
  windowEnd: string | null;
}

/** Interval + active window lines shared by `/weather status` and `/weather settings show`. */
export function formatScheduleSettingLines(
  messages: Messages,
  settings: ScheduleDisplayInput,
): string[] {
  const lines = [
    formatTemplate(messages.statusInterval, {
      min: settings.updateMinMinutes,
      max: settings.updateMaxMinutes,
      source: settings.intervalFromGuild ? 'guild' : '.env',
    }),
  ];

  if (settings.activeWindowEnabled && settings.windowStart && settings.windowEnd) {
    lines.push(
      formatTemplate(messages.statusWindowOn, {
        start: settings.windowStart,
        end: settings.windowEnd,
      }),
    );
    lines.push(
      settings.windowFromGuild ? messages.statusWindowOverride : messages.statusWindowDefault,
    );
  } else {
    lines.push(messages.statusWindowOff);
  }

  return lines;
}

export function scheduleDisplayFromSettings(settings: GuildScheduleSettings): ScheduleDisplayInput {
  return {
    updateMinMinutes: settings.updateMinMinutes,
    updateMaxMinutes: settings.updateMaxMinutes,
    intervalFromGuild: settings.intervalFromGuild,
    activeWindowEnabled: settings.activeWindow !== null,
    windowFromGuild: settings.windowFromGuild,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
  };
}

/** Cooldown rule lines (enabled/thresholds only — not “next roll filtered”). */
export function formatCooldownSettingLines(
  messages: Messages,
  cooldown: GuildCooldownSettings,
): string[] {
  if (cooldown.enabled) {
    return [
      formatTemplate(messages.statusCooldownRulesOn, {
        after: cooldown.afterSeverity,
        max: cooldown.maxNextSeverity,
        source: cooldown.fromGuild ? 'guild' : 'content',
      }),
    ];
  }
  return [
    formatTemplate(messages.statusCooldownRulesOff, {
      source: cooldown.fromGuild ? 'guild' : 'content',
    }),
  ];
}

export function buildStatusEmbed(messages: Messages, status: WeatherAdminStatus): EmbedBuilder {
  const title =
    status.type !== null
      ? formatTemplate(messages.statusEmbedTitleWithType, { type: status.type })
      : messages.statusEmbedTitle;

  const currentLines: string[] = [];
  if (status.type !== null && status.severity !== null) {
    currentLines.push(
      formatTemplate(messages.statusSeverity, { severity: status.severity }),
    );
    if (status.magical !== null) {
      currentLines.push(
        formatTemplate(messages.statusMagical, {
          magical: status.magical ? 'ja' : 'nee',
        }),
      );
    }
    currentLines.push(
      formatTemplate(messages.statusForced, {
        forced: status.forced ? 'ja' : 'nee',
      }),
    );
    if (status.rolledAt) {
      currentLines.push(
        formatTemplate(messages.statusRolledAt, {
          unix: Math.floor(status.rolledAt.getTime() / 1000),
        }),
      );
    }
    if (status.usesEnvDuration === true) {
      currentLines.push(
        formatTemplate(
          status.intervalFromGuild ? messages.statusDurationGuild : messages.statusDurationEnv,
          {
            min: status.updateMinMinutes,
            max: status.updateMaxMinutes,
          },
        ),
      );
    } else if (status.usesEnvDuration === false) {
      currentLines.push(
        formatTemplate(messages.statusDurationType, {
          min: status.durationMinMinutes ?? '?',
          max: status.durationMaxMinutes ?? '?',
        }),
      );
    }
  } else {
    currentLines.push(messages.noWeatherYet);
  }

  const scheduleLines = formatScheduleSettingLines(messages, {
    updateMinMinutes: status.updateMinMinutes,
    updateMaxMinutes: status.updateMaxMinutes,
    intervalFromGuild: status.intervalFromGuild,
    activeWindowEnabled: status.activeWindowEnabled,
    windowFromGuild: status.windowFromGuild,
    windowStart: status.activeWindowStart,
    windowEnd: status.activeWindowEnd,
  });

  if (status.pausedUntil) {
    scheduleLines.push(
      formatTemplate(messages.statusPaused, {
        unix: Math.floor(status.pausedUntil.getTime() / 1000),
      }),
    );
  }
  if (status.dueButWaitingForWindow) {
    scheduleLines.push(messages.statusWaitingWindow);
  }
  if (status.nextUpdateAt) {
    scheduleLines.push(
      formatTemplate(messages.statusNext, {
        unix: Math.floor(status.nextUpdateAt.getTime() / 1000),
      }),
    );
  } else if (status.type !== null) {
    scheduleLines.push(messages.statusNextNone);
  }
  if (scheduleLines.length === 0) {
    scheduleLines.push(messages.statusNextNone);
  }

  const rulesLines: string[] = [];
  if (status.dialActive && status.dialUntil && status.dialMin !== null && status.dialMax !== null) {
    rulesLines.push(
      formatTemplate(messages.statusDialOn, {
        min: status.dialMin,
        max: status.dialMax,
        unix: Math.floor(status.dialUntil.getTime() / 1000),
      }),
    );
  } else {
    rulesLines.push(messages.statusDialOff);
  }
  if (
    status.magicalDialActive &&
    status.magicalDialUntil &&
    status.magicalDialMode !== null
  ) {
    rulesLines.push(
      formatTemplate(messages.statusMagicalDialOn, {
        mode: status.magicalDialMode,
        unix: Math.floor(status.magicalDialUntil.getTime() / 1000),
      }),
    );
  } else {
    rulesLines.push(messages.statusMagicalDialOff);
  }

  rulesLines.push(
    ...formatCooldownSettingLines(messages, {
      enabled: status.cooldownEnabled,
      afterSeverity: status.cooldownAfterSeverity,
      maxNextSeverity: status.cooldownMaxNextSeverity,
      fromGuild: status.cooldownFromGuild,
    }),
  );

  if (
    status.cooldownEnabled &&
    status.cooldownActive &&
    status.effectiveMaxNextSeverity !== null
  ) {
    rulesLines.push(
      formatTemplate(messages.statusCooldownOn, {
        maxSeverity: status.effectiveMaxNextSeverity,
        defaultMax: status.cooldownMaxNextSeverity,
      }),
    );
  }

  return new EmbedBuilder()
    .setColor(severityEmbedColor(status.severity))
    .setTitle(title)
    .addFields(
      {
        name: messages.statusFieldCurrent,
        value: currentLines.join('\n'),
      },
      {
        name: messages.statusFieldSchedule,
        value: scheduleLines.join('\n'),
      },
      {
        name: messages.statusFieldRules,
        value: rulesLines.join('\n'),
      },
    );
}

function severityEmbedColor(severity: number | null): number {
  if (severity === null) return 0x607d8b;
  if (severity <= 1) return 0x7cb342;
  if (severity === 2) return 0xc0ca33;
  if (severity === 3) return 0xffb300;
  if (severity === 4) return 0xfb8c00;
  return 0xe53935;
}
