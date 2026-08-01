import { EmbedBuilder, type Client } from 'discord.js';
import type Database from 'better-sqlite3';
import { getBotMeta, setBotMeta } from '../db/index.js';
import type { Messages } from '../types.js';
import {
  formatTimeOfDay,
  timeOfDayToMinutes,
  zonedParts,
  type TimeOfDay,
} from '../utils/activeWindow.js';
import {
  statusReportPeriodKey,
  statusReportWindowStart,
  type StatusReportCadence,
} from '../utils/statusReportPeriod.js';
import { formatTemplate } from '../utils/helpers.js';
import type { ActivityLogService } from './ActivityLogService.js';
import type { WeatherService } from './WeatherService.js';

const META_LAST_PERIOD = 'status_report_last_period';

export class StatusReportService {
  constructor(
    private readonly db: Database.Database,
    private readonly client: Client,
    private readonly weather: WeatherService,
    private readonly activity: ActivityLogService,
    private readonly messages: Messages,
    private readonly userIds: string[],
    private readonly postTime: TimeOfDay,
    private readonly cadence: StatusReportCadence,
    private readonly timeZone: string,
  ) {}

  enabled(): boolean {
    return this.userIds.length > 0;
  }

  /** True when local time is past the configured report time. */
  isAtOrAfterPostTime(now = new Date()): boolean {
    const parts = zonedParts(now, this.timeZone);
    const nowMinutes = parts.hours * 60 + parts.minutes;
    return nowMinutes >= timeOfDayToMinutes(this.postTime);
  }

  lastPeriodHandled(): string | null {
    return getBotMeta(this.db, META_LAST_PERIOD);
  }

  markPeriodHandled(periodKey: string): void {
    setBotMeta(this.db, META_LAST_PERIOD, periodKey);
  }

  periodKey(now = new Date()): string {
    return statusReportPeriodKey(now, this.cadence, this.timeZone);
  }

  windowStart(now = new Date()): Date {
    return statusReportWindowStart(now, this.cadence, this.timeZone);
  }

  async sendReport(now = new Date()): Promise<void> {
    const embed = this.buildEmbed(now);
    for (const userId of this.userIds) {
      try {
        const user = await this.client.users.fetch(userId);
        await user.send({ embeds: [embed] });
      } catch (error) {
        this.activity.error(
          'system',
          `Status report: could not DM user ${userId}`,
          error,
        );
      }
    }
  }

  private buildEmbed(now: Date): EmbedBuilder {
    const summary = this.activity.summarize(this.windowStart(now));
    const cadenceLabel = formatTemplate(this.messages.statusReportCadenceLabel, {
      cadence: this.cadence,
      time: formatTimeOfDay(this.postTime),
    });

    const guildLines: string[] = [];
    for (const state of this.weather.listGuildStates()) {
      const guild = this.client.guilds.cache.get(state.guild_id);
      const name = guild?.name ?? state.guild_id;
      const paused = this.weather.isGuildPaused(state.guild_id, now);
      guildLines.push(
        formatTemplate(
          paused
            ? this.messages.statusReportGuildPaused
            : this.messages.statusReportGuildActive,
          { guild: name },
        ),
      );
    }
    if (guildLines.length === 0) {
      guildLines.push(this.messages.statusReportGuildsNone);
    }

    const usage = formatTemplate(this.messages.statusReportUsageBody, {
      weather: String(summary.weather),
      calendar: String(summary.calendar),
      announce: String(summary.announce),
      command: String(summary.command),
    });

    let issues = this.messages.statusReportIssuesNone;
    if (summary.issues.length > 0) {
      issues = summary.issues
        .map((issue) => {
          const tag = issue.level === 'error' ? 'ERR' : 'WARN';
          return `• \`[${tag}/${issue.category}]\` ${issue.message}`;
        })
        .join('\n');
    }

    const uptimeMin = Math.floor(process.uptime() / 60);
    const uptime =
      uptimeMin >= 60
        ? formatTemplate(this.messages.statusReportUptimeHours, {
            hours: String(Math.floor(uptimeMin / 60)),
            minutes: String(uptimeMin % 60),
          })
        : formatTemplate(this.messages.statusReportUptimeMinutes, {
            minutes: String(uptimeMin),
          });

    return new EmbedBuilder()
      .setTitle(this.messages.statusReportTitle)
      .setDescription(
        formatTemplate(this.messages.statusReportDescription, {
          cadence: cadenceLabel,
          uptime,
        }),
      )
      .addFields(
        {
          name: this.messages.statusReportFieldGuilds,
          value: guildLines.join('\n').slice(0, 1024),
        },
        {
          name: this.messages.statusReportFieldUsage,
          value: usage.slice(0, 1024),
        },
        {
          name: this.messages.statusReportFieldIssues,
          value: issues.slice(0, 1024),
        },
      )
      .setTimestamp(now);
  }
}
