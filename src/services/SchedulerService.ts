import type { Client, TextBasedChannel } from 'discord.js';
import { AttachmentBuilder } from 'discord.js';
import { resolveImagePath } from '../content/loader.js';
import type { WeatherResult } from '../types.js';
import { formatTemplate } from '../utils/helpers.js';
import type { AnnounceService } from './AnnounceService.js';
import type { WeatherService } from './WeatherService.js';

const CHECK_INTERVAL_MS = 30 * 1000;

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: Client,
    private readonly weather: WeatherService,
    private readonly announce: AnnounceService,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    const due = this.weather.dueGuilds();
    for (const state of due) {
      try {
        const result = this.weather.rollWeather(state.guild_id);
        await this.postWeather(state.guild_id, result);
      } catch (error) {
        console.error(`Scheduler failed for guild ${state.guild_id}:`, error);
      }
    }

    await this.tickAnnouncements();
  }

  private async tickAnnouncements(): Promise<void> {
    const due = this.announce.duePosts();
    for (const post of due) {
      try {
        const channel = await this.client.channels.fetch(post.channel_id);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
          console.warn(
            `Scheduled post ${post.id}: destination ${post.channel_id} is not a text channel`,
          );
          this.announce.markPosted(post.id);
          continue;
        }

        if (!('send' in channel)) {
          console.warn(`Scheduled post ${post.id}: channel does not support send`);
          this.announce.markPosted(post.id);
          continue;
        }

        await channel.send({ content: post.body });
        this.announce.markPosted(post.id);
      } catch (error) {
        console.error(`Scheduled post ${post.id} failed:`, error);
        // Leave pending so the next tick can retry (e.g. transient Discord outage).
      }
    }
  }

  async postWeather(guildId: string, result: WeatherResult): Promise<boolean> {
    const state = this.weather.getWorldState(guildId);
    const destinationId = state?.thread_id ?? state?.channel_id;

    if (!destinationId) {
      console.warn(
        formatTemplate(this.weather.messages.skippedNoChannel, { guildId }),
      );
      return false;
    }

    const channel = await this.client.channels.fetch(destinationId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      console.warn(`Configured destination ${destinationId} is not a text channel`);
      return false;
    }

    await sendWeatherCard(channel, result);
    return true;
  }
}

/**
 * Large attachment (full Discord image size) + markdown title.
 * Embeds shrink the image, so we avoid them here on purpose.
 */
export function buildWeatherCard(result: WeatherResult): {
  content: string;
  files: AttachmentBuilder[];
} {
  const attachment = new AttachmentBuilder(resolveImagePath(result.image), {
    name: result.image,
  });

  const title = formatWeatherTitle(result.type);

  return {
    content: `### ${title}`,
    files: [attachment],
  };
}

export async function sendWeatherCard(
  channel: TextBasedChannel,
  result: WeatherResult,
): Promise<void> {
  if (!('send' in channel)) {
    throw new Error('Channel does not support sending messages');
  }

  await channel.send(buildWeatherCard(result));
}

function formatWeatherTitle(type: string): string {
  return type
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
