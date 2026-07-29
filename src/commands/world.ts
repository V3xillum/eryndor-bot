import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  CalendarFetchError,
  type EryndorCalendarService,
} from '../services/EryndorCalendarService.js';

export function buildWorldCommand() {
  return new SlashCommandBuilder()
    .setName('world')
    .setDescription('Eryndor calendar and world info')
    .addSubcommand((sub) =>
      sub
        .setName('today')
        .setDescription('Show the current Harptos day, moon phase, and events'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fullmoon')
        .setDescription('Show the next exact Full Moon on the Eryndor calendar'),
    );
}

export async function handleWorldCommand(
  interaction: ChatInputCommandInteraction,
  calendar: EryndorCalendarService,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'today':
      await handleToday(interaction, calendar);
      return;
    case 'fullmoon':
      await handleFullMoon(interaction, calendar);
      return;
    default:
      await interaction.reply({
        content: calendar.messages.unknownSubcommand,
        ephemeral: true,
      });
  }
}

async function handleToday(
  interaction: ChatInputCommandInteraction,
  calendar: EryndorCalendarService,
): Promise<void> {
  await interaction.deferReply();

  try {
    const day = await calendar.getToday();
    await interaction.editReply({ embeds: [calendar.buildTodayEmbed(day)] });
  } catch (error) {
    if (error instanceof CalendarFetchError) {
      await interaction.editReply({ content: calendar.messages.calendarLoadError });
      return;
    }
    throw error;
  }
}

async function handleFullMoon(
  interaction: ChatInputCommandInteraction,
  calendar: EryndorCalendarService,
): Promise<void> {
  await interaction.deferReply();

  try {
    const next = await calendar.getNextFullMoon();
    await interaction.editReply({ embeds: [calendar.buildFullMoonEmbed(next)] });
  } catch (error) {
    if (error instanceof CalendarFetchError) {
      await interaction.editReply({ content: calendar.messages.calendarLoadError });
      return;
    }
    throw error;
  }
}
