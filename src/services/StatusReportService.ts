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
import type { BuildingService } from './BuildingService.js';
import type { ResourceService } from './ResourceService.js';
import type { WeatherService } from './WeatherService.js';

const META_LAST_PERIOD = 'status_report_last_period';
const LEDGER_PREVIEW_LIMIT = 20;

export class StatusReportService {
  constructor(
    private readonly db: Database.Database,
    private readonly client: Client,
    private readonly weather: WeatherService,
    private readonly activity: ActivityLogService,
    private readonly resources: ResourceService,
    private readonly buildings: BuildingService,
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
    const since = this.windowStart(now);
    const summary = this.activity.summarize(since);
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
      uniqueUsers: String(summary.uniqueUsers),
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

    const { stockBody, buildingsBody, ledgerBody, personalBody } =
      this.buildResourceBackup(since);

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
        {
          name: this.messages.statusReportFieldStock,
          value: stockBody.slice(0, 1024),
        },
        {
          name: this.messages.statusReportFieldPersonal,
          value: personalBody.slice(0, 1024),
        },
        {
          name: this.messages.statusReportFieldBuildings,
          value: buildingsBody.slice(0, 1024),
        },
        {
          name: this.messages.statusReportFieldLedger,
          value: ledgerBody.slice(0, 1024),
        },
      )
      .setTimestamp(now);
  }

  private buildResourceBackup(since: Date): {
    stockBody: string;
    buildingsBody: string;
    ledgerBody: string;
    personalBody: string;
  } {
    const guildIds = new Set<string>([
      ...this.weather.listGuildStates().map((s) => s.guild_id),
      ...this.resources.listGuildIdsWithData(),
    ]);

    const stockLines: string[] = [];
    const buildingLines: string[] = [];
    const ledgerLines: string[] = [];
    const personalLines: string[] = [];
    let ledgerShown = 0;
    let ledgerTotal = 0;

    for (const guildId of guildIds) {
      const guildName = this.client.guilds.cache.get(guildId)?.name ?? guildId;
      const stock = this.resources.stockOverview(guildId);
      if (stock.length > 0) {
        stockLines.push(`**${guildName}**`);
        for (const row of stock) {
          stockLines.push(
            formatTemplate(this.messages.statusReportStockLine, {
              type: row.type.display_name,
              key: row.type.key,
              qty: String(row.quantity),
            }),
          );
        }
      }

      const personal = this.resources.allPersonalStock(guildId);
      if (personal.length > 0) {
        personalLines.push(`**${guildName}**`);
        for (const row of personal) {
          const member = this.client.guilds.cache
            .get(guildId)
            ?.members.cache.get(row.userId);
          const nickname =
            member?.displayName ??
            this.client.users.cache.get(row.userId)?.username ??
            row.userId;
          personalLines.push(
            formatTemplate(this.messages.statusReportPersonalLine, {
              nickname,
              userId: row.userId,
              type: row.type.display_name,
              qty: String(row.quantity),
            }),
          );
        }
      }

      const open = this.buildings.openProjectsSnapshot(guildId);
      if (open.length > 0) {
        buildingLines.push(`**${guildName}**`);
        for (const row of open) {
          buildingLines.push(
            formatTemplate(this.messages.statusReportBuildingLine, {
              name: row.building.name,
              status: this.buildings.statusLabel(row.building.status),
              funded: String(row.funded),
              required: String(row.required),
              spent: String(row.building.time_spent),
              time: String(row.building.time_required),
            }),
          );
        }
      }

      const ledger = this.resources.ledgerSnapshot(
        guildId,
        since.toISOString(),
        LEDGER_PREVIEW_LIMIT,
      );
      ledgerTotal += ledger.total;
      if (ledger.entries.length > 0) {
        ledgerLines.push(`**${guildName}**`);
        for (const entry of ledger.entries) {
          if (ledgerShown >= LEDGER_PREVIEW_LIMIT) break;
          ledgerLines.push(
            formatTemplate(this.messages.statusReportLedgerLine, {
              action: entry.action,
              nickname: entry.actor_nickname,
              amount: String(entry.amount),
              type: entry.resource_key ?? 'time',
              gc: String(entry.gc_delta),
            }),
          );
          ledgerShown += 1;
        }
      }
    }

    if (ledgerTotal > ledgerShown) {
      ledgerLines.push(
        formatTemplate(this.messages.statusReportLedgerMore, {
          n: String(ledgerTotal - ledgerShown),
        }),
      );
    }

    return {
      stockBody:
        stockLines.length > 0
          ? stockLines.join('\n')
          : this.messages.statusReportStockNone,
      buildingsBody:
        buildingLines.length > 0
          ? buildingLines.join('\n')
          : this.messages.statusReportBuildingsNone,
      ledgerBody:
        ledgerLines.length > 0
          ? ledgerLines.join('\n')
          : this.messages.statusReportLedgerNone,
      personalBody:
        personalLines.length > 0
          ? personalLines.join('\n')
          : this.messages.statusReportPersonalNone,
    };
  }
}
