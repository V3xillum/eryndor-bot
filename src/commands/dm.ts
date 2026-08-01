import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppConfig } from '../config.js';
import type { AnnounceService } from '../services/AnnounceService.js';
import type { BuildingService } from '../services/BuildingService.js';
import type { EryndorCalendarService } from '../services/EryndorCalendarService.js';
import type { ProductionService } from '../services/ProductionService.js';
import type { ResourceService } from '../services/ResourceService.js';
import type { SchedulerService } from '../services/SchedulerService.js';
import type { WeatherService } from '../services/WeatherService.js';
import {
  buildAnnounceCancelSubcommand,
  buildAnnounceListSubcommand,
  buildAnnounceScheduleSubcommand,
  handleAnnounceCommand,
} from './announce.js';
import {
  buildBuildingAdminSubcommands,
  buildBuildingCostAdminSubcommands,
  dispatchBuildingAdmin,
} from './building.js';
import {
  buildCalendarClearSubcommand,
  buildCalendarSetupSubcommand,
  dispatchEryndorAdmin,
} from './eryndor.js';
import { handleProductionCommand } from './production.js';
import {
  buildResourceAdminSubcommands,
  buildResourceTypeAdminSubcommands,
  dispatchResourceAdmin,
} from './resource.js';
import {
  buildWeatherAdminSubcommands,
  buildWeatherMagicalSubcommands,
  buildWeatherSettingsSubcommands,
  buildWeatherSeveritySubcommands,
  dispatchWeatherAdmin,
} from './weather.js';

export function buildDmCommand() {
  return new SlashCommandBuilder()
    .setName('dm')
    .setDescription('DM-only Eryndor bot controls (hidden from players by default)')
    .setDefaultMemberPermissions(0)
    .addSubcommandGroup((group) =>
      buildWeatherAdminSubcommands(
        group.setName('weather').setDescription('Weather controls for DMs'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildWeatherSeveritySubcommands(
        group.setName('weather-severity').setDescription('Temporary severity dial'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildWeatherMagicalSubcommands(
        group.setName('weather-magical').setDescription('Temporary magical dial'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildWeatherSettingsSubcommands(
        group.setName('weather-settings').setDescription('Guild schedule and cooldown'),
      ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('calendar')
        .setDescription('Calendar event channel setup')
        .addSubcommand((sub) => buildCalendarSetupSubcommand(sub))
        .addSubcommand((sub) => buildCalendarClearSubcommand(sub)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('announce')
        .setDescription('Schedule free-text posts')
        .addSubcommand((sub) => buildAnnounceScheduleSubcommand(sub))
        .addSubcommand((sub) => buildAnnounceListSubcommand(sub))
        .addSubcommand((sub) => buildAnnounceCancelSubcommand(sub)),
    )
    .addSubcommandGroup((group) =>
      buildResourceAdminSubcommands(
        group.setName('resource').setDescription('Guild resource admin'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildResourceTypeAdminSubcommands(
        group.setName('resource-type').setDescription('Manage resource types'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildBuildingAdminSubcommands(
        group.setName('building').setDescription('Building project admin'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildBuildingCostAdminSubcommands(
        group.setName('building-cost').setDescription('Set building project costs'),
      ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('production')
        .setDescription('Production source admin')
        .addSubcommand((sub) =>
          sub.setName('add').setDescription('Add a production source'),
        )
        .addSubcommand((sub) =>
          sub.setName('workers').setDescription('Set workers on a production source'),
        )
        .addSubcommand((sub) =>
          sub.setName('yield').setDescription('Set yield per worker on a production source'),
        )
        .addSubcommand((sub) =>
          sub.setName('remove').setDescription('Remove a production source'),
        ),
    );
}

export async function handleDmCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    weather: WeatherService;
    scheduler: SchedulerService;
    calendar: EryndorCalendarService;
    announce: AnnounceService;
    resources: ResourceService;
    buildings: BuildingService;
    production: ProductionService;
    config: AppConfig;
  },
): Promise<void> {
  const { weather, config } = deps;
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand();

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

  switch (group) {
    case 'weather':
      await dispatchWeatherAdmin(interaction, deps, { group: null, sub });
      return;
    case 'weather-severity':
      await dispatchWeatherAdmin(interaction, deps, { group: 'severity', sub });
      return;
    case 'weather-magical':
      await dispatchWeatherAdmin(interaction, deps, { group: 'magical', sub });
      return;
    case 'weather-settings':
      await dispatchWeatherAdmin(interaction, deps, { group: 'settings', sub });
      return;
    case 'calendar':
      await dispatchEryndorAdmin(interaction, deps, sub);
      return;
    case 'announce':
      await handleAnnounceCommand(interaction, {
        announce: deps.announce,
        config: deps.config,
      });
      return;
    case 'resource':
      await dispatchResourceAdmin(interaction, deps, { group: null, sub });
      return;
    case 'resource-type':
      await dispatchResourceAdmin(interaction, deps, { group: 'type', sub });
      return;
    case 'building':
      await dispatchBuildingAdmin(interaction, deps, { group: null, sub });
      return;
    case 'building-cost':
      await dispatchBuildingAdmin(interaction, deps, { group: 'cost', sub });
      return;
    case 'production':
      await handleProductionCommand(interaction, {
        production: deps.production,
        resources: deps.resources,
        config: deps.config,
      });
      return;
    default:
      await interaction.reply({
        content: weather.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}
