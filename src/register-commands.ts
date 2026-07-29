import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { loadWeatherTable, listWeatherTypes } from './content/loader.js';
import { buildWeatherCommand } from './commands/weather.js';
import { buildWorldCommand } from './commands/world.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const types = listWeatherTypes(loadWeatherTable());
  const body = [buildWeatherCommand(types).toJSON(), buildWorldCommand().toJSON()];

  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log('Registering global application commands...');
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log('Commands registered. Global commands can take up to ~1 hour to appear.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
