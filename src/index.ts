import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { registerInteractionHandler } from './events/interactionCreate.js';
import { registerReadyHandler } from './events/ready.js';
import { AnnounceService } from './services/AnnounceService.js';
import { EryndorCalendarService } from './services/EryndorCalendarService.js';
import { SchedulerService } from './services/SchedulerService.js';
import { WeatherService } from './services/WeatherService.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase();
  const weather = new WeatherService(db, {
    updateMinMinutes: config.updateMinMinutes,
    updateMaxMinutes: config.updateMaxMinutes,
    activeWindow: config.activeWindow,
    timeZone: config.eryndorCalendar.timeZone,
  });
  const announce = new AnnounceService(db, weather.messages);
  const calendar = new EryndorCalendarService(config.eryndorCalendar, weather.messages);
  console.log(
    `Auto-update interval (default): ${config.updateMinMinutes}–${config.updateMaxMinutes} minutes`,
  );
  if (config.activeWindow) {
    const { start, end, timeZone } = config.activeWindow;
    const fmt = (t: { hours: number; minutes: number }) =>
      `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
    console.log(`Active window: ${fmt(start)}–${fmt(end)} (${timeZone})`);
  } else {
    console.log('Active window: disabled (24/7 auto-updates)');
  }
  console.log(`Eryndor calendar: ${config.eryndorCalendar.baseUrl}`);
  {
    const t = config.calendarEventsPostTime;
    const fmt = `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
    console.log(
      `Calendar events post: ${fmt} (${config.eryndorCalendar.timeZone}), only when events exist`,
    );
  }
  {
    const t = config.calendarFullMoonPostTime;
    const fmt = `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
    console.log(
      `Calendar full moon post: ${fmt} (${config.eryndorCalendar.timeZone}), Rising (silent) + exact (@everyone)`,
    );
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const scheduler = new SchedulerService(
    client,
    weather,
    announce,
    calendar,
    config.calendarEventsPostTime,
    config.calendarFullMoonPostTime,
    config.eryndorCalendar.timeZone,
  );

  registerReadyHandler(client, scheduler);
  registerInteractionHandler(client, { weather, scheduler, calendar, announce, config });

  process.on('SIGINT', () => shutdown(client, scheduler, db));
  process.on('SIGTERM', () => shutdown(client, scheduler, db));

  await client.login(config.token);
}

function shutdown(
  client: Client,
  scheduler: SchedulerService,
  db: ReturnType<typeof openDatabase>,
): void {
  console.log('Shutting down...');
  scheduler.stop();
  client.destroy();
  db.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
