import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { ProductionService } from '../services/ProductionService.js';
import type { ResourceService } from '../services/ResourceService.js';
import { hubMessage, hubOwnerOk, type HubStartInteraction } from './dmHubShared.js';
import {
  startAddWizard,
  startSourcePickWizard,
} from './productionWizard.js';

export const DM_PRODUCTION_HUB_PREFIX = 'dph:';

type ProductionHubAction = 'add' | 'workers' | 'yield' | 'remove';

export async function startProductionHub(
  interaction: ChatInputCommandInteraction,
  production: ProductionService,
): Promise<void> {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${DM_PRODUCTION_HUB_PREFIX}pick:${interaction.user.id}`)
      .setPlaceholder(production.messages.dmProductionHubPlaceholder.slice(0, 150))
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(production.messages.dmProductionHubOptAdd.slice(0, 100))
          .setValue('add')
          .setDescription(production.messages.dmProductionHubOptAddDesc.slice(0, 100)),
        new StringSelectMenuOptionBuilder()
          .setLabel(production.messages.dmProductionHubOptWorkers.slice(0, 100))
          .setValue('workers')
          .setDescription(
            production.messages.dmProductionHubOptWorkersDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(production.messages.dmProductionHubOptYield.slice(0, 100))
          .setValue('yield')
          .setDescription(
            production.messages.dmProductionHubOptYieldDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(production.messages.dmProductionHubOptRemove.slice(0, 100))
          .setValue('remove')
          .setDescription(
            production.messages.dmProductionHubOptRemoveDesc.slice(0, 100),
          ),
      ),
  );

  await interaction.reply({
    content: production.messages.dmProductionHubPrompt,
    components: [row],
    ephemeral: true,
  });
}

export async function handleProductionHubSelect(
  interaction: StringSelectMenuInteraction,
  deps: {
    production: ProductionService;
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { production, resources, config } = deps;
  if (!interaction.customId.startsWith(DM_PRODUCTION_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_PRODUCTION_HUB_PREFIX.length).split(':');
  const [step, userId] = parts;
  if (!hubOwnerOk(interaction, userId!)) {
    await interaction.reply({
      content: production.messages.dmProductionHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: production.messages.guildOnly, ephemeral: true });
    return;
  }
  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({ content: production.messages.unauthorized, ephemeral: true });
    return;
  }
  if (step !== 'pick') {
    await hubMessage(interaction, { content: production.messages.unknownSubcommand });
    return;
  }

  const action = interaction.values[0] as ProductionHubAction;
  if (action === 'add') {
    await startAddWizard(interaction as HubStartInteraction, { production, resources });
    return;
  }
  if (action === 'workers' || action === 'yield' || action === 'remove') {
    await startSourcePickWizard(interaction as HubStartInteraction, { production }, action);
    return;
  }
  await hubMessage(interaction, { content: production.messages.unknownSubcommand });
}
