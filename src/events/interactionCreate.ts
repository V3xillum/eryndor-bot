import type { Client, Interaction } from 'discord.js';
import type { AppConfig } from '../config.js';
import { handleWeatherCommand } from '../commands/weather.js';
import { handleWorldCommand } from '../commands/world.js';
import type { EryndorCalendarService } from '../services/EryndorCalendarService.js';
import type { SchedulerService } from '../services/SchedulerService.js';
import type { WeatherService } from '../services/WeatherService.js';

export function registerInteractionHandler(
  client: Client,
  deps: {
    weather: WeatherService;
    scheduler: SchedulerService;
    calendar: EryndorCalendarService;
    config: AppConfig;
  },
): void {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'weather':
          await handleWeatherCommand(interaction, deps);
          return;
        case 'world':
          await handleWorldCommand(interaction, deps.calendar);
          return;
        default:
          return;
      }
    } catch (error) {
      console.error('Command error:', error);
      const message = deps.weather.messages.commandError;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => undefined);
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
      }
    }
  });
}
