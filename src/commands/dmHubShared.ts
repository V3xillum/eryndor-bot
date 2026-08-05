import {
  type ActionRowBuilder,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';

/** Slash menu entry or a follow-up select from a DM hub. */
export type HubStartInteraction =
  | ChatInputCommandInteraction
  | StringSelectMenuInteraction;

export async function hubMessage(
  interaction: HubStartInteraction,
  data: {
    content: string;
    components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  },
): Promise<void> {
  if (interaction.isChatInputCommand()) {
    await interaction.reply({
      content: data.content,
      components: data.components ?? [],
      ephemeral: true,
    });
    return;
  }
  await interaction.update({
    content: data.content,
    components: data.components ?? [],
  });
}

export function hubOwnerOk(
  interaction: StringSelectMenuInteraction | { user: { id: string } },
  userId: string,
): boolean {
  return userId === interaction.user.id;
}
