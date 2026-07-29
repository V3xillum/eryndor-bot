import { Events, type Client } from 'discord.js';
import type { SchedulerService } from '../services/SchedulerService.js';

export function registerReadyHandler(client: Client, scheduler: SchedulerService): void {
  client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);
    // First tick also catches up any next_update_at values that passed while offline.
    scheduler.start();
  });
}
