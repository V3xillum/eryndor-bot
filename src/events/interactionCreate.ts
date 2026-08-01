import type { Client, Interaction } from 'discord.js';
import type { AppConfig } from '../config.js';
import {
  handleAnnounceCommand,
  handleAnnounceModal,
} from '../commands/announce.js';
import { handleBuildingCommand } from '../commands/building.js';
import {
  BUILDING_WIZARD_PREFIX,
  handleBuildingWizardButton,
  handleBuildingWizardModal,
  handleBuildingWizardSelect,
} from '../commands/buildingWizard.js';
import { handleProductionCommand } from '../commands/production.js';
import {
  PRODUCTION_WIZARD_PREFIX,
  handleProductionWizardModal,
  handleProductionWizardSelect,
} from '../commands/productionWizard.js';
import { handleResourceCommand } from '../commands/resource.js';
import { handleWeatherCommand } from '../commands/weather.js';
import { handleWorldCommand } from '../commands/world.js';
import type { ActivityLogService } from '../services/ActivityLogService.js';
import type { AnnounceService } from '../services/AnnounceService.js';
import type { BuildingService } from '../services/BuildingService.js';
import type { EryndorCalendarService } from '../services/EryndorCalendarService.js';
import type { ProductionService } from '../services/ProductionService.js';
import type { ResourceService } from '../services/ResourceService.js';
import type { SchedulerService } from '../services/SchedulerService.js';
import type { WeatherService } from '../services/WeatherService.js';

export function registerInteractionHandler(
  client: Client,
  deps: {
    weather: WeatherService;
    scheduler: SchedulerService;
    calendar: EryndorCalendarService;
    announce: AnnounceService;
    resources: ResourceService;
    buildings: BuildingService;
    production: ProductionService;
    activity: ActivityLogService;
    config: AppConfig;
  },
): void {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('announce:')) {
          await handleAnnounceModal(interaction, {
            announce: deps.announce,
            config: deps.config,
          });
          deps.activity.ok('command', 'announce modal');
          return;
        }
        if (interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) {
          await handleBuildingWizardModal(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'building wizard modal');
          return;
        }
        if (interaction.customId.startsWith(PRODUCTION_WIZARD_PREFIX)) {
          await handleProductionWizardModal(interaction, {
            production: deps.production,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'production wizard modal');
        }
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) {
          await handleBuildingWizardButton(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'building wizard button');
        }
        return;
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) {
          await handleBuildingWizardSelect(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'building wizard');
          return;
        }
        if (interaction.customId.startsWith(PRODUCTION_WIZARD_PREFIX)) {
          await handleProductionWizardSelect(interaction, {
            production: deps.production,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'production wizard');
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      switch (interaction.commandName) {
        case 'weather':
          await handleWeatherCommand(interaction, deps);
          deps.activity.ok('command', '/weather');
          return;
        case 'world':
          await handleWorldCommand(interaction, {
            calendar: deps.calendar,
            weather: deps.weather,
            config: deps.config,
          });
          deps.activity.ok('command', '/world');
          return;
        case 'announce':
          await handleAnnounceCommand(interaction, {
            announce: deps.announce,
            config: deps.config,
          });
          deps.activity.ok('command', '/announce');
          return;
        case 'resource':
          await handleResourceCommand(interaction, {
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', '/resource');
          return;
        case 'building':
          await handleBuildingCommand(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', '/building');
          return;
        case 'production':
          await handleProductionCommand(interaction, {
            production: deps.production,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', '/production');
          return;
        default:
          return;
      }
    } catch (error) {
      deps.activity.error('command', 'Command error', error);
      const message = deps.weather.messages.commandError;
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: message, ephemeral: true }).catch(() => undefined);
        } else {
          await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
        }
      }
    }
  });
}
