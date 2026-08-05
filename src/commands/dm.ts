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
import { startBuildingHub } from './dmBuildingHub.js';
import { startProductionHub } from './dmProductionHub.js';
import { startResourceHub } from './dmResourceHub.js';
import { startSetupHub } from './dmSetupHub.js';
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
      group
        .setName('setup')
        .setDescription('Bestemmingskanalen: weer, kalender, voorraad')
        .addSubcommand((sub) =>
          sub
            .setName('menu')
            .setDescription('Hub: status + zetten/wissen van kanalen'),
        ),
    )
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
        .setName('announce')
        .setDescription('Plan sfeer- of wereldberichten voor later')
        .addSubcommand((sub) => buildAnnounceScheduleSubcommand(sub))
        .addSubcommand((sub) => buildAnnounceListSubcommand(sub))
        .addSubcommand((sub) => buildAnnounceCancelSubcommand(sub)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('resource')
        .setDescription('Voorraad, types, limieten en huisbelasting')
        .addSubcommand((sub) =>
          sub
            .setName('menu')
            .setDescription('Hub: adjust, cap, house-tax, types'),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('building')
        .setDescription('Bouwprojecten, kosten en correcties')
        .addSubcommand((sub) =>
          sub
            .setName('menu')
            .setDescription('Hub: create, cancel, kosten, funding, bouwtijd'),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('production')
        .setDescription('Productiebronnen beheren')
        .addSubcommand((sub) =>
          sub
            .setName('menu')
            .setDescription('Hub: toevoegen, workers, yield, verwijderen'),
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
    case 'setup':
      if (sub === 'menu') {
        await startSetupHub(interaction, {
          weather: deps.weather,
          resources: deps.resources,
        });
        return;
      }
      break;
    case 'weather':
      await dispatchWeatherAdmin(interaction, deps, { group: null, sub });
      return;
    case 'weather-settings':
      await dispatchWeatherAdmin(interaction, deps, { group: 'settings', sub });
      return;
    case 'announce':
      await handleAnnounceCommand(interaction, {
        announce: deps.announce,
        config: deps.config,
      });
      return;
    case 'resource':
      if (sub === 'menu') {
        await startResourceHub(interaction, deps.resources);
        return;
      }
      break;
    case 'building':
      if (sub === 'menu') {
        await startBuildingHub(interaction, {
          buildings: deps.buildings,
          resources: deps.resources,
        });
        return;
      }
      break;
    case 'production':
      if (sub === 'menu') {
        await startProductionHub(interaction, deps.production);
        return;
      }
      break;
    default:
      break;
  }

  await interaction.reply({
    content: weather.messages.unknownSubcommand,
    ephemeral: true,
  });
}
