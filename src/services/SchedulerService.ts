import type { Client, GuildChannel, TextBasedChannel } from 'discord.js';
import {
  AttachmentBuilder,
  DiscordAPIError,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from 'discord.js';
import { resolveImagePath } from '../content/loader.js';
import type { CalendarDay, ScheduledPost, WeatherResult } from '../types.js';
import {
  timeOfDayToMinutes,
  zonedParts,
  type TimeOfDay,
} from '../utils/activeWindow.js';
import { formatTemplate } from '../utils/helpers.js';
import type { AnnounceService } from './AnnounceService.js';
import {
  CalendarFetchError,
  type EryndorCalendarService,
} from './EryndorCalendarService.js';
import type { WeatherService } from './WeatherService.js';

const CHECK_INTERVAL_MS = 30 * 1000;
const DISCORD_CONTENT_LIMIT = 2000;
const FULL_MOON_RISING_PHASE = 'Full Moon (Rising)';

/** Channel/permission errors that will not succeed on retry. */
const PERMANENT_ANNOUNCE_ERROR_CODES = new Set<number>([
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.UnknownChannel,
]);

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: Client,
    private readonly weather: WeatherService,
    private readonly announce: AnnounceService,
    private readonly calendar: EryndorCalendarService,
    private readonly calendarEventsPostTime: TimeOfDay,
    private readonly calendarFullMoonPostTime: TimeOfDay,
    private readonly calendarTimeZone: string,
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
    await this.tickCalendarEvents();
    await this.tickCalendarFullMoon();
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
          await this.failAnnounceWithDm(post);
          continue;
        }

        if (!('send' in channel)) {
          console.warn(`Scheduled post ${post.id}: channel does not support send`);
          await this.failAnnounceWithDm(post);
          continue;
        }

        if (!botCanSendInChannel(channel)) {
          console.warn(
            `Scheduled post ${post.id}: bot lacks View/Send in ${post.channel_id}`,
          );
          await this.failAnnounceWithDm(post);
          continue;
        }

        await channel.send({ content: post.body });
        this.announce.markPosted(post.id);
      } catch (error) {
        console.error(`Scheduled post ${post.id} failed:`, error);
        if (isPermanentAnnounceError(error)) {
          await this.failAnnounceWithDm(post);
          continue;
        }
        // Leave pending so the next tick can retry (e.g. transient Discord outage).
      }
    }
  }

  /**
   * Once per local day after calendarEventsPostTime: fetch today; post the same
   * embed as /world today only when events.length > 0. Empty days are silent.
   */
  private async tickCalendarEvents(now = new Date()): Promise<void> {
    const localDate = localDateIso(now, this.calendarTimeZone);
    if (!isAtOrAfterPostTime(now, this.calendarEventsPostTime, this.calendarTimeZone)) {
      return;
    }

    for (const state of this.weather.listGuildStates()) {
      if (!state.calendar_channel_id) continue;
      if (state.calendar_events_last_handled_date === localDate) continue;

      try {
        const day = await this.calendar.getToday(now);
        if (day.events.length > 0) {
          const channel = await this.client.channels.fetch(state.calendar_channel_id);
          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            console.warn(
              `Calendar events ${state.guild_id}: destination ${state.calendar_channel_id} is not a text channel`,
            );
            this.weather.markCalendarEventsHandled(state.guild_id, localDate);
            continue;
          }

          if (!('send' in channel)) {
            console.warn(
              `Calendar events ${state.guild_id}: channel does not support send`,
            );
            this.weather.markCalendarEventsHandled(state.guild_id, localDate);
            continue;
          }

          if (!botCanSendInChannel(channel)) {
            console.warn(
              `Calendar events ${state.guild_id}: bot lacks View/Send in ${state.calendar_channel_id}`,
            );
            this.weather.markCalendarEventsHandled(state.guild_id, localDate);
            continue;
          }

          await channel.send({
            content: '@everyone',
            embeds: [this.calendar.buildTodayEmbed(day)],
            allowedMentions: { parse: ['everyone'] },
          });
        }

        this.weather.markCalendarEventsHandled(state.guild_id, localDate);
      } catch (error) {
        if (error instanceof CalendarFetchError) {
          console.warn(
            `Calendar events ${state.guild_id}: could not load day data; will retry`,
          );
          continue;
        }
        console.error(`Calendar events failed for guild ${state.guild_id}:`, error);
        if (isPermanentAnnounceError(error)) {
          this.weather.markCalendarEventsHandled(state.guild_id, localDate);
        }
        // Transient Discord errors: leave unmarked so the next tick retries.
      }
    }
  }

  /**
   * Once per local evening after calendarFullMoonPostTime:
   * - Full Moon (Rising) → moon embed, no @everyone, suppress notifications
   * - exact Full Moon → moon embed + @everyone
   * Other days: silent (mark handled).
   */
  private async tickCalendarFullMoon(now = new Date()): Promise<void> {
    const localDate = localDateIso(now, this.calendarTimeZone);
    if (!isAtOrAfterPostTime(now, this.calendarFullMoonPostTime, this.calendarTimeZone)) {
      return;
    }

    for (const state of this.weather.listGuildStates()) {
      if (!state.calendar_channel_id) continue;
      if (state.calendar_fullmoon_last_handled_date === localDate) continue;

      try {
        const day = await this.calendar.getToday(now);
        const rising = isFullMoonRising(day);
        const exact = day.moon.isExactFullMoon;

        if (rising || exact) {
          const channel = await this.client.channels.fetch(state.calendar_channel_id);
          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            console.warn(
              `Calendar full moon ${state.guild_id}: destination ${state.calendar_channel_id} is not a text channel`,
            );
            this.weather.markCalendarFullMoonHandled(state.guild_id, localDate);
            continue;
          }

          if (!('send' in channel)) {
            console.warn(
              `Calendar full moon ${state.guild_id}: channel does not support send`,
            );
            this.weather.markCalendarFullMoonHandled(state.guild_id, localDate);
            continue;
          }

          if (!botCanSendInChannel(channel)) {
            console.warn(
              `Calendar full moon ${state.guild_id}: bot lacks View/Send in ${state.calendar_channel_id}`,
            );
            this.weather.markCalendarFullMoonHandled(state.guild_id, localDate);
            continue;
          }

          const embed = this.calendar.buildMoonNightEmbed(day);
          if (exact) {
            await channel.send({
              content: '@everyone',
              embeds: [embed],
              allowedMentions: { parse: ['everyone'] },
            });
          } else {
            await channel.send({
              embeds: [embed],
              flags: MessageFlags.SuppressNotifications,
            });
          }
        }

        this.weather.markCalendarFullMoonHandled(state.guild_id, localDate);
      } catch (error) {
        if (error instanceof CalendarFetchError) {
          console.warn(
            `Calendar full moon ${state.guild_id}: could not load day data; will retry`,
          );
          continue;
        }
        console.error(`Calendar full moon failed for guild ${state.guild_id}:`, error);
        if (isPermanentAnnounceError(error)) {
          this.weather.markCalendarFullMoonHandled(state.guild_id, localDate);
        }
      }
    }
  }

  /** DM the creator with the body, then mark done so we stop retrying. */
  private async failAnnounceWithDm(post: ScheduledPost): Promise<void> {
    const channelMention = `<#${post.channel_id}>`;
    const combined = formatTemplate(this.announce.messages.announcePostFailedDm, {
      channel: channelMention,
      body: post.body,
    });

    try {
      const user = await this.client.users.fetch(post.created_by);
      if (combined.length <= DISCORD_CONTENT_LIMIT) {
        await user.send({ content: combined });
      } else {
        const intro = formatTemplate(this.announce.messages.announcePostFailedDmIntro, {
          channel: channelMention,
        });
        await user.send({ content: intro.slice(0, DISCORD_CONTENT_LIMIT) });
        await user.send({ content: post.body.slice(0, DISCORD_CONTENT_LIMIT) });
      }
    } catch (error) {
      console.error(
        `Scheduled post ${post.id}: could not DM creator ${post.created_by}`,
        error,
      );
      console.error(`Scheduled post ${post.id} body:\n${post.body}`);
    }

    this.announce.markPosted(post.id);
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
 * Large attachment (full Discord image size) + markdown title + @everyone.
 * Embeds shrink the image, so we avoid them here on purpose.
 */
export function buildWeatherCard(result: WeatherResult): {
  content: string;
  files: AttachmentBuilder[];
  allowedMentions: { parse: ['everyone'] };
} {
  const attachment = new AttachmentBuilder(resolveImagePath(result.image), {
    name: result.image,
  });

  const title = formatWeatherTitle(result.type);

  return {
    content: `@everyone\n### ${title}`,
    files: [attachment],
    allowedMentions: { parse: ['everyone'] },
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

function botCanSendInChannel(channel: TextBasedChannel): boolean {
  if (!('guild' in channel) || channel.guild == null) return false;
  if (!('permissionsFor' in channel)) return false;

  const me = channel.guild.members.me;
  if (!me) return true;

  const perms = (channel as GuildChannel).permissionsFor(me);
  return Boolean(
    perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
  );
}

function isPermanentAnnounceError(error: unknown): boolean {
  return (
    error instanceof DiscordAPIError && PERMANENT_ANNOUNCE_ERROR_CODES.has(Number(error.code))
  );
}

function localDateIso(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function isAtOrAfterPostTime(now: Date, postTime: TimeOfDay, timeZone: string): boolean {
  const parts = zonedParts(now, timeZone);
  const nowMinutes = parts.hours * 60 + parts.minutes;
  return nowMinutes >= timeOfDayToMinutes(postTime);
}

function isFullMoonRising(day: CalendarDay): boolean {
  return day.moon.phase === FULL_MOON_RISING_PHASE;
}
