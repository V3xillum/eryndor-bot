import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { BuildingService } from '../services/BuildingService.js';
import type { ResourceService } from '../services/ResourceService.js';
import { formatTemplate } from '../utils/helpers.js';
import {
  buildBuildingDonateEmbed,
  buildBuildingFundEmbed,
  buildContributeEmbed,
  guildNickname,
  postSilentEmbed,
} from './resourceEmbeds.js';

export const BUILDING_WIZARD_PREFIX = 'bwiz:';

type MaterialAction = 'donate' | 'fund';

function nicknameFrom(
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction
    | ButtonInteraction,
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

function buildingSelectRow(
  customId: string,
  placeholder: string,
  options: StringSelectMenuOptionBuilder[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options.slice(0, 25)),
  );
}

export async function startMaterialWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  action: MaterialAction,
): Promise<void> {
  const { buildings, resources } = deps;

  if (!(await ensureResourceChannel(interaction, resources))) return;

  const choices = buildings.listFundingChoices(interaction.guildId!);
  if (choices.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingWizardNoFunding,
      ephemeral: true,
    });
    return;
  }

  const options = choices.map((b) => {
    const missing = buildings.listMissingMaterials(b.id);
    const summary = missing
      .slice(0, 3)
      .map((m) => `${m.required - m.funded} ${m.displayName}`)
      .join(', ');
    return new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription((summary || 'Materialen').slice(0, 100));
  });

  const customId = `${BUILDING_WIZARD_PREFIX}${action}:bldg:${interaction.user.id}`;
  await interaction.reply({
    content: buildings.messages.buildingWizardPickBuilding,
    components: [
      buildingSelectRow(
        customId,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

export async function startContributeWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings, resources } = deps;

  if (!(await ensureResourceChannel(interaction, resources))) return;

  const choices = buildings.listContributeChoices(interaction.guildId!);
  if (choices.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingWizardNoBuilding,
      ephemeral: true,
    });
    return;
  }

  const options = choices.map((b) => {
    const left = b.time_required - b.time_spent;
    return new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardTimeLeft, {
          left: String(left),
          total: String(b.time_required),
        }).slice(0, 100),
      );
  });

  const customId = `${BUILDING_WIZARD_PREFIX}contribute:bldg:${interaction.user.id}`;
  await interaction.reply({
    content: buildings.messages.buildingWizardPickBuildingTime,
    components: [
      buildingSelectRow(
        customId,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

export async function startCostAddWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings, resources } = deps;

  const buildingsList = buildings.listCostEditableBuildings(interaction.guildId!);
  if (buildingsList.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingWizardNoCostEditable,
      ephemeral: true,
    });
    return;
  }

  const types = resources.listTypes(interaction.guildId!);
  if (types.length === 0) {
    await interaction.reply({
      content: resources.messages.resourceTypeListEmpty,
      ephemeral: true,
    });
    return;
  }

  const options = buildingsList.map((b) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(buildings.messages.buildingStatusFunding.slice(0, 100)),
  );

  const customId = `${BUILDING_WIZARD_PREFIX}costadd:bldg:${interaction.user.id}`;
  await interaction.reply({
    content: buildings.messages.buildingWizardPickBuildingCost,
    components: [
      buildingSelectRow(
        customId,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

export async function startCostTimeWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;

  const buildingsList = buildings.listCostEditableBuildings(interaction.guildId!);
  if (buildingsList.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingWizardNoCostEditable,
      ephemeral: true,
    });
    return;
  }

  const options = buildingsList.map((b) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(buildings.messages.buildingStatusFunding.slice(0, 100)),
  );

  const customId = `${BUILDING_WIZARD_PREFIX}costtime:bldg:${interaction.user.id}`;
  await interaction.reply({
    content: buildings.messages.buildingWizardPickBuildingBuildtime,
    components: [
      buildingSelectRow(
        customId,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

export async function startCostShowWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;
  const list = buildings.list(interaction.guildId!).filter((b) => b.status !== 'cancelled');
  if (list.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingListEmpty,
      ephemeral: true,
    });
    return;
  }

  const options = list.map((b) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(buildings.statusLabel(b.status).slice(0, 100)),
  );

  const customId = `${BUILDING_WIZARD_PREFIX}costshow:bldg:${interaction.user.id}:0`;
  await interaction.reply({
    content: buildings.messages.buildingWizardPickBuildingShow,
    components: [
      buildingSelectRow(
        customId,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

export async function handleBuildingWizardSelect(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  if (!interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) return;
  if (!interaction.guildId) {
    await interaction.reply({
      content: deps.buildings.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const parts = interaction.customId.slice(BUILDING_WIZARD_PREFIX.length).split(':');
  // Flows: action:step:userId[:buildingId][:extra]
  const [action, step, userId, buildingIdRaw] = parts;

  if (userId !== interaction.user.id) {
    await interaction.reply({
      content: deps.buildings.messages.buildingWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  // Cost add: building → modal (type + amount)
  if (action === 'costadd' && step === 'bldg') {
    await showCostTypeAmountModal(interaction, deps, Number(interaction.values[0]));
    return;
  }

  // Cost buildtime: building → modal
  if (action === 'costtime' && step === 'bldg') {
    await showCostTimeModal(interaction, deps, Number(interaction.values[0]));
    return;
  }

  if (action === 'costshow' && step === 'bldg') {
    await finishCostShow(interaction, deps, Number(interaction.values[0]));
    return;
  }

  // Donate / fund: building → resource → modal
  if (step === 'bldg' && (action === 'donate' || action === 'fund')) {
    await showResourceSelect(interaction, deps, action);
    return;
  }

  if (step === 'res' && (action === 'donate' || action === 'fund')) {
    await showMaterialAmountModal(
      interaction,
      deps,
      action,
      Number(buildingIdRaw),
    );
    return;
  }

  // Contribute: building → modal
  if (step === 'bldg' && action === 'contribute') {
    await showContributeAmountModal(
      interaction,
      deps,
      Number(interaction.values[0]),
    );
    return;
  }

  await interaction.update({
    content: deps.buildings.messages.unknownSubcommand,
    components: [],
  });
}

export async function handleBuildingWizardModal(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  if (!interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) return;
  if (!interaction.guildId) {
    await interaction.reply({
      content: deps.buildings.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const parts = interaction.customId.slice(BUILDING_WIZARD_PREFIX.length).split(':');
  const [action, step, userId, buildingIdRaw] = parts;

  if (userId !== interaction.user.id) {
    await interaction.reply({
      content: deps.buildings.messages.buildingWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  if (action === 'costadd' && step === 'amount') {
    let typeRaw = '';
    try {
      typeRaw = interaction.fields.getTextInputValue('type').trim();
    } catch {
      await interaction.reply({
        content: deps.buildings.messages.resourceTypeUnknown.replace('{key}', '?'),
        ephemeral: true,
      });
      return;
    }
    const raw = interaction.fields.getTextInputValue('amount').trim();
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    await finishCostAdd(interaction, deps, Number(buildingIdRaw), typeRaw, amount);
    return;
  }

  const raw = interaction.fields.getTextInputValue('amount').trim();
  const amount = Number(raw);
  if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
    await interaction.reply({
      content: deps.buildings.messages.resourceInvalidAmount,
      ephemeral: true,
    });
    return;
  }

  if (action === 'costtime' && step === 'amount') {
    await finishCostTime(interaction, deps, Number(buildingIdRaw), amount);
    return;
  }

  const resourceKey = parts[4];

  if (
    (action === 'donate' || action === 'fund') &&
    step === 'amount' &&
    resourceKey
  ) {
    await finishMaterialAction(
      interaction,
      deps,
      action,
      Number(buildingIdRaw),
      resourceKey,
      amount,
    );
    return;
  }

  if (action === 'contribute' && step === 'amount') {
    await finishContribute(
      interaction,
      deps,
      Number(buildingIdRaw),
      amount,
    );
    return;
  }

  await interaction.reply({
    content: deps.buildings.messages.unknownSubcommand,
    ephemeral: true,
  });
}

export async function handleBuildingWizardButton(
  interaction: ButtonInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  if (!interaction.customId.startsWith(BUILDING_WIZARD_PREFIX)) return;
  if (!interaction.guildId) {
    await interaction.reply({
      content: deps.buildings.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const parts = interaction.customId.slice(BUILDING_WIZARD_PREFIX.length).split(':');
  const [action, step, userId, buildingIdRaw] = parts;

  if (userId !== interaction.user.id) {
    await interaction.reply({
      content: deps.buildings.messages.buildingWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  if (action === 'costadd' && step === 'again') {
    await showCostTypeAmountModal(interaction, deps, Number(buildingIdRaw));
    return;
  }

  await interaction.reply({
    content: deps.buildings.messages.unknownSubcommand,
    ephemeral: true,
  });
}

async function showCostTypeAmountModal(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building || building.status !== 'funding') {
    if (interaction.isStringSelectMenu()) {
      await interaction.update({
        content: buildings.messages.buildingWizardBuildingGone,
        components: [],
      });
    } else {
      await interaction.reply({
        content: buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
    }
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}costadd:amount:${interaction.user.id}:${buildingId}`,
    )
    .setTitle(
      formatTemplate(buildings.messages.buildingWizardCostModalTitle, {
        building: building.name,
      }).slice(0, 45),
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('type')
          .setLabel(buildings.messages.buildingWizardCostTypeLabel.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
          .setPlaceholder('Hout'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(buildings.messages.buildingWizardCostAmountLabel.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
          .setPlaceholder('80'),
      ),
    );

  await interaction.showModal(modal);
}

async function showCostTimeModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}costtime:amount:${interaction.user.id}:${buildingId}`,
    )
    .setTitle(buildings.messages.buildingWizardBuildtimeModalTitle.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(
            formatTemplate(buildings.messages.buildingWizardBuildtimeModalLabel, {
              building: building?.name ?? '?',
            }).slice(0, 45),
          )
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
          .setPlaceholder('100')
          .setValue(String(building?.time_required || 100)),
      ),
    );

  await interaction.showModal(modal);
}

async function finishCostAdd(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  typeRaw: string,
  amount: number,
): Promise<void> {
  const { buildings } = deps;
  const nickname = nicknameFrom(interaction);
  const result = buildings.addCostById({
    guildId: interaction.guildId!,
    buildingId,
    keyRaw: typeRaw,
    amount,
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  const againRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${BUILDING_WIZARD_PREFIX}costadd:again:${interaction.user.id}:${buildingId}`,
      )
      .setLabel(buildings.messages.buildingWizardCostAddAnother.slice(0, 80))
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingCostAddSuccess, {
      building: result.building.name,
      amount: String(result.amount),
      type: result.type.display_name,
    }),
    components: [againRow],
    ephemeral: true,
  });
}

async function finishCostTime(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  units: number,
): Promise<void> {
  const { buildings } = deps;
  const nickname = nicknameFrom(interaction);
  const result = buildings.setTimeById({
    guildId: interaction.guildId!,
    buildingId,
    timeUnits: units,
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingCostBuildtimeSuccess, {
      building: result.building.name,
      time: String(result.time),
    }),
    ephemeral: true,
  });
}

async function finishCostShow(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const detail = buildings.detailById(interaction.guildId!, buildingId);
  if (!detail.ok) {
    await interaction.update({ content: detail.message, components: [] });
    return;
  }

  const { building, materials, statusLabel } = detail;
  const materialLines =
    materials.length === 0
      ? [buildings.messages.buildingCostShowEmpty]
      : materials.map((m) =>
          formatTemplate(buildings.messages.buildingCostShowLine, {
            type: m.displayName,
            funded: String(m.funded),
            required: String(m.required),
          }),
        );

  const timeLine = formatTemplate(buildings.messages.buildingCostShowTime, {
    spent: String(building.time_spent),
    required: String(building.time_required),
    status: statusLabel,
  });

  const embed = new EmbedBuilder()
    .setTitle(
      formatTemplate(buildings.messages.buildingCostShowTitle, {
        name: building.name,
      }),
    )
    .setDescription([...materialLines, '', timeLine].join('\n').slice(0, 4000));

  await interaction.update({
    content: null,
    embeds: [embed],
    components: [],
  });
}

async function showResourceSelect(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  action: MaterialAction,
): Promise<void> {
  const { buildings } = deps;
  const buildingId = Number(interaction.values[0]);
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building || building.status !== 'funding') {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  const missing = buildings.listMissingMaterials(buildingId);
  if (missing.length === 0) {
    await interaction.update({
      content: buildings.messages.buildingWizardNoMissing,
      components: [],
    });
    return;
  }

  const options = missing.map((m) => {
    const left = m.required - m.funded;
    return new StringSelectMenuOptionBuilder()
      .setLabel(m.displayName.slice(0, 100))
      .setValue(m.resourceKey)
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardStillNeeded, {
          left: String(left),
          required: String(m.required),
        }).slice(0, 100),
      );
  });

  const customId = `${BUILDING_WIZARD_PREFIX}${action}:res:${interaction.user.id}:${buildingId}`;
  await interaction.update({
    content: formatTemplate(buildings.messages.buildingWizardPickResource, {
      building: building.name,
    }),
    components: [
      buildingSelectRow(
        customId,
        buildings.messages.buildingWizardResourcePlaceholder,
        options,
      ),
    ],
  });
}

async function showMaterialAmountModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  action: MaterialAction,
  buildingId: number,
): Promise<void> {
  const { buildings, resources } = deps;
  const resourceKey = interaction.values[0];
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  const type = resources.listTypes(interaction.guildId!).find((t) => t.key === resourceKey);
  const label = type?.display_name ?? resourceKey;
  const missing = buildings.listMissingMaterials(buildingId);
  const row = missing.find((m) => m.resourceKey === resourceKey);
  const left = row ? row.required - row.funded : '?';

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}${action}:amount:${interaction.user.id}:${buildingId}:${resourceKey}`,
    )
    .setTitle(buildings.messages.buildingWizardMaterialModalTitle.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(
            formatTemplate(buildings.messages.buildingWizardMaterialModalLabel, {
              type: label,
              left: String(left),
            }).slice(0, 45),
          )
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
          .setPlaceholder(String(left === '?' ? '1' : left)),
      ),
    );

  await interaction.showModal(modal);
}

async function showContributeAmountModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building || building.status !== 'building') {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  const left = Math.max(0, building.time_required - building.time_spent);
  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}contribute:amount:${interaction.user.id}:${buildingId}`,
    )
    .setTitle(
      buildings.messages.buildingWizardContributeModalTitle.slice(0, 45),
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(
            formatTemplate(
              buildings.messages.buildingWizardContributeModalLabel,
              {
                building: building.name,
                left: String(left),
              },
            ).slice(0, 45),
          )
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
          .setPlaceholder(String(left || 1)),
      ),
    );

  await interaction.showModal(modal);
}

async function finishMaterialAction(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  action: MaterialAction,
  buildingId: number,
  resourceKey: string,
  amount: number,
): Promise<void> {
  const { buildings, resources } = deps;
  const nickname = nicknameFrom(interaction);

  const channel = await fetchResourceChannel(interaction, resources);
  if (!channel) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const result =
    action === 'donate'
      ? buildings.donateById({
          guildId: interaction.guildId!,
          buildingId,
          keyRaw: resourceKey,
          amount,
          actorUserId: interaction.user.id,
          actorNickname: nickname,
        })
      : buildings.fundById({
          guildId: interaction.guildId!,
          buildingId,
          keyRaw: resourceKey,
          amount,
          actorUserId: interaction.user.id,
          actorNickname: nickname,
        });

  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  const progress = materialProgressFor(
    buildings,
    interaction.guildId!,
    result.building.id,
  );

  if (action === 'donate') {
    const embed = buildBuildingDonateEmbed(buildings.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
      buildingName: result.building.name,
      gc: result.gc,
      progress,
      phaseNote: result.phaseNote,
    });
    await postSilentEmbed(channel, embed);
    await interaction.reply({
      content: formatTemplate(buildings.messages.buildingDonateSuccess, {
        amount: String(result.amount),
        type: result.type.display_name,
        building: result.building.name,
        gc: String(result.gc),
        phase: result.phaseNote,
      }),
      ephemeral: true,
    });
    return;
  }

  const embed = buildBuildingFundEmbed(buildings.messages, {
    nickname,
    amount: result.amount,
    typeName: result.type.display_name,
    buildingName: result.building.name,
    stockAfter: result.stockAfter ?? 0,
    progress,
    phaseNote: result.phaseNote,
  });
  await postSilentEmbed(channel, embed);
  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingFundSuccess, {
      amount: String(result.amount),
      type: result.type.display_name,
      building: result.building.name,
      phase: result.phaseNote,
    }),
    ephemeral: true,
  });
}

async function finishContribute(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  amount: number,
): Promise<void> {
  const { buildings, resources } = deps;
  const nickname = nicknameFrom(interaction);

  const channel = await fetchResourceChannel(interaction, resources);
  if (!channel) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const result = buildings.contributeById({
    guildId: interaction.guildId!,
    buildingId,
    amount,
    actorUserId: interaction.user.id,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  const progress = `${result.building.time_spent} / ${result.building.time_required}`;
  const embed = buildContributeEmbed(buildings.messages, {
    nickname,
    amount: result.amount,
    buildingName: result.building.name,
    gc: result.gc,
    progress,
    phaseNote: result.phaseNote,
  });
  await postSilentEmbed(channel, embed);
  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingContributeSuccess, {
      amount: String(result.amount),
      building: result.building.name,
      gc: String(result.gc),
      phase: result.phaseNote,
    }),
    ephemeral: true,
  });
}

function materialProgressFor(
  buildings: BuildingService,
  guildId: string,
  buildingId: number,
): string {
  const detail = buildings.detailById(guildId, buildingId);
  if (!detail.ok) return '—';
  if (detail.materials.length === 0) return '—';
  return detail.materials
    .map((m) =>
      formatTemplate(buildings.messages.buildingCostShowLine, {
        type: m.displayName,
        funded: String(m.funded),
        required: String(m.required),
      }),
    )
    .join('\n');
}

async function ensureResourceChannel(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<boolean> {
  const settings = resources.getSettings(interaction.guildId!);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function fetchResourceChannel(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
  resources: ResourceService,
): Promise<GuildTextBasedChannel | null> {
  const settings = resources.getSettings(interaction.guildId!);
  if (!settings) return null;
  const cached = interaction.guild?.channels.cache.get(settings.channel_id);
  if (cached?.isTextBased() && !cached.isDMBased()) return cached;
  try {
    const fetched = await interaction.guild?.channels.fetch(settings.channel_id);
    if (fetched?.isTextBased() && !fetched.isDMBased()) return fetched;
  } catch {
    return null;
  }
  return null;
}
