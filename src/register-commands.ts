import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { buildBuildingCommand } from './commands/building.js';
import { buildDmCommand } from './commands/dm.js';
import { buildEryndorCommand } from './commands/eryndor.js';
import { buildProductionCommand } from './commands/production.js';
import { buildResourceCommand } from './commands/resource.js';
import { buildWeatherCommand } from './commands/weather.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const body = [
    buildEryndorCommand().toJSON(),
    buildWeatherCommand().toJSON(),
    buildDmCommand().toJSON(),
    buildResourceCommand().toJSON(),
    buildBuildingCommand().toJSON(),
    buildProductionCommand().toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log('Registering global application commands...');
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log('Commands registered. Global commands can take up to ~1 hour to appear.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
