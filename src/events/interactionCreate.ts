import type { Client, Interaction } from 'discord.js';
import type { AppConfig } from '../config.js';
import { handleAnnounceModal } from '../commands/announce.js';
import { handleBuildingCommand } from '../commands/building.js';
// Proof of concept: /dev character (D&D Beyond skillchecks). Re-enable with register-commands.
// import { handleDevCommand } from '../commands/dev.js';
import {
  BUILDING_WIZARD_PREFIX,
  handleBuildingWizardButton,
  handleBuildingWizardModal,
  handleBuildingWizardSelect,
} from '../commands/buildingWizard.js';
import { handleDmCommand } from '../commands/dm.js';
import {
  DM_BUILDING_HUB_PREFIX,
  handleBuildingHubModal,
  handleBuildingHubSelect,
} from '../commands/dmBuildingHub.js';
import {
  DM_PRODUCTION_HUB_PREFIX,
  handleProductionHubSelect,
} from '../commands/dmProductionHub.js';
import {
  DM_RESOURCE_HUB_PREFIX,
  handleResourceHubModal,
  handleResourceHubSelect,
} from '../commands/dmResourceHub.js';
import {
  DM_SETUP_HUB_PREFIX,
  handleSetupHubChannelSelect,
  handleSetupHubSelect,
} from '../commands/dmSetupHub.js';
import { handleEryndorCommand } from '../commands/eryndor.js';
import { handleProductionCommand } from '../commands/production.js';
import {
  PRODUCTION_WIZARD_PREFIX,
  handleProductionWizardModal,
  handleProductionWizardSelect,
} from '../commands/productionWizard.js';
import { handleResourceCommand } from '../commands/resource.js';
import {
  RESOURCE_WIZARD_PREFIX,
  handleResourceWizardModal,
  handleResourceWizardSelect,
} from '../commands/resourceWizard.js';
import {
  WEATHER_SETTINGS_WIZARD_PREFIX,
  handleWeatherSettingsWizardModal,
  handleWeatherSettingsWizardSelect,
} from '../commands/weatherSettingsWizard.js';
import type { ActivityLogService } from '../services/ActivityLogService.js';
import type { AnnounceService } from '../services/AnnounceService.js';
import type { BuildingService } from '../services/BuildingService.js';
// import type { DdbCharacterService } from '../services/DdbCharacterService.js'; // PoC /dev character
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
    // ddb: DdbCharacterService; // PoC /dev character
    activity: ActivityLogService;
    config: AppConfig;
  },
): void {
  client.on('interactionCreate', async (interaction: Interaction) => {
    const actorUserId = interaction.user.id;
    try {
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('announce:')) {
          await handleAnnounceModal(interaction, {
            announce: deps.announce,
            config: deps.config,
          });
          deps.activity.ok('command', 'announce modal', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(DM_BUILDING_HUB_PREFIX)) {
          await handleBuildingHubModal(interaction, {
            buildings: deps.buildings,
            config: deps.config,
          });
          deps.activity.ok('command', 'building hub modal', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(DM_RESOURCE_HUB_PREFIX)) {
          await handleResourceHubModal(interaction, {
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', 'resource hub modal', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) {
          await handleBuildingWizardModal(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'building wizard modal', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(RESOURCE_WIZARD_PREFIX)) {
          await handleResourceWizardModal(interaction, deps.resources);
          deps.activity.ok('command', 'resource wizard modal', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(PRODUCTION_WIZARD_PREFIX)) {
          await handleProductionWizardModal(interaction, {
            production: deps.production,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'production wizard modal', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(WEATHER_SETTINGS_WIZARD_PREFIX)) {
          await handleWeatherSettingsWizardModal(interaction, {
            weather: deps.weather,
            config: deps.config,
          });
          deps.activity.ok('command', 'weather settings modal', actorUserId);
        }
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) {
          await handleBuildingWizardButton(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'building wizard button', actorUserId);
        }
        return;
      }

      if (interaction.isChannelSelectMenu()) {
        if (interaction.customId.startsWith(DM_SETUP_HUB_PREFIX)) {
          await handleSetupHubChannelSelect(interaction, {
            weather: deps.weather,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', 'setup hub channel', actorUserId);
        }
        return;
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith(DM_SETUP_HUB_PREFIX)) {
          await handleSetupHubSelect(interaction, {
            weather: deps.weather,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', 'setup hub select', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(DM_BUILDING_HUB_PREFIX)) {
          await handleBuildingHubSelect(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', 'building hub select', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(DM_RESOURCE_HUB_PREFIX)) {
          await handleResourceHubSelect(interaction, {
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', 'resource hub select', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(DM_PRODUCTION_HUB_PREFIX)) {
          await handleProductionHubSelect(interaction, {
            production: deps.production,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', 'production hub select', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) {
          await handleBuildingWizardSelect(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'building wizard', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(PRODUCTION_WIZARD_PREFIX)) {
          await handleProductionWizardSelect(interaction, {
            production: deps.production,
            resources: deps.resources,
          });
          deps.activity.ok('command', 'production wizard', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(RESOURCE_WIZARD_PREFIX)) {
          await handleResourceWizardSelect(interaction, deps.resources);
          deps.activity.ok('command', 'resource wizard select', actorUserId);
          return;
        }
        if (interaction.customId.startsWith(WEATHER_SETTINGS_WIZARD_PREFIX)) {
          await handleWeatherSettingsWizardSelect(interaction, {
            weather: deps.weather,
            config: deps.config,
          });
          deps.activity.ok('command', 'weather settings select', actorUserId);
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      switch (interaction.commandName) {
        case 'eryndor':
          await handleEryndorCommand(interaction, {
            calendar: deps.calendar,
            weather: deps.weather,
            resources: deps.resources,
            buildings: deps.buildings,
            production: deps.production,
            config: deps.config,
          });
          deps.activity.ok('command', '/eryndor', actorUserId);
          return;
        case 'dm':
          await handleDmCommand(interaction, deps);
          deps.activity.ok('command', '/dm', actorUserId);
          return;
        case 'voorraad':
          await handleResourceCommand(interaction, {
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', '/voorraad', actorUserId);
          return;
        case 'bouw':
          await handleBuildingCommand(interaction, {
            buildings: deps.buildings,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', '/bouw', actorUserId);
          return;
        case 'productie':
          await handleProductionCommand(interaction, {
            production: deps.production,
            resources: deps.resources,
            config: deps.config,
          });
          deps.activity.ok('command', '/productie', actorUserId);
          return;
        // Proof of concept: D&D Beyond character skillchecks.
        // case 'dev':
        //   await handleDevCommand(interaction, {
        //     ddb: deps.ddb,
        //     messages: deps.weather.messages,
        //     config: deps.config,
        //   });
        //   deps.activity.ok('command', '/dev', actorUserId);
        //   return;
        default:
          return;
      }
    } catch (error) {
      deps.activity.error('command', 'Command error', error, actorUserId);
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
