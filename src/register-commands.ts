import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { buildBuildingCommand } from './commands/building.js';
// Proof of concept: D&D Beyond character skillchecks via /dev character.
// Uncomment buildDevCommand (+ handler wiring) to re-enable.
// import { buildDevCommand } from './commands/dev.js';
import { buildDmCommand } from './commands/dm.js';
import { buildEryndorCommand } from './commands/eryndor.js';
import { buildProductionCommand } from './commands/production.js';
import { buildResourceCommand } from './commands/resource.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const body = [
    buildEryndorCommand().toJSON(),
    buildDmCommand().toJSON(),
    // buildDevCommand().toJSON(), // PoC — D&D Beyond character import
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
