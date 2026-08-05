import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type ChannelSelectMenuInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { ResourceService } from '../services/ResourceService.js';
import type { WeatherService } from '../services/WeatherService.js';
import { formatTemplate } from '../utils/helpers.js';
import { hubMessage, hubOwnerOk } from './dmHubShared.js';

export const DM_SETUP_HUB_PREFIX = 'dsetup:';

type SetupKind = 'weather' | 'calendar' | 'resource';

function isSetupKind(value: string): value is SetupKind {
  return value === 'weather' || value === 'calendar' || value === 'resource';
}

function destinationLabel(
  weather: WeatherService,
  resources: ResourceService,
  guildId: string,
): string {
  const state = weather.getWorldState(guildId);
  const weatherTarget = state?.thread_id
    ? `<#${state.thread_id}>`
    : state?.channel_id
      ? `<#${state.channel_id}>`
      : weather.messages.dmSetupHubUnset;
  const calendarTarget = state?.calendar_channel_id
    ? `<#${state.calendar_channel_id}>`
    : weather.messages.dmSetupHubUnset;
  const resourceSettings = resources.getSettings(guildId);
  const resourceTarget = resourceSettings?.channel_id
    ? `<#${resourceSettings.channel_id}>`
    : weather.messages.dmSetupHubUnset;

  return [
    formatTemplate(weather.messages.dmSetupHubLineWeather, { target: weatherTarget }),
    formatTemplate(weather.messages.dmSetupHubLineCalendar, { target: calendarTarget }),
    formatTemplate(weather.messages.dmSetupHubLineResource, { target: resourceTarget }),
  ].join('\n');
}

/** `/dm setup menu` — overzicht + zetten/wissen van bestemmingskanalen. */
export async function startSetupHub(
  interaction: ChatInputCommandInteraction,
  deps: { weather: WeatherService; resources: ResourceService },
): Promise<void> {
  const { weather, resources } = deps;
  const guildId = interaction.guildId!;
  const status = destinationLabel(weather, resources, guildId);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${DM_SETUP_HUB_PREFIX}pick:${interaction.user.id}`)
      .setPlaceholder(weather.messages.dmSetupHubPlaceholder.slice(0, 150))
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.dmSetupHubOptWeather.slice(0, 100))
          .setValue('weather')
          .setDescription(weather.messages.dmSetupHubOptWeatherDesc.slice(0, 100)),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.dmSetupHubOptCalendar.slice(0, 100))
          .setValue('calendar')
          .setDescription(weather.messages.dmSetupHubOptCalendarDesc.slice(0, 100)),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.dmSetupHubOptResource.slice(0, 100))
          .setValue('resource')
          .setDescription(weather.messages.dmSetupHubOptResourceDesc.slice(0, 100)),
      ),
  );

  await interaction.reply({
    content: `**${weather.messages.dmSetupHubTitle}**\n${status}\n\n${weather.messages.dmSetupHubPrompt}`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleSetupHubSelect(
  interaction: StringSelectMenuInteraction,
  deps: {
    weather: WeatherService;
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { weather, resources, config } = deps;
  if (!interaction.customId.startsWith(DM_SETUP_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_SETUP_HUB_PREFIX.length).split(':');
  const [step, a, b] = parts;

  if (step === 'pick') {
    if (!hubOwnerOk(interaction, a!)) {
      await interaction.reply({
        content: weather.messages.dmSetupHubNotYours,
        ephemeral: true,
      });
      return;
    }
    if (!(await assertDm(interaction, deps))) return;
    const kind = interaction.values[0]!;
    if (!isSetupKind(kind)) {
      await hubMessage(interaction, { content: weather.messages.unknownSubcommand });
      return;
    }
    await showActMenu(interaction, weather, kind);
    return;
  }

  if (step === 'act') {
    const kind = a!;
    const userId = b!;
    if (!hubOwnerOk(interaction, userId) || !isSetupKind(kind)) {
      await interaction.reply({
        content: weather.messages.dmSetupHubNotYours,
        ephemeral: true,
      });
      return;
    }
    if (!(await assertDm(interaction, deps))) return;
    const act = interaction.values[0];
    if (act === 'clear') {
      await clearKind(interaction, deps, kind);
      return;
    }
    if (act === 'set') {
      await showChannelPick(interaction, weather, kind);
      return;
    }
    await hubMessage(interaction, { content: weather.messages.unknownSubcommand });
    return;
  }

  await hubMessage(interaction, { content: weather.messages.unknownSubcommand });
}

export async function handleSetupHubChannelSelect(
  interaction: ChannelSelectMenuInteraction,
  deps: {
    weather: WeatherService;
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { weather, resources, config } = deps;
  if (!interaction.customId.startsWith(DM_SETUP_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_SETUP_HUB_PREFIX.length).split(':');
  const [step, kind, userId] = parts;
  if (step !== 'ch' || !hubOwnerOk(interaction, userId!) || !isSetupKind(kind!)) {
    await interaction.reply({
      content: weather.messages.dmSetupHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!(await assertDm(interaction, deps))) return;
  if (!interaction.guildId) {
    await interaction.reply({ content: weather.messages.guildOnly, ephemeral: true });
    return;
  }

  const channel = interaction.channels.first();
  if (!channel) {
    await interaction.update({
      content: weather.messages.unknownSubcommand,
      components: [],
    });
    return;
  }

  const isThread =
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread;
  const parentId =
    'parentId' in channel && typeof channel.parentId === 'string'
      ? channel.parentId
      : null;

  if (kind === 'weather') {
    if (isThread) {
      if (!parentId) {
        await interaction.update({
          content: weather.messages.dmSetupHubWeatherThreadNoParent,
          components: [],
        });
        return;
      }
      weather.setup(interaction.guildId, parentId, channel.id);
    } else {
      weather.setup(interaction.guildId, channel.id, null);
    }
    const state = weather.getWorldState(interaction.guildId);
    if (!state?.next_update_at) {
      weather.scheduleNextUpdate(interaction.guildId);
    }
    await interaction.update({
      content: formatTemplate(weather.messages.setupSuccess, {
        target: `<#${channel.id}>`,
      }),
      components: [],
    });
    return;
  }

  if (kind === 'calendar') {
    if (isThread) {
      await interaction.update({
        content: weather.messages.dmSetupHubCalendarNoThread,
        components: [],
      });
      return;
    }
    weather.setupCalendarChannel(interaction.guildId, channel.id);
    await interaction.update({
      content: formatTemplate(weather.messages.calendarSetupSuccess, {
        target: `<#${channel.id}>`,
      }),
      components: [],
    });
    return;
  }

  if (isThread) {
    await interaction.update({
      content: weather.messages.dmSetupHubResourceNoThread,
      components: [],
    });
    return;
  }
  resources.setup(interaction.guildId, channel.id);
  await interaction.update({
    content: formatTemplate(resources.messages.resourceSetupSuccess, {
      target: `<#${channel.id}>`,
    }),
    components: [],
  });
}

async function showActMenu(
  interaction: StringSelectMenuInteraction,
  weather: WeatherService,
  kind: SetupKind,
): Promise<void> {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${DM_SETUP_HUB_PREFIX}act:${kind}:${interaction.user.id}`)
      .setPlaceholder(weather.messages.dmSetupHubActPlaceholder.slice(0, 150))
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.dmSetupHubActSet.slice(0, 100))
          .setValue('set')
          .setDescription(weather.messages.dmSetupHubActSetDesc.slice(0, 100)),
        new StringSelectMenuOptionBuilder()
          .setLabel(weather.messages.dmSetupHubActClear.slice(0, 100))
          .setValue('clear')
          .setDescription(weather.messages.dmSetupHubActClearDesc.slice(0, 100)),
      ),
  );
  await hubMessage(interaction, {
    content: actPrompt(weather, kind),
    components: [row],
  });
}

async function showChannelPick(
  interaction: StringSelectMenuInteraction,
  weather: WeatherService,
  kind: SetupKind,
): Promise<void> {
  const builder = new ChannelSelectMenuBuilder()
    .setCustomId(`${DM_SETUP_HUB_PREFIX}ch:${kind}:${interaction.user.id}`)
    .setPlaceholder(weather.messages.dmSetupHubChannelPlaceholder.slice(0, 150))
    .setMinValues(1)
    .setMaxValues(1);

  if (kind === 'weather') {
    builder.setChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    );
  } else {
    builder.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  }

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(builder);
  await hubMessage(interaction, {
    content: channelPrompt(weather, kind),
    components: [row],
  });
}

async function clearKind(
  interaction: StringSelectMenuInteraction,
  deps: {
    weather: WeatherService;
    resources: ResourceService;
    config: AppConfig;
  },
  kind: SetupKind,
): Promise<void> {
  const { weather, resources } = deps;
  if (!interaction.guildId) {
    await hubMessage(interaction, { content: weather.messages.guildOnly });
    return;
  }

  if (kind === 'weather') {
    const cleared = weather.clearWeatherDestination(interaction.guildId);
    await hubMessage(interaction, {
      content: cleared
        ? weather.messages.dmSetupHubWeatherClearSuccess
        : weather.messages.dmSetupHubWeatherClearNone,
    });
    return;
  }
  if (kind === 'calendar') {
    const cleared = weather.clearCalendarChannel(interaction.guildId);
    await hubMessage(interaction, {
      content: cleared
        ? weather.messages.calendarClearSuccess
        : weather.messages.calendarClearNone,
    });
    return;
  }
  const cleared = resources.clear(interaction.guildId);
  await hubMessage(interaction, {
    content: cleared
      ? resources.messages.resourceClearSuccess
      : resources.messages.resourceClearNone,
  });
}

function actPrompt(weather: WeatherService, kind: SetupKind): string {
  if (kind === 'weather') return weather.messages.dmSetupHubActPromptWeather;
  if (kind === 'calendar') return weather.messages.dmSetupHubActPromptCalendar;
  return weather.messages.dmSetupHubActPromptResource;
}

function channelPrompt(weather: WeatherService, kind: SetupKind): string {
  if (kind === 'weather') return weather.messages.dmSetupHubChannelPromptWeather;
  if (kind === 'calendar') return weather.messages.dmSetupHubChannelPromptCalendar;
  return weather.messages.dmSetupHubChannelPromptResource;
}

async function assertDm(
  interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction,
  deps: { weather: WeatherService; config: AppConfig },
): Promise<boolean> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: deps.weather.messages.guildOnly,
      ephemeral: true,
    });
    return false;
  }
  if (!deps.config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({
      content: deps.weather.messages.unauthorized,
      ephemeral: true,
    });
    return false;
  }
  return true;
}
