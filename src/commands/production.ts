import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { ProductionService } from '../services/ProductionService.js';
import type { ResourceService } from '../services/ResourceService.js';
import {
  buildProductionListEmbed,
  startAddWizard,
  startSourcePickWizard,
} from './productionWizard.js';

const ADMIN_SUBCOMMANDS = new Set(['add', 'workers', 'yield', 'remove']);

export function buildProductionCommand() {
  return new SlashCommandBuilder()
    .setName('productie')
    .setDescription('Bronnen die tussen sessies grondstoffen opleveren')
    .addSubcommand((sub) =>
      sub
        .setName('lijst')
        .setDescription('Welke productiebronnen heeft de guild?'),
    );
}

export async function handleProductionCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    production: ProductionService;
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { production, resources, config } = deps;
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: production.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (
    ADMIN_SUBCOMMANDS.has(sub) &&
    !config.allowedUserIds.includes(interaction.user.id)
  ) {
    await interaction.reply({
      content: production.messages.unauthorized,
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      await startAddWizard(interaction, { production, resources });
      return;
    case 'lijst': {
      const embed = buildProductionListEmbed(
        production,
        resources,
        interaction.guildId,
      );
      if (!embed) {
        await interaction.reply({
          content: production.messages.productionListEmpty,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    case 'workers':
      await startSourcePickWizard(interaction, { production }, 'workers');
      return;
    case 'yield':
      await startSourcePickWizard(interaction, { production }, 'yield');
      return;
    case 'remove':
      await startSourcePickWizard(interaction, { production }, 'remove');
      return;
    default:
      await interaction.reply({
        content: production.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}
