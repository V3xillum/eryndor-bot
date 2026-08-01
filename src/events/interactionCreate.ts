import type { Client, Interaction } from 'discord.js';
import type { AppConfig } from '../config.js';
import {
  handleAnnounceCommand,
  handleAnnounceModal,
} from '../commands/announce.js';
import { handleWeatherCommand } from '../commands/weather.js';
import { handleWorldCommand } from '../commands/world.js';
import type { ActivityLogService } from '../services/ActivityLogService.js';
import type { AnnounceService } from '../services/AnnounceService.js';
import type { EryndorCalendarService } from '../services/EryndorCalendarService.js';
import type { SchedulerService } from '../services/SchedulerService.js';
import type { WeatherService } from '../services/WeatherService.js';

export function registerInteractionHandler(
  client: Client,
  deps: {
    weather: WeatherService;
    scheduler: SchedulerService;
    calendar: EryndorCalendarService;
    announce: AnnounceService;
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
