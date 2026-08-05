import {
  ActionRowBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { BuildingService } from '../services/BuildingService.js';
import type { ResourceService } from '../services/ResourceService.js';
import { formatTemplate } from '../utils/helpers.js';
import { addModalIntro } from '../utils/modalIntro.js';
import {
  startCostAddWizard,
  startCostTimeWizard,
  startFundingAdjustWizard,
  startSpentAdjustWizard,
} from './buildingWizard.js';
import { hubMessage, hubOwnerOk } from './dmHubShared.js';
import { guildNickname } from './resourceEmbeds.js';

export const DM_BUILDING_HUB_PREFIX = 'dbh:';

type BuildingHubAction =
  | 'create'
  | 'cancel'
  | 'cost_add'
  | 'buildtime'
  | 'funding'
  | 'spent';

function nicknameFrom(
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
): string {
  const member =
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as GuildMember)
      : null;
  const apiNick =
    interaction.member && 'nick' in interaction.member
      ? (interaction.member.nick as string | null | undefined)
      : null;
  return guildNickname(member, interaction.user, apiNick);
}

export async function startBuildingHub(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${DM_BUILDING_HUB_PREFIX}pick:${interaction.user.id}`)
      .setPlaceholder(buildings.messages.dmBuildingHubPlaceholder.slice(0, 150))
      .addOptions(
        opt(buildings.messages.dmBuildingHubOptCreate, 'create', buildings.messages.dmBuildingHubOptCreateDesc),
        opt(buildings.messages.dmBuildingHubOptCancel, 'cancel', buildings.messages.dmBuildingHubOptCancelDesc),
        opt(buildings.messages.dmBuildingHubOptCostAdd, 'cost_add', buildings.messages.dmBuildingHubOptCostAddDesc),
        opt(buildings.messages.dmBuildingHubOptBuildtime, 'buildtime', buildings.messages.dmBuildingHubOptBuildtimeDesc),
        opt(buildings.messages.dmBuildingHubOptFunding, 'funding', buildings.messages.dmBuildingHubOptFundingDesc),
        opt(buildings.messages.dmBuildingHubOptSpent, 'spent', buildings.messages.dmBuildingHubOptSpentDesc),
      ),
  );

  await interaction.reply({
    content: buildings.messages.dmBuildingHubPrompt,
    components: [row],
    ephemeral: true,
  });
}

function opt(label: string, value: string, desc: string): StringSelectMenuOptionBuilder {
  return new StringSelectMenuOptionBuilder()
    .setLabel(label.slice(0, 100))
    .setValue(value)
    .setDescription(desc.slice(0, 100));
}

export async function handleBuildingHubSelect(
  interaction: StringSelectMenuInteraction,
  deps: {
    buildings: BuildingService;
    resources: ResourceService;
    config: AppConfig;
  },
): Promise<void> {
  const { buildings, resources, config } = deps;
  if (!interaction.customId.startsWith(DM_BUILDING_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_BUILDING_HUB_PREFIX.length).split(':');
  const [step, userId] = parts;
  if (!hubOwnerOk(interaction, userId!)) {
    await interaction.reply({
      content: buildings.messages.dmBuildingHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: buildings.messages.guildOnly, ephemeral: true });
    return;
  }
  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({ content: buildings.messages.unauthorized, ephemeral: true });
    return;
  }

  if (step === 'cancel') {
    const buildingId = Number(interaction.values[0]);
    const building = buildings.getInGuild(interaction.guildId, buildingId);
    if (!building) {
      await interaction.update({
        content: buildings.messages.buildingWizardBuildingGone,
        components: [],
      });
      return;
    }
    const result = buildings.cancel({
      guildId: interaction.guildId,
      buildingName: building.name,
      actorUserId: interaction.user.id,
      actorNickname: nicknameFrom(interaction),
    });
    await interaction.update({
      content: result.ok
        ? formatTemplate(buildings.messages.buildingCancelSuccess, {
            name: result.building.name,
          })
        : result.message,
      components: [],
    });
    return;
  }

  if (step !== 'pick') {
    await interaction.update({
      content: buildings.messages.unknownSubcommand,
      components: [],
    });
    return;
  }

  const action = interaction.values[0] as BuildingHubAction;

  if (action === 'create') {
    await interaction.showModal(buildCreateModal(buildings, interaction.user.id));
    return;
  }

  if (action === 'cancel') {
    const list = buildings
      .list(interaction.guildId)
      .filter((b) => b.status === 'funding' || b.status === 'building')
      .slice(0, 25);
    if (list.length === 0) {
      await hubMessage(interaction, {
        content: buildings.messages.dmBuildingHubNoCancelable,
      });
      return;
    }
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${DM_BUILDING_HUB_PREFIX}cancel:${interaction.user.id}`)
        .setPlaceholder(buildings.messages.buildingWizardBuildingPlaceholder.slice(0, 150))
        .addOptions(
          list.map((b) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(b.name.slice(0, 100))
              .setValue(String(b.id))
              .setDescription(buildings.statusLabel(b.status).slice(0, 100)),
          ),
        ),
    );
    await hubMessage(interaction, {
      content: buildings.messages.dmBuildingHubCancelPick,
      components: [row],
    });
    return;
  }

  if (action === 'cost_add') {
    await startCostAddWizard(interaction, { buildings, resources });
    return;
  }
  if (action === 'buildtime') {
    await startCostTimeWizard(interaction, { buildings, resources });
    return;
  }
  if (action === 'funding') {
    await startFundingAdjustWizard(interaction, { buildings, resources });
    return;
  }
  if (action === 'spent') {
    await startSpentAdjustWizard(interaction, { buildings, resources });
    return;
  }

  await hubMessage(interaction, { content: buildings.messages.unknownSubcommand });
}

export async function handleBuildingHubModal(
  interaction: ModalSubmitInteraction,
  deps: {
    buildings: BuildingService;
    config: AppConfig;
  },
): Promise<void> {
  const { buildings, config } = deps;
  if (!interaction.customId.startsWith(DM_BUILDING_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_BUILDING_HUB_PREFIX.length).split(':');
  const [step, userId] = parts;
  if (!hubOwnerOk(interaction, userId!)) {
    await interaction.reply({
      content: buildings.messages.dmBuildingHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: buildings.messages.guildOnly, ephemeral: true });
    return;
  }
  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({ content: buildings.messages.unauthorized, ephemeral: true });
    return;
  }
  if (step !== 'create') {
    await interaction.reply({
      content: buildings.messages.unknownSubcommand,
      ephemeral: true,
    });
    return;
  }

  const name = interaction.fields.getTextInputValue('name').trim();
  const result = buildings.create({
    guildId: interaction.guildId,
    name,
    actorUserId: interaction.user.id,
    actorNickname: nicknameFrom(interaction),
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingCreateSuccess, {
      name: result.building.name,
      time: String(result.building.time_required),
    }),
    ephemeral: true,
  });
}

function buildCreateModal(buildings: BuildingService, userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${DM_BUILDING_HUB_PREFIX}create:${userId}`)
    .setTitle(buildings.messages.dmBuildingHubCreateTitle.slice(0, 45));
  addModalIntro(modal, buildings.messages.dmBuildingHubCreateIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(buildings.messages.dmBuildingHubCreateNameLabel.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(64),
      ),
  );
  return modal;
}
