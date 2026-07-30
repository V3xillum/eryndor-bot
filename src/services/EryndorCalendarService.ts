import { EmbedBuilder } from 'discord.js';
import type {
  CalendarDay,
  CalendarEvent,
  CalendarNextFullMoon,
  Messages,
} from '../types.js';
import { dayJsonUrl, fullMoonsJsonUrl, harptosDoyNow } from '../utils/harptos.js';
import { formatGregorianNl, formatTemplate } from '../utils/helpers.js';

export interface EryndorCalendarOptions {
  baseUrl: string;
  fallbackUrl: string;
  timeZone: string;
}

export class CalendarFetchError extends Error {
  constructor(message = 'calendar_fetch_failed') {
    super(message);
    this.name = 'CalendarFetchError';
  }
}

export class EryndorCalendarService {
  constructor(
    private readonly options: EryndorCalendarOptions,
    readonly messages: Messages,
  ) {}

  async getToday(date = new Date()): Promise<CalendarDay> {
    const doy = harptosDoyNow(date, this.options.timeZone);
    return this.fetchDay(doy);
  }

  async getNextFullMoon(date = new Date()): Promise<CalendarNextFullMoon> {
    const doy = harptosDoyNow(date, this.options.timeZone);
    const data = await this.fetchFullMoons();
    const next = data.nextByFromDoy[String(doy)];
    if (!isNextFullMoon(next)) {
      throw new CalendarFetchError();
    }
    return next;
  }

  buildTodayEmbed(day: CalendarDay): EmbedBuilder {
    const events =
      day.events.length === 0
        ? this.messages.calendarNoEvents
        : day.events.map((event) => this.formatEventLine(event)).join('\n');

    const gregorian = formatGregorianNl(day.gregorian.iso);
    const description = [`${day.moon.emoji} ${day.moon.phase}`, gregorian].join('\n');
    const viewLink = formatTemplate(this.messages.calendarViewLink, {
      url: this.options.baseUrl,
    });

    const embed = new EmbedBuilder()
      .setColor(0xc9a227)
      .setTitle(
        formatTemplate(this.messages.calendarTodayTitle, { label: day.harptos.label }),
      )
      .setDescription(description)
      .addFields({
        name: this.messages.calendarEventsHeader,
        // Same field = tight spacing (a second field adds a large Discord gap).
        value: `${events}\n${viewLink}`,
      });

    if (day.leapYearNote) {
      embed.setFooter({ text: day.leapYearNote });
    }

    return embed;
  }

  buildFullMoonEmbed(next: CalendarNextFullMoon): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0xe8e6d9)
      .setTitle(this.messages.calendarFullMoonTitle)
      .setDescription(
        [
          `🌕 **${next.label}**`,
          formatTemplate(this.messages.calendarFullMoonWhen, { whenText: next.whenText }),
        ].join('\n'),
      );
  }

  formatEventLine(event: CalendarEvent): string {
    switch (event.type) {
      case 'birthday':
        return `🎂 ${event.name}`;
      case 'festival':
        return `${event.icon} ${event.name}`;
      case 'memorial': {
        const icon =
          event.memorialType === 'festive'
            ? '✨'
            : event.memorialType === 'death'
              ? '🕯'
              : '✦';
        const line = `${icon} ${event.title}`;
        return event.subtitle ? `${line} — ${event.subtitle}` : line;
      }
      default: {
        const _exhaustive: never = event;
        return String(_exhaustive);
      }
    }
  }

  private async fetchDay(doy: number): Promise<CalendarDay> {
    const body = await this.fetchTextWithFallback((base) => dayJsonUrl(base, doy));
    return this.parseDay(body);
  }

  private async fetchFullMoons(): Promise<FullMoonsIndex> {
    const body = await this.fetchTextWithFallback((base) => fullMoonsJsonUrl(base));
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      throw new CalendarFetchError();
    }
    if (!isFullMoonsIndex(data)) {
      throw new CalendarFetchError();
    }
    return data;
  }

  private async fetchTextWithFallback(buildUrl: (base: string) => string): Promise<string> {
    const primary = await this.tryFetchJson(buildUrl(this.options.baseUrl));
    if (primary.ok) {
      return primary.body;
    }

    if (primary.status === 404 && this.options.fallbackUrl) {
      const fallback = await this.tryFetchJson(buildUrl(this.options.fallbackUrl));
      if (fallback.ok) {
        return fallback.body;
      }
    }

    throw new CalendarFetchError();
  }

  private async tryFetchJson(
    url: string,
  ): Promise<{ ok: true; body: string } | { ok: false; status: number }> {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return { ok: false, status: response.status };
      }
      return { ok: true, body: await response.text() };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  private parseDay(raw: string): CalendarDay {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new CalendarFetchError();
    }

    if (!isCalendarDay(data)) {
      throw new CalendarFetchError();
    }
    return data;
  }
}

interface FullMoonsIndex {
  nextByFromDoy: Record<string, CalendarNextFullMoon>;
}

function isNextFullMoon(value: unknown): value is CalendarNextFullMoon {
  if (!value || typeof value !== 'object') return false;
  const next = value as Record<string, unknown>;
  return (
    typeof next.dayOfYear === 'number' &&
    typeof next.daysUntil === 'number' &&
    typeof next.whenText === 'string' &&
    typeof next.label === 'string'
  );
}

function isFullMoonsIndex(value: unknown): value is FullMoonsIndex {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return !!data.nextByFromDoy && typeof data.nextByFromDoy === 'object';
}

function isCalendarDay(value: unknown): value is CalendarDay {
  if (!value || typeof value !== 'object') return false;
  const day = value as Record<string, unknown>;
  if (typeof day.dayOfYear !== 'number') return false;
  if (!day.harptos || typeof day.harptos !== 'object') return false;
  if (!day.gregorian || typeof day.gregorian !== 'object') return false;
  if (!day.moon || typeof day.moon !== 'object') return false;
  if (!Array.isArray(day.events)) return false;

  const harptos = day.harptos as Record<string, unknown>;
  const gregorian = day.gregorian as Record<string, unknown>;
  const moon = day.moon as Record<string, unknown>;

  return (
    typeof harptos.label === 'string' &&
    typeof gregorian.iso === 'string' &&
    typeof moon.phase === 'string' &&
    typeof moon.emoji === 'string'
  );
}
