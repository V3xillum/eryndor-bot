import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { WeatherService } from '../services/WeatherService.js';
import { formatTemplate } from '../utils/helpers.js';

export function buildEryndorCommand() {
  return new SlashCommandBuilder()
    .setName('eryndor')
    .setDescription('Eryndor bot overview and help')
    .addSubcommand((sub) =>
      sub
        .setName('help')
        .setDescription('Command overview; DMs also get the handout link'),
    );
}

export async function handleEryndorCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    weather: WeatherService;
    config: AppConfig;
  },
): Promise<void> {
  const { weather, config } = deps;
  const sub = interaction.options.getSubcommand();

  if (!interaction.guildId) {
    await interaction.reply({
      content: weather.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'help') {
    await handleHelp(interaction, weather, config);
    return;
  }

  await interaction.reply({
    content: weather.messages.unknownSubcommand,
    ephemeral: true,
  });
}

async function handleHelp(
  interaction: ChatInputCommandInteraction,
  weather: WeatherService,
  config: AppConfig,
): Promise<void> {
  const isDm = config.allowedUserIds.includes(interaction.user.id);
  const embed = new EmbedBuilder().setTitle(weather.messages.helpEmbedTitle);

  if (isDm) {
    const url = config.handoutUrl;
    embed
      .setURL(url)
      .setDescription(formatTemplate(weather.messages.helpEmbedDescription, { url }))
      .addFields(
        {
          name: weather.messages.helpFieldEveryone,
          value: weather.messages.helpEveryoneBody,
        },
        {
          name: weather.messages.helpFieldDm,
          value: weather.messages.helpDmBody,
        },
      );
  } else {
    embed
      .setDescription(weather.messages.helpEmbedDescriptionPlayer)
      .addFields({
        name: weather.messages.helpFieldPlayer,
        value: weather.messages.helpEveryoneBody,
      });
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}
