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
  buildWeatherSettingsSubcommands,
  dispatchWeatherAdmin,
} from './weather.js';

export function buildDmCommand() {
  return new SlashCommandBuilder()
    .setName('dm')
    .setDescription('DM-tools voor Eryndor (verborgen voor spelers)')
    .setDefaultMemberPermissions(0)
    .addSubcommandGroup((group) =>
      buildWeatherAdminSubcommands(
        group.setName('weather').setDescription('Weer sturen tijdens en tussen sessies'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildWeatherSettingsSubcommands(
        group
          .setName('weather-settings')
          .setDescription('Ritme, venster, afkoeling en tijdelijke limieten'),
      ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('calendar')
        .setDescription('Kanaal voor kalender-events en volle maan')
        .addSubcommand((sub) => buildCalendarSetupSubcommand(sub))
        .addSubcommand((sub) => buildCalendarClearSubcommand(sub)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('announce')
        .setDescription('Plan sfeer- of wereldberichten voor later')
        .addSubcommand((sub) => buildAnnounceScheduleSubcommand(sub))
        .addSubcommand((sub) => buildAnnounceListSubcommand(sub))
        .addSubcommand((sub) => buildAnnounceCancelSubcommand(sub)),
    )
    .addSubcommandGroup((group) =>
      buildResourceAdminSubcommands(
        group.setName('resource').setDescription('Guild-voorraad inrichten en corrigeren'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildResourceTypeAdminSubcommands(
        group
          .setName('resource-type')
          .setDescription('Welke grondstoffen bestaan er (en de GC-prijzen)'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildBuildingAdminSubcommands(
        group.setName('building').setDescription('Bouwprojecten starten of annuleren'),
      ),
    )
    .addSubcommandGroup((group) =>
      buildBuildingCostAdminSubcommands(
        group
          .setName('building-cost')
          .setDescription('Materiaalkosten en bouwtijd van een project'),
      ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('production')
        .setDescription('Bronnen die tussen sessies grondstoffen opleveren')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Nieuwe productiebron (bijv. houthakkershut)'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('workers')
            .setDescription('Hoeveel medewerkers werken er op een bron?'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('yield')
            .setDescription('Hoeveel levert één medewerker per interval op?'),
        )
        .addSubcommand((sub) =>
          sub.setName('remove').setDescription('Productiebron verwijderen'),
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
