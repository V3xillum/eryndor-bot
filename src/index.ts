import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { registerInteractionHandler } from './events/interactionCreate.js';
import { registerReadyHandler } from './events/ready.js';
import { ActivityLogService } from './services/ActivityLogService.js';
import { AnnounceService } from './services/AnnounceService.js';
import { EryndorCalendarService } from './services/EryndorCalendarService.js';
import { SchedulerService } from './services/SchedulerService.js';
import { StatusReportService } from './services/StatusReportService.js';
import { WeatherService } from './services/WeatherService.js';
import { formatTimeOfDay } from './utils/activeWindow.js';

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
  const activity = new ActivityLogService(db);

  console.log(
    `Auto-update interval (default): ${config.updateMinMinutes}–${config.updateMaxMinutes} minutes`,
  );
  if (config.activeWindow) {
    const { start, end, timeZone } = config.activeWindow;
    console.log(
      `Active window: ${formatTimeOfDay(start)}–${formatTimeOfDay(end)} (${timeZone})`,
    );
  } else {
    console.log('Active window: disabled (24/7 auto-updates)');
  }
  console.log(`Eryndor calendar: ${config.eryndorCalendar.baseUrl}`);
  console.log(
    `Calendar events post: ${formatTimeOfDay(config.calendarEventsPostTime)} (${config.eryndorCalendar.timeZone}), only when events exist`,
  );
  console.log(
    `Calendar full moon post: ${formatTimeOfDay(config.calendarFullMoonPostTime)} (${config.eryndorCalendar.timeZone}), Rising (silent) + exact (@everyone)`,
  );
  if (config.statusReportUserIds.length > 0) {
    console.log(
      `Status report: ${config.statusReportCadence} at ${formatTimeOfDay(config.statusReportTime)} → ${config.statusReportUserIds.length} user(s)`,
    );
  } else {
    console.log('Status report: disabled (STATUS_REPORT_USER_ID empty)');
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const statusReport =
    config.statusReportUserIds.length > 0
      ? new StatusReportService(
          db,
          client,
          weather,
          activity,
          weather.messages,
          config.statusReportUserIds,
          config.statusReportTime,
          config.statusReportCadence,
          config.eryndorCalendar.timeZone,
        )
      : null;

  const scheduler = new SchedulerService(
    client,
    weather,
    announce,
    calendar,
    activity,
    statusReport,
    config.calendarEventsPostTime,
    config.calendarFullMoonPostTime,
    config.eryndorCalendar.timeZone,
  );

  registerReadyHandler(client, scheduler);
  registerInteractionHandler(client, {
    weather,
    scheduler,
    calendar,
    announce,
    activity,
    config,
  });

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
