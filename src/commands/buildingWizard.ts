import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
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
import { addModalIntro } from '../utils/modalIntro.js';
import { hubMessage, type HubStartInteraction } from './dmHubShared.js';
import {
  buildBuildingDonateEmbed,
  buildBuildingDonateMultiEmbed,
  buildBuildingFundEmbed,
  buildBuildingFundMultiEmbed,
  buildContributeEmbed,
  guildNickname,
  postSilentEmbed,
} from './resourceEmbeds.js';

export const BUILDING_WIZARD_PREFIX = 'bwiz:';

/** Max amount fields per multi modal (Discord limit with optional intro). */
const MULTI_AMOUNT_MAX = 5;

type MaterialAction = 'deliver' | 'usestock';

function qtyCustomId(key: string): string {
  return `q:${key}`.slice(0, 100);
}

function parseQtyCustomId(customId: string): string | null {
  if (!customId.startsWith('q:')) return null;
  const key = customId.slice(2);
  return key.length > 0 ? key : null;
}

function parseRequestedAmounts(
  interaction: ModalSubmitInteraction,
): { ok: true; items: Array<{ key: string; amount: number }> } | { ok: false; reason: 'invalid' | 'empty' } {
  const items: Array<{ key: string; amount: number }> = [];
  for (const [customId] of interaction.fields.fields) {
    const key = parseQtyCustomId(customId);
    if (!key) continue;
    const raw = interaction.fields.getTextInputValue(customId).trim();
    if (raw === '' || raw === '0') continue;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      return { ok: false, reason: 'invalid' };
    }
    items.push({ key, amount });
  }
  if (items.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, items };
}

/** Absolute set: empty = skip, 0 = set to zero. */
function parseSetFundingAmounts(
  interaction: ModalSubmitInteraction,
): { ok: true; items: Array<{ key: string; amount: number }> } | { ok: false; reason: 'invalid' | 'empty' } {
  const items: Array<{ key: string; amount: number }> = [];
  for (const [customId] of interaction.fields.fields) {
    const key = parseQtyCustomId(customId);
    if (!key) continue;
    const raw = interaction.fields.getTextInputValue(customId).trim();
    if (raw === '') continue;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 0 || amount > 9999) {
      return { ok: false, reason: 'invalid' };
    }
    items.push({ key, amount });
  }
  if (items.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, items };
}

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
  if (action === 'usestock') {
    await startUseStockWizard(interaction, deps);
    return;
  }

  await startDeliverWizard(interaction, deps);
}

async function startDeliverWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;
  if (!(await ensureResourceChannel(interaction, deps.resources))) return;

  const choices = buildings.listFundingChoices(interaction.guildId!);
  if (choices.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingWizardNoFunding,
      ephemeral: true,
    });
    return;
  }

  if (choices.length === 1) {
    await replyDeliverSourcePick(interaction, deps, choices[0]!.id);
    return;
  }

  const options = choices.slice(0, 25).map((b) => {
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

  await interaction.reply({
    content: buildings.messages.buildingWizardDeliverPickBuilding,
    components: [
      buildingSelectRow(
        `${BUILDING_WIZARD_PREFIX}deliver:bldg:${interaction.user.id}`,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

function sourceSelectRow(
  customId: string,
  buildings: BuildingService,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        buildings.messages.buildingWizardSourcePlaceholder.slice(0, 150),
      )
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(buildings.messages.buildingWizardSourceOutside.slice(0, 100))
          .setValue('outside')
          .setDescription(
            buildings.messages.buildingWizardSourceOutsideDesc.slice(0, 100),
          ),
        new StringSelectMenuOptionBuilder()
          .setLabel(buildings.messages.buildingWizardSourcePersonal.slice(0, 100))
          .setValue('personal')
          .setDescription(
            buildings.messages.buildingWizardSourcePersonalDesc.slice(0, 100),
          ),
      ),
  );
}

async function replyDeliverSourcePick(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building) {
    await interaction.reply({
      content: buildings.messages.buildingWizardBuildingGone,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: formatTemplate(buildings.messages.buildingWizardDeliverPickSource, {
      building: building.name,
    }),
    components: [
      sourceSelectRow(
        `${BUILDING_WIZARD_PREFIX}deliver:src:${interaction.user.id}:${buildingId}`,
        buildings,
      ),
    ],
    ephemeral: true,
  });
}

async function continueDeliverSourcePick(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building) {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  await interaction.update({
    content: formatTemplate(buildings.messages.buildingWizardDeliverPickSource, {
      building: building.name,
    }),
    components: [
      sourceSelectRow(
        `${BUILDING_WIZARD_PREFIX}deliver:src:${interaction.user.id}:${buildingId}`,
        buildings,
      ),
    ],
  });
}

async function continueDeliverAfterSource(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  source: 'outside' | 'personal',
): Promise<void> {
  const payload = buildDeliverFollowup(
    interaction.guildId!,
    interaction.user.id,
    deps,
    buildingId,
    source,
  );
  if (!payload.ok) {
    await interaction.update({ content: payload.message, components: [] });
    return;
  }
  if (payload.kind === 'modal') {
    await interaction.showModal(payload.modal);
    return;
  }
  await interaction.update({
    content: payload.content,
    components: [payload.row],
  });
}

function buildDeliverFollowup(
  guildId: string,
  userId: string,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  source: 'outside' | 'personal',
):
  | { ok: false; message: string }
  | { ok: true; kind: 'modal'; modal: ModalBuilder }
  | {
      ok: true;
      kind: 'select';
      content: string;
      row: ActionRowBuilder<StringSelectMenuBuilder>;
    } {
  const { buildings, resources } = deps;
  const building = buildings.getInGuild(guildId, buildingId);
  if (!building || building.status !== 'funding') {
    return { ok: false, message: buildings.messages.buildingWizardBuildingGone };
  }

  const missing = buildings.listMissingMaterials(buildingId);
  if (missing.length === 0) {
    return { ok: false, message: buildings.messages.buildingWizardNoMissing };
  }

  const personalByKey = new Map(
    resources.personalOverview(guildId, userId).map((r) => [r.type.key, r.quantity]),
  );

  const rows = missing.map((m) => ({
    key: m.resourceKey,
    displayName: m.displayName,
    left: m.required - m.funded,
    qty: personalByKey.get(m.resourceKey) ?? 0,
  }));

  if (missing.length <= MULTI_AMOUNT_MAX) {
    return {
      ok: true,
      kind: 'modal',
      modal: buildDeliverAmountModalBuilder(
        buildings,
        userId,
        buildingId,
        building.name,
        source,
        rows,
      ),
    };
  }

  const options = rows.slice(0, 25).map((row) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(row.displayName.slice(0, 100))
      .setValue(row.key)
      .setDescription(
        (source === 'personal'
          ? formatTemplate(
              buildings.messages.buildingWizardDeliverAmountHintPersonal,
              { left: String(row.left), qty: String(row.qty) },
            )
          : formatTemplate(
              buildings.messages.buildingWizardDeliverAmountHintOutside,
              { left: String(row.left) },
            )
        ).slice(0, 100),
      ),
  );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `${BUILDING_WIZARD_PREFIX}deliver:types:${userId}:${buildingId}:${source}`,
      )
      .setPlaceholder(
        buildings.messages.buildingWizardDeliverPickTypesPlaceholder.slice(
          0,
          150,
        ),
      )
      .setMinValues(1)
      .setMaxValues(Math.min(MULTI_AMOUNT_MAX, options.length))
      .addOptions(options),
  );

  return {
    ok: true,
    kind: 'select',
    content: formatTemplate(buildings.messages.buildingWizardDeliverPickTypes, {
      building: building.name,
    }),
    row: selectRow,
  };
}

async function showDeliverAmountModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  source: 'outside' | 'personal',
  keys: string[],
): Promise<void> {
  const { buildings, resources } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building) {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  const missingByKey = new Map(
    buildings.listMissingMaterials(buildingId).map((m) => [m.resourceKey, m]),
  );
  const personalByKey = new Map(
    resources
      .personalOverview(interaction.guildId!, interaction.user.id)
      .map((r) => [r.type.key, r.quantity]),
  );

  const rows = keys
    .map((key) => {
      const m = missingByKey.get(key);
      if (!m) return null;
      return {
        key: m.resourceKey,
        displayName: m.displayName,
        left: m.required - m.funded,
        qty: personalByKey.get(m.resourceKey) ?? 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, MULTI_AMOUNT_MAX);

  if (rows.length === 0) {
    await interaction.update({
      content: buildings.messages.buildingWizardNoMissing,
      components: [],
    });
    return;
  }

  await interaction.showModal(
    buildDeliverAmountModalBuilder(
      buildings,
      interaction.user.id,
      buildingId,
      building.name,
      source,
      rows,
    ),
  );
}

function buildDeliverAmountModalBuilder(
  buildings: BuildingService,
  userId: string,
  buildingId: number,
  buildingName: string,
  source: 'outside' | 'personal',
  rows: Array<{ key: string; displayName: string; left: number; qty: number }>,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}deliver:multi:${userId}:${buildingId}:${source}`,
    )
    .setTitle(
      formatTemplate(buildings.messages.buildingWizardDeliverAmountTitle, {
        building: buildingName,
      }).slice(0, 45),
    );

  if (rows.length < MULTI_AMOUNT_MAX) {
    addModalIntro(
      modal,
      formatTemplate(
        source === 'personal'
          ? buildings.messages.buildingWizardDeliverAmountIntroPersonal
          : buildings.messages.buildingWizardDeliverAmountIntroOutside,
        { building: buildingName },
      ),
    );
  }

  modal.addLabelComponents(
    ...rows.map((row) =>
      new LabelBuilder()
        .setLabel(row.displayName.slice(0, 45))
        .setDescription(
          (source === 'personal'
            ? formatTemplate(
                buildings.messages.buildingWizardDeliverAmountHintPersonal,
                { left: String(row.left), qty: String(row.qty) },
              )
            : formatTemplate(
                buildings.messages.buildingWizardDeliverAmountHintOutside,
                { left: String(row.left) },
              )
          ).slice(0, 100),
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(qtyCustomId(row.key))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(4)
            .setPlaceholder('0'),
        ),
    ),
  );

  return modal;
}

async function finishDeliverMulti(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  source: 'outside' | 'personal',
): Promise<void> {
  const { buildings, resources } = deps;
  const parsed = parseRequestedAmounts(interaction);
  if (!parsed.ok) {
    await interaction.reply({
      content:
        parsed.reason === 'invalid'
          ? buildings.messages.resourceInvalidAmount
          : buildings.messages.buildingWizardMultiNoneEntered,
      ephemeral: true,
    });
    return;
  }

  const channel = await fetchResourceChannel(interaction, resources);
  if (!channel) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const missingByKey = new Map(
    buildings.listMissingMaterials(buildingId).map((m) => [m.resourceKey, m]),
  );
  const personalByKey = new Map(
    resources
      .personalOverview(interaction.guildId!, interaction.user.id)
      .map((r) => [r.type.key, r.quantity]),
  );

  for (const item of parsed.items) {
    const missing = missingByKey.get(item.key);
    if (!missing) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: formatTemplate(buildings.messages.buildingNoCostForType, {
            building:
              buildings.getInGuild(interaction.guildId!, buildingId)?.name ?? '?',
            key: item.key,
          }),
        }),
        ephemeral: true,
      });
      return;
    }
    const room = Math.max(0, missing.required - missing.funded);
    const appliedNeed = Math.min(item.amount, room);
    if (source === 'personal' && appliedNeed > 0) {
      const available = personalByKey.get(item.key) ?? 0;
      if (available < appliedNeed) {
        await interaction.reply({
          content: formatTemplate(
            buildings.messages.buildingWizardMultiPartialFail,
            {
              reason: formatTemplate(
                resources.messages.resourceInsufficientPersonal,
                { stock: String(available), name: missing.displayName },
              ),
            },
          ),
          ephemeral: true,
        });
        return;
      }
    }
  }

  const nickname = nicknameFrom(interaction);
  const applied: Array<{
    amount: number;
    typeName: string;
    personalAfter?: number;
    gc: number;
  }> = [];
  let phaseNote = '';
  let buildingName = '?';
  let totalGc = 0;

  for (const item of parsed.items) {
    const result = buildings.donateById({
      guildId: interaction.guildId!,
      buildingId,
      keyRaw: item.key,
      amount: item.amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
      source,
    });
    if (!result.ok) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: result.message,
        }),
        ephemeral: true,
      });
      return;
    }
    applied.push({
      amount: result.amount,
      typeName: result.type.display_name,
      personalAfter:
        source === 'personal' ? (result.stockAfter ?? 0) : undefined,
      gc: result.gc,
    });
    totalGc += result.gc;
    buildingName = result.building.name;
    if (result.phaseNote) phaseNote = result.phaseNote;
  }

  const progress = materialProgressFor(
    buildings,
    interaction.guildId!,
    buildingId,
  );
  const fromPersonal = source === 'personal';

  const embed =
    applied.length === 1
      ? buildBuildingDonateEmbed(buildings.messages, {
          nickname,
          amount: applied[0]!.amount,
          typeName: applied[0]!.typeName,
          buildingName,
          gc: applied[0]!.gc,
          progress,
          phaseNote,
          fromPersonal,
          personalAfter: applied[0]!.personalAfter,
        })
      : buildBuildingDonateMultiEmbed(buildings.messages, {
          nickname,
          buildingName,
          gc: totalGc,
          progress,
          phaseNote,
          fromPersonal,
          lines: applied,
        });
  await postSilentEmbed(channel, embed);

  const lines = applied
    .map((line) =>
      formatTemplate(buildings.messages.buildingDonateSuccessLine, {
        amount: String(line.amount),
        type: line.typeName,
      }),
    )
    .join('\n');

  await interaction.reply({
    content:
      applied.length === 1
        ? formatTemplate(
            fromPersonal
              ? buildings.messages.buildingDonatePersonalSuccess
              : buildings.messages.buildingDonateSuccess,
            {
              amount: String(applied[0]!.amount),
              type: applied[0]!.typeName,
              building: buildingName,
              gc: String(applied[0]!.gc),
              personal: String(applied[0]!.personalAfter ?? 0),
              phase: phaseNote,
            },
          )
        : formatTemplate(
            fromPersonal
              ? buildings.messages.buildingDonatePersonalMultiSuccess
              : buildings.messages.buildingDonateMultiSuccess,
            {
              building: buildingName,
              lines,
              gc: String(totalGc),
              phase: phaseNote,
            },
          ),
    ephemeral: true,
  });
}

async function startUseStockWizard(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;
  if (!(await ensureResourceChannel(interaction, deps.resources))) return;

  const choices = buildings.listFundingChoices(interaction.guildId!);
  if (choices.length === 0) {
    await interaction.reply({
      content: buildings.messages.buildingWizardNoFunding,
      ephemeral: true,
    });
    return;
  }

  if (choices.length === 1) {
    await replyUseStockAfterBuilding(interaction, deps, choices[0]!.id);
    return;
  }

  const options = choices.slice(0, 25).map((b) => {
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

  await interaction.reply({
    content: buildings.messages.buildingWizardFundPickBuilding,
    components: [
      buildingSelectRow(
        `${BUILDING_WIZARD_PREFIX}usestock:bldg:${interaction.user.id}`,
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

  const buildingOptions = choices.slice(0, 25).map((b) => {
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

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}contribute:form:${interaction.user.id}`,
    )
    .setTitle(
      buildings.messages.buildingWizardContributeModalTitle.slice(0, 45),
    );
  addModalIntro(modal, buildings.messages.buildingWizardContributeIntro);
  modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(buildings.messages.buildingWizardBuildingLabel.slice(0, 45))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('building')
            .setPlaceholder(
              buildings.messages.buildingWizardBuildingPlaceholder.slice(0, 150),
            )
            .setRequired(true)
            .addOptions(buildingOptions),
        ),
      new LabelBuilder()
        .setLabel(buildings.messages.buildingWizardAmountLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4)
            .setPlaceholder('1'),
        ),
    );

  await interaction.showModal(modal);
}

export async function startCostAddWizard(
  interaction: HubStartInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings, resources } = deps;

  const buildingsList = buildings.listCostEditableBuildings(interaction.guildId!);
  if (buildingsList.length === 0) {
    await hubMessage(interaction, {
      content: buildings.messages.buildingWizardNoCostEditable,
    });
    return;
  }

  const types = resources.listTypes(interaction.guildId!);
  if (types.length === 0) {
    await hubMessage(interaction, {
      content: resources.messages.resourceTypeListEmpty,
    });
    return;
  }

  if (buildingsList.length === 1) {
    if (interaction.isStringSelectMenu()) {
      await showCostTypePick(interaction, deps, buildingsList[0]!.id);
    } else {
      await replyCostTypePick(interaction, deps, buildingsList[0]!.id);
    }
    return;
  }

  const options = buildingsList.slice(0, 25).map((b) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(buildings.messages.buildingStatusFunding.slice(0, 100)),
  );

  await hubMessage(interaction, {
    content: buildings.messages.buildingWizardPickBuildingCost,
    components: [
      buildingSelectRow(
        `${BUILDING_WIZARD_PREFIX}costadd:bldg:${interaction.user.id}`,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
  });
}

export async function startCostTimeWizard(
  interaction: HubStartInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;

  const buildingsList = buildings.listBuildtimeEditableBuildings(
    interaction.guildId!,
  );
  if (buildingsList.length === 0) {
    await hubMessage(interaction, {
      content: buildings.messages.buildingWizardNoBuildtimeEditable,
    });
    return;
  }

  const buildingOptions = buildingsList.slice(0, 25).map((b) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardBuildtimeOptionDesc, {
          time: String(b.time_required),
          status: buildings.statusLabel(b.status),
        }).slice(0, 100),
      ),
  );

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}costtime:form:${interaction.user.id}`,
    )
    .setTitle(buildings.messages.buildingWizardBuildtimeModalTitle.slice(0, 45));
  addModalIntro(modal, buildings.messages.buildingWizardBuildtimeIntro);
  modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(buildings.messages.buildingWizardBuildingLabel.slice(0, 45))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('building')
            .setPlaceholder(
              buildings.messages.buildingWizardBuildingPlaceholder.slice(0, 150),
            )
            .setRequired(true)
            .addOptions(buildingOptions),
        ),
      new LabelBuilder()
        .setLabel(buildings.messages.buildingWizardAmountLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4)
            .setPlaceholder('100'),
        ),
    );

  await interaction.showModal(modal);
}

/** DM: correct deposited materials (funding phase). */
export async function startFundingAdjustWizard(
  interaction: HubStartInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;
  const buildingsList = buildings.listFundingAdjustBuildings(interaction.guildId!);

  const choices = buildingsList.filter((b) => {
    const d = buildings.detailById(interaction.guildId!, b.id);
    return d.ok && d.materials.length > 0;
  });
  if (choices.length === 0) {
    await hubMessage(interaction, {
      content: buildings.messages.buildingWizardNoFundingAdjust,
    });
    return;
  }

  if (choices.length === 1) {
    const payload = buildFundingAdjustFollowup(
      interaction.guildId!,
      interaction.user.id,
      deps,
      choices[0]!.id,
    );
    if (!payload.ok) {
      await hubMessage(interaction, { content: payload.message });
      return;
    }
    if (payload.kind === 'modal') {
      await interaction.showModal(payload.modal);
      return;
    }
    await hubMessage(interaction, {
      content: payload.content,
      components: [payload.row],
    });
    return;
  }

  const options = choices.slice(0, 25).map((b) => {
    const d = buildings.detailById(interaction.guildId!, b.id);
    const summary =
      d.ok && d.materials.length > 0
        ? d.materials
            .slice(0, 3)
            .map((m) => `${m.funded}/${m.required} ${m.displayName}`)
            .join(', ')
        : buildings.statusLabel(b.status);
    return new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(summary.slice(0, 100));
  });

  await hubMessage(interaction, {
    content: buildings.messages.buildingWizardFundingAdjustPickBuilding,
    components: [
      buildingSelectRow(
        `${BUILDING_WIZARD_PREFIX}fundadj:bldg:${interaction.user.id}`,
        buildings.messages.buildingWizardBuildingPlaceholder,
        options,
      ),
    ],
  });
}

async function continueFundingAdjustAfterBuilding(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const payload = buildFundingAdjustFollowup(
    interaction.guildId!,
    interaction.user.id,
    deps,
    buildingId,
  );
  if (!payload.ok) {
    await interaction.update({ content: payload.message, components: [] });
    return;
  }
  if (payload.kind === 'modal') {
    await interaction.showModal(payload.modal);
    return;
  }
  await interaction.update({
    content: payload.content,
    components: [payload.row],
  });
}

function buildFundingAdjustFollowup(
  guildId: string,
  userId: string,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
):
  | { ok: false; message: string }
  | { ok: true; kind: 'modal'; modal: ModalBuilder }
  | {
      ok: true;
      kind: 'select';
      content: string;
      row: ActionRowBuilder<StringSelectMenuBuilder>;
    } {
  const { buildings } = deps;
  const building = buildings.getInGuild(guildId, buildingId);
  if (!building || building.status !== 'funding') {
    return { ok: false, message: buildings.messages.buildingWizardBuildingGone };
  }

  const detail = buildings.detailById(guildId, buildingId);
  if (!detail.ok || detail.materials.length === 0) {
    return { ok: false, message: buildings.messages.buildingWizardNoFundingAdjust };
  }

  const rows = detail.materials.map((m) => ({
    key: m.resourceKey,
    displayName: m.displayName,
    funded: m.funded,
    required: m.required,
  }));

  if (rows.length <= MULTI_AMOUNT_MAX) {
    return {
      ok: true,
      kind: 'modal',
      modal: buildFundingAdjustAmountModal(
        buildings,
        userId,
        buildingId,
        building.name,
        rows,
      ),
    };
  }

  const options = rows.slice(0, 25).map((row) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(row.displayName.slice(0, 100))
      .setValue(row.key)
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardFundingAdjustAmountHint, {
          funded: String(row.funded),
          required: String(row.required),
        }).slice(0, 100),
      ),
  );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${BUILDING_WIZARD_PREFIX}fundadj:types:${userId}:${buildingId}`)
      .setPlaceholder(
        buildings.messages.buildingWizardFundingAdjustPickTypesPlaceholder.slice(
          0,
          150,
        ),
      )
      .setMinValues(1)
      .setMaxValues(Math.min(MULTI_AMOUNT_MAX, options.length))
      .addOptions(options),
  );

  return {
    ok: true,
    kind: 'select',
    content: formatTemplate(
      buildings.messages.buildingWizardFundingAdjustPickTypes,
      { building: building.name },
    ),
    row: selectRow,
  };
}

async function showFundingAdjustAmountModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  keys: string[],
): Promise<void> {
  const { buildings } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building) {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  const detail = buildings.detailById(interaction.guildId!, buildingId);
  if (!detail.ok) {
    await interaction.update({ content: detail.message, components: [] });
    return;
  }

  const byKey = new Map(detail.materials.map((m) => [m.resourceKey, m]));
  const rows = keys
    .map((key) => {
      const m = byKey.get(key);
      if (!m) return null;
      return {
        key: m.resourceKey,
        displayName: m.displayName,
        funded: m.funded,
        required: m.required,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, MULTI_AMOUNT_MAX);

  if (rows.length === 0) {
    await interaction.update({
      content: buildings.messages.buildingWizardNoFundingAdjust,
      components: [],
    });
    return;
  }

  await interaction.showModal(
    buildFundingAdjustAmountModal(
      buildings,
      interaction.user.id,
      buildingId,
      building.name,
      rows,
    ),
  );
}

function buildFundingAdjustAmountModal(
  buildings: BuildingService,
  userId: string,
  buildingId: number,
  buildingName: string,
  rows: Array<{
    key: string;
    displayName: string;
    funded: number;
    required: number;
  }>,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${BUILDING_WIZARD_PREFIX}fundadj:multi:${userId}:${buildingId}`)
    .setTitle(
      formatTemplate(buildings.messages.buildingWizardFundingAdjustTitle, {
        building: buildingName,
      }).slice(0, 45),
    );

  if (rows.length < MULTI_AMOUNT_MAX) {
    addModalIntro(
      modal,
      formatTemplate(buildings.messages.buildingWizardFundingAdjustAmountIntro, {
        building: buildingName,
      }),
    );
  }

  modal.addLabelComponents(
    ...rows.map((row) =>
      new LabelBuilder()
        .setLabel(row.displayName.slice(0, 45))
        .setDescription(
          formatTemplate(buildings.messages.buildingWizardFundingAdjustAmountHint, {
            funded: String(row.funded),
            required: String(row.required),
          }).slice(0, 100),
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(qtyCustomId(row.key))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(4)
            .setPlaceholder(String(row.funded)),
        ),
    ),
  );

  return modal;
}

async function finishFundingAdjustMulti(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const parsed = parseSetFundingAmounts(interaction);
  if (!parsed.ok) {
    await interaction.reply({
      content:
        parsed.reason === 'invalid'
          ? buildings.messages.resourceInvalidAmount
          : buildings.messages.buildingWizardMultiNoneEntered,
      ephemeral: true,
    });
    return;
  }

  const detail = buildings.detailById(interaction.guildId!, buildingId);
  if (!detail.ok) {
    await interaction.reply({ content: detail.message, ephemeral: true });
    return;
  }

  const byKey = new Map(detail.materials.map((m) => [m.resourceKey, m]));
  for (const item of parsed.items) {
    if (!byKey.has(item.key)) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: formatTemplate(buildings.messages.buildingFundingTypeNotOnProject, {
            type: item.key,
            building: detail.building.name,
          }),
        }),
        ephemeral: true,
      });
      return;
    }
  }

  const nickname = nicknameFrom(interaction);
  const applied: Array<{
    typeName: string;
    fundedAfter: number;
    required: number;
    clamped: boolean;
  }> = [];
  let phaseNote = '';
  let buildingName = detail.building.name;

  for (const item of parsed.items) {
    const result = buildings.setFunding({
      guildId: interaction.guildId!,
      buildingId,
      keyRaw: item.key,
      target: item.amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: result.message,
        }),
        ephemeral: true,
      });
      return;
    }
    const material = byKey.get(item.key)!;
    applied.push({
      typeName: result.type.display_name,
      fundedAfter: result.fundedAfter,
      required: material.required,
      clamped: result.clamped,
    });
    buildingName = result.building.name;
    if (result.phaseNote) phaseNote = result.phaseNote;
  }

  const clampNote = buildings.messages.buildingWizardFundingAdjustClampedNote;
  const lines = applied
    .map((line) =>
      formatTemplate(buildings.messages.buildingWizardFundingAdjustSuccessLine, {
        type: line.typeName,
        funded: String(line.fundedAfter),
        required: String(line.required),
        clamp: line.clamped ? clampNote : '',
      }),
    )
    .join('\n');

  let reply =
    applied.length === 1
      ? formatTemplate(buildings.messages.buildingFundingAdjustSuccess, {
          type: applied[0]!.typeName,
          building: buildingName,
          funded: String(applied[0]!.fundedAfter),
          required: String(applied[0]!.required),
          clamp: applied[0]!.clamped ? clampNote : '',
        })
      : formatTemplate(buildings.messages.buildingWizardFundingAdjustMultiSuccess, {
          building: buildingName,
          lines,
        });
  if (phaseNote) reply += `\n${phaseNote}`;
  await interaction.reply({ content: reply, ephemeral: true });
}

/** DM: correct time_spent (building phase) — absolute set. */
export async function startSpentAdjustWizard(
  interaction: HubStartInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
): Promise<void> {
  const { buildings } = deps;
  const choices = buildings.listSpentAdjustBuildings(interaction.guildId!);
  if (choices.length === 0) {
    await hubMessage(interaction, {
      content: buildings.messages.buildingWizardNoSpentAdjust,
    });
    return;
  }

  const buildingOptions = choices.slice(0, 25).map((b) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(b.name.slice(0, 100))
      .setValue(String(b.id))
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardSpentOptionDesc, {
          spent: String(b.time_spent),
          required: String(b.time_required),
        }).slice(0, 100),
      ),
  );

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}spentadj:form:${interaction.user.id}`,
    )
    .setTitle(buildings.messages.buildingWizardSpentAdjustTitle.slice(0, 45));
  addModalIntro(modal, buildings.messages.buildingWizardSpentAdjustIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(buildings.messages.buildingWizardBuildingLabel.slice(0, 45))
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('building')
          .setPlaceholder(
            buildings.messages.buildingWizardBuildingPlaceholder.slice(0, 150),
          )
          .setRequired(true)
          .addOptions(buildingOptions),
      ),
    new LabelBuilder()
      .setLabel(buildings.messages.buildingWizardAmountLabel.slice(0, 45))
      .setDescription(
        buildings.messages.buildingWizardSpentAdjustAmountHint.slice(0, 100),
      )
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('amount')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
          .setPlaceholder('0'),
      ),
  );

  await interaction.showModal(modal);
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

  // Cost add: building → type multi-select
  if (action === 'costadd' && step === 'bldg') {
    await showCostTypePick(interaction, deps, Number(interaction.values[0]));
    return;
  }

  if (action === 'costadd' && step === 'types') {
    await showCostAmountModal(
      interaction,
      deps,
      Number(buildingIdRaw),
      interaction.values.slice(0, MULTI_AMOUNT_MAX),
    );
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

  // uit-guild: building → amounts (or type pick if >5 missing)
  if (action === 'usestock' && step === 'bldg') {
    await continueUseStockAfterBuilding(
      interaction,
      deps,
      Number(interaction.values[0]),
    );
    return;
  }

  if (action === 'usestock' && step === 'types') {
    await showUseStockAmountModal(
      interaction,
      deps,
      Number(buildingIdRaw),
      interaction.values.slice(0, MULTI_AMOUNT_MAX),
    );
    return;
  }

  // leveren: building → source → amounts (or type pick)
  if (action === 'deliver' && step === 'bldg') {
    await continueDeliverSourcePick(
      interaction,
      deps,
      Number(interaction.values[0]),
    );
    return;
  }

  if (action === 'deliver' && step === 'src') {
    const source = interaction.values[0];
    if (source !== 'outside' && source !== 'personal') {
      await interaction.update({
        content: deps.buildings.messages.buildingWizardSourceInvalid,
        components: [],
      });
      return;
    }
    await continueDeliverAfterSource(
      interaction,
      deps,
      Number(buildingIdRaw),
      source,
    );
    return;
  }

  if (action === 'deliver' && step === 'types') {
    const source = parts[4];
    if (source !== 'outside' && source !== 'personal') {
      await interaction.update({
        content: deps.buildings.messages.buildingWizardSourceInvalid,
        components: [],
      });
      return;
    }
    await showDeliverAmountModal(
      interaction,
      deps,
      Number(buildingIdRaw),
      source,
      interaction.values.slice(0, MULTI_AMOUNT_MAX),
    );
    return;
  }

  // funding adjust: building → amounts (absolute set)
  if (action === 'fundadj' && step === 'bldg') {
    await continueFundingAdjustAfterBuilding(
      interaction,
      deps,
      Number(interaction.values[0]),
    );
    return;
  }

  if (action === 'fundadj' && step === 'types') {
    await showFundingAdjustAmountModal(
      interaction,
      deps,
      Number(buildingIdRaw),
      interaction.values.slice(0, MULTI_AMOUNT_MAX),
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

  if (action === 'costadd' && step === 'multi') {
    await finishCostAddMulti(interaction, deps, Number(buildingIdRaw));
    return;
  }

  if (action === 'usestock' && step === 'multi') {
    await finishUseStockMulti(interaction, deps, Number(buildingIdRaw));
    return;
  }

  if (action === 'deliver' && step === 'multi') {
    const source = parts[4];
    if (source !== 'outside' && source !== 'personal') {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardSourceInvalid,
        ephemeral: true,
      });
      return;
    }
    await finishDeliverMulti(
      interaction,
      deps,
      Number(buildingIdRaw),
      source,
    );
    return;
  }

  if (action === 'fundadj' && step === 'multi') {
    await finishFundingAdjustMulti(
      interaction,
      deps,
      Number(buildingIdRaw),
    );
    return;
  }

  if (
    (action === 'deliver' || action === 'usestock') &&
    step === 'form'
  ) {
    const buildingId = Number(
      interaction.fields.getStringSelectValues('building')[0],
    );
    const resourceKey = interaction.fields.getStringSelectValues('type')[0];
    const amountRaw = interaction.fields.getTextInputValue('amount').trim();
    const amount = Number(amountRaw);
    let donateSource: 'outside' | 'personal' = 'outside';
    if (action === 'deliver') {
      const sourceRaw = interaction.fields.getStringSelectValues('source')[0];
      if (sourceRaw !== 'outside' && sourceRaw !== 'personal') {
        await interaction.reply({
          content: deps.buildings.messages.buildingWizardSourceInvalid,
          ephemeral: true,
        });
        return;
      }
      donateSource = sourceRaw;
    }
    if (!Number.isInteger(buildingId) || buildingId < 1) {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
      return;
    }
    if (!resourceKey) {
      await interaction.reply({
        content: deps.buildings.messages.resourceTypeUnknown.replace(
          '{key}',
          '?',
        ),
        ephemeral: true,
      });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    await finishMaterialAction(
      interaction,
      deps,
      action,
      buildingId,
      resourceKey,
      amount,
      action === 'deliver' ? donateSource : undefined,
    );
    return;
  }

  if (action === 'contribute' && step === 'form') {
    const buildingId = Number(
      interaction.fields.getStringSelectValues('building')[0],
    );
    const amountRaw = interaction.fields.getTextInputValue('amount').trim();
    const amount = Number(amountRaw);
    if (!Number.isInteger(buildingId) || buildingId < 1) {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    await finishContribute(interaction, deps, buildingId, amount);
    return;
  }

  if (action === 'costadd' && step === 'form') {
    const buildingId = Number(
      interaction.fields.getStringSelectValues('building')[0],
    );
    const typeRaw = interaction.fields.getStringSelectValues('type')[0] ?? '';
    const amount = Number(interaction.fields.getTextInputValue('amount').trim());
    if (!Number.isInteger(buildingId) || buildingId < 1) {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
      return;
    }
    if (!typeRaw) {
      await interaction.reply({
        content: deps.buildings.messages.resourceTypeUnknown.replace('{key}', '?'),
        ephemeral: true,
      });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    await finishCostAdd(interaction, deps, buildingId, typeRaw, amount);
    return;
  }

  if (action === 'costtime' && step === 'form') {
    const buildingId = Number(
      interaction.fields.getStringSelectValues('building')[0],
    );
    const amount = Number(interaction.fields.getTextInputValue('amount').trim());
    if (!Number.isInteger(buildingId) || buildingId < 1) {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    await finishCostTime(interaction, deps, buildingId, amount);
    return;
  }

  if (action === 'fundadj' && step === 'form') {
    const buildingId = Number(
      interaction.fields.getStringSelectValues('building')[0],
    );
    const resourceKey = interaction.fields.getStringSelectValues('type')[0];
    const amount = Number(interaction.fields.getTextInputValue('amount').trim());
    if (!Number.isInteger(buildingId) || buildingId < 1 || !resourceKey) {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
      return;
    }
    if (!Number.isInteger(amount) || amount < 0 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    const nickname = nicknameFrom(interaction);
    const result = deps.buildings.setFunding({
      guildId: interaction.guildId!,
      buildingId,
      keyRaw: resourceKey,
      target: amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    const detail = deps.buildings.detailById(interaction.guildId!, buildingId);
    const required =
      detail.ok
        ? (detail.materials.find((m) => m.resourceKey === result.type.key)?.required ??
          result.fundedAfter)
        : result.fundedAfter;
    let reply = formatTemplate(deps.buildings.messages.buildingFundingAdjustSuccess, {
      type: result.type.display_name,
      building: result.building.name,
      funded: String(result.fundedAfter),
      required: String(required),
      clamp: result.clamped
        ? deps.buildings.messages.buildingWizardFundingAdjustClampedNote
        : '',
    });
    if (result.phaseNote) reply += `\n${result.phaseNote}`;
    await interaction.reply({ content: reply, ephemeral: true });
    return;
  }

  if (action === 'spentadj' && step === 'form') {
    const buildingId = Number(
      interaction.fields.getStringSelectValues('building')[0],
    );
    const amount = Number(interaction.fields.getTextInputValue('amount').trim());
    if (!Number.isInteger(buildingId) || buildingId < 1) {
      await interaction.reply({
        content: deps.buildings.messages.buildingWizardBuildingGone,
        ephemeral: true,
      });
      return;
    }
    if (!Number.isInteger(amount) || amount < 0 || amount > 9999) {
      await interaction.reply({
        content: deps.buildings.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    const nickname = nicknameFrom(interaction);
    const result = deps.buildings.setTimeSpent({
      guildId: interaction.guildId!,
      buildingId,
      target: amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    let reply = formatTemplate(deps.buildings.messages.buildingSpentAdjustSuccess, {
      building: result.building.name,
      spent: String(result.spentAfter),
      required: String(result.building.time_required),
      clamp: result.clamped
        ? deps.buildings.messages.buildingSpentAdjustClampedNote
        : '',
    });
    if (result.phaseNote) reply += `\n${result.phaseNote}`;
    await interaction.reply({ content: reply, ephemeral: true });
    return;
  }

  if (action === 'costadd' && step === 'amount') {
    let typeRaw = '';
    try {
      typeRaw = interaction.fields.getStringSelectValues('type')[0] ?? '';
    } catch {
      typeRaw = '';
    }
    if (!typeRaw) {
      try {
        typeRaw = interaction.fields.getTextInputValue('type').trim();
      } catch {
        await interaction.reply({
          content: deps.buildings.messages.resourceTypeUnknown.replace('{key}', '?'),
          ephemeral: true,
        });
        return;
      }
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
    (action === 'deliver' || action === 'usestock') &&
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
    await showCostTypePick(interaction, deps, Number(buildingIdRaw));
    return;
  }

  await interaction.reply({
    content: deps.buildings.messages.unknownSubcommand,
    ephemeral: true,
  });
}

async function replyCostTypePick(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const content = await buildCostTypePickPayload(
    interaction.guildId!,
    interaction.user.id,
    deps,
    buildingId,
  );
  if (!content.ok) {
    await interaction.reply({ content: content.message, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: content.content,
    components: [content.row],
    ephemeral: true,
  });
}

async function showCostTypePick(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const content = await buildCostTypePickPayload(
    interaction.guildId!,
    interaction.user.id,
    deps,
    buildingId,
  );
  if (!content.ok) {
    if (interaction.isStringSelectMenu()) {
      await interaction.update({ content: content.message, components: [] });
    } else {
      await interaction.reply({ content: content.message, ephemeral: true });
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    await interaction.update({
      content: content.content,
      components: [content.row],
    });
  } else {
    await interaction.reply({
      content: content.content,
      components: [content.row],
      ephemeral: true,
    });
  }
}

async function buildCostTypePickPayload(
  guildId: string,
  userId: string,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<
  | {
      ok: true;
      content: string;
      row: ActionRowBuilder<StringSelectMenuBuilder>;
    }
  | { ok: false; message: string }
> {
  const { buildings, resources } = deps;
  const building = buildings.getInGuild(guildId, buildingId);
  if (!building || !buildings.listCostEditableBuildings(guildId).some((b) => b.id === buildingId)) {
    return { ok: false, message: buildings.messages.buildingWizardBuildingGone };
  }

  const types = resources.listTypes(guildId);
  if (types.length === 0) {
    return { ok: false, message: resources.messages.resourceTypeListEmpty };
  }

  const options = types.slice(0, 25).map((t) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(t.display_name.slice(0, 100))
      .setValue(t.key)
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardTypePrices, {
          sell: String(t.sell_gc),
          buy: String(t.buy_gc),
        }).slice(0, 100),
      ),
  );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `${BUILDING_WIZARD_PREFIX}costadd:types:${userId}:${buildingId}`,
      )
      .setPlaceholder(
        buildings.messages.buildingWizardCostPickTypesPlaceholder.slice(0, 150),
      )
      .setMinValues(1)
      .setMaxValues(Math.min(MULTI_AMOUNT_MAX, options.length))
      .addOptions(options),
  );

  return {
    ok: true,
    content: formatTemplate(buildings.messages.buildingWizardCostPickTypes, {
      building: building.name,
    }),
    row,
  };
}

async function showCostAmountModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  keys: string[],
): Promise<void> {
  const { buildings, resources } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building) {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  const typeByKey = new Map(
    resources.listTypes(interaction.guildId!).map((t) => [t.key, t]),
  );
  const rows = keys
    .map((key) => typeByKey.get(key))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .slice(0, MULTI_AMOUNT_MAX);

  if (rows.length === 0) {
    await interaction.update({
      content: resources.messages.resourceTypeListEmpty,
      components: [],
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}costadd:multi:${interaction.user.id}:${buildingId}`,
    )
    .setTitle(
      formatTemplate(buildings.messages.buildingWizardCostModalTitle, {
        building: building.name,
      }).slice(0, 45),
    );

  if (rows.length < MULTI_AMOUNT_MAX) {
    addModalIntro(modal, buildings.messages.buildingWizardCostAmountIntro);
  }

  modal.addLabelComponents(
    ...rows.map((type) =>
      new LabelBuilder()
        .setLabel(type.display_name.slice(0, 45))
        .setDescription(
          formatTemplate(buildings.messages.buildingWizardCostAmountHint, {
            sell: String(type.sell_gc),
            buy: String(type.buy_gc),
          }).slice(0, 100),
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(qtyCustomId(type.key))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(4)
            .setPlaceholder('0'),
        ),
    ),
  );

  await interaction.showModal(modal);
}

async function showCostTypeAmountModal(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  // Legacy single-type modal (still used by costadd:amount path if any).
  const { buildings, resources } = deps;
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

  const types = resources.listTypes(interaction.guildId!);
  if (types.length === 0) {
    const msg = resources.messages.resourceTypeListEmpty;
    if (interaction.isStringSelectMenu()) {
      await interaction.update({ content: msg, components: [] });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
    return;
  }

  const typeOptions = types.slice(0, 25).map((t) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(t.display_name.slice(0, 100))
      .setValue(t.key)
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardTypePrices, {
          sell: String(t.sell_gc),
          buy: String(t.buy_gc),
        }).slice(0, 100),
      ),
  );

  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}costadd:amount:${interaction.user.id}:${buildingId}`,
    )
    .setTitle(
      formatTemplate(buildings.messages.buildingWizardCostModalTitle, {
        building: building.name,
      }).slice(0, 45),
    );
  addModalIntro(modal, buildings.messages.buildingWizardCostAddIntro);
  modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(buildings.messages.buildingWizardResourceLabel.slice(0, 45))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('type')
            .setPlaceholder(
              buildings.messages.buildingWizardResourcePlaceholder.slice(0, 150),
            )
            .setRequired(true)
            .addOptions(typeOptions),
        ),
      new LabelBuilder()
        .setLabel(buildings.messages.buildingWizardAmountLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('amount')
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
    .setTitle(buildings.messages.buildingWizardBuildtimeModalTitle.slice(0, 45));
  addModalIntro(modal, buildings.messages.buildingWizardBuildtimeIntro);
  modal.addComponents(
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

async function finishCostAddMulti(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings } = deps;
  const parsed = parseRequestedAmounts(interaction);
  if (!parsed.ok) {
    await interaction.reply({
      content:
        parsed.reason === 'invalid'
          ? buildings.messages.resourceInvalidAmount
          : buildings.messages.buildingWizardMultiNoneEntered,
      ephemeral: true,
    });
    return;
  }

  const nickname = nicknameFrom(interaction);
  const applied: Array<{ amount: number; typeName: string }> = [];

  for (const item of parsed.items) {
    const result = buildings.addCostById({
      guildId: interaction.guildId!,
      buildingId,
      keyRaw: item.key,
      amount: item.amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: result.message,
        }),
        ephemeral: true,
      });
      return;
    }
    applied.push({
      amount: result.amount,
      typeName: result.type.display_name,
    });
  }

  const againRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${BUILDING_WIZARD_PREFIX}costadd:again:${interaction.user.id}:${buildingId}`,
      )
      .setLabel(buildings.messages.buildingWizardCostAddAnother.slice(0, 80))
      .setStyle(ButtonStyle.Primary),
  );

  const buildingName =
    buildings.getInGuild(interaction.guildId!, buildingId)?.name ?? '?';
  const lines = applied
    .map((line) =>
      formatTemplate(buildings.messages.buildingCostAddSuccessLine, {
        amount: String(line.amount),
        type: line.typeName,
      }),
    )
    .join('\n');

  await interaction.reply({
    content:
      applied.length === 1
        ? formatTemplate(buildings.messages.buildingCostAddSuccess, {
            building: buildingName,
            amount: String(applied[0]!.amount),
            type: applied[0]!.typeName,
          })
        : formatTemplate(buildings.messages.buildingCostAddMultiSuccess, {
            building: buildingName,
            lines,
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
    content:
      formatTemplate(buildings.messages.buildingCostBuildtimeSuccess, {
        building: result.building.name,
        time: String(result.time),
      }) + (result.phaseNote ? `\n${result.phaseNote}` : ''),
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
  });
  const phaseLine = formatTemplate(buildings.messages.buildingCostShowPhase, {
    phase: statusLabel,
  });

  const embed = new EmbedBuilder()
    .setTitle(
      formatTemplate(buildings.messages.buildingCostShowTitle, {
        name: building.name,
      }),
    )
    .setDescription(
      [phaseLine, ...materialLines, '', timeLine].join('\n').slice(0, 4000),
    );

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
  donateSource: 'outside' | 'personal' = 'outside',
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
    action === 'deliver'
      ? buildings.donateById({
          guildId: interaction.guildId!,
          buildingId,
          keyRaw: resourceKey,
          amount,
          actorUserId: interaction.user.id,
          actorNickname: nickname,
          source: donateSource,
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

  if (action === 'deliver') {
    const fromPersonal = result.source === 'personal';
    const embed = buildBuildingDonateEmbed(buildings.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
      buildingName: result.building.name,
      gc: result.gc,
      progress,
      phaseNote: result.phaseNote,
      fromPersonal,
      personalAfter: fromPersonal ? (result.stockAfter ?? 0) : undefined,
    });
    await postSilentEmbed(channel, embed);
    await interaction.reply({
      content: formatTemplate(
        fromPersonal
          ? buildings.messages.buildingDonatePersonalSuccess
          : buildings.messages.buildingDonateSuccess,
        {
          amount: String(result.amount),
          type: result.type.display_name,
          building: result.building.name,
          gc: String(result.gc),
          personal: String(result.stockAfter ?? 0),
          phase: result.phaseNote,
        },
      ),
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

async function replyUseStockAfterBuilding(
  interaction: ChatInputCommandInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const payload = buildUseStockFollowup(
    interaction.guildId!,
    interaction.user.id,
    deps,
    buildingId,
  );
  if (!payload.ok) {
    await interaction.reply({ content: payload.message, ephemeral: true });
    return;
  }
  if (payload.kind === 'modal') {
    await interaction.showModal(payload.modal);
    return;
  }
  await interaction.reply({
    content: payload.content,
    components: [payload.row],
    ephemeral: true,
  });
}

async function continueUseStockAfterBuilding(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const payload = buildUseStockFollowup(
    interaction.guildId!,
    interaction.user.id,
    deps,
    buildingId,
  );
  if (!payload.ok) {
    await interaction.update({ content: payload.message, components: [] });
    return;
  }
  if (payload.kind === 'modal') {
    await interaction.showModal(payload.modal);
    return;
  }
  await interaction.update({
    content: payload.content,
    components: [payload.row],
  });
}

function buildUseStockFollowup(
  guildId: string,
  userId: string,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
):
  | { ok: false; message: string }
  | { ok: true; kind: 'modal'; modal: ModalBuilder }
  | {
      ok: true;
      kind: 'select';
      content: string;
      row: ActionRowBuilder<StringSelectMenuBuilder>;
    } {
  const { buildings, resources } = deps;
  const building = buildings.getInGuild(guildId, buildingId);
  if (!building || building.status !== 'funding') {
    return { ok: false, message: buildings.messages.buildingWizardBuildingGone };
  }

  const missing = buildings.listMissingMaterials(buildingId);
  if (missing.length === 0) {
    return { ok: false, message: buildings.messages.buildingWizardNoMissing };
  }

  const stockByKey = new Map(
    resources.stockOverview(guildId).map((s) => [s.type.key, s.quantity]),
  );

  if (missing.length <= MULTI_AMOUNT_MAX) {
    return {
      ok: true,
      kind: 'modal',
      modal: buildUseStockAmountModalBuilder(
        buildings,
        userId,
        buildingId,
        building.name,
        missing.map((m) => ({
          key: m.resourceKey,
          displayName: m.displayName,
          left: m.required - m.funded,
          stock: stockByKey.get(m.resourceKey) ?? 0,
        })),
      ),
    };
  }

  const options = missing.slice(0, 25).map((m) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(m.displayName.slice(0, 100))
      .setValue(m.resourceKey)
      .setDescription(
        formatTemplate(buildings.messages.buildingWizardFundAmountHint, {
          left: String(m.required - m.funded),
          stock: String(stockByKey.get(m.resourceKey) ?? 0),
        }).slice(0, 100),
      ),
  );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `${BUILDING_WIZARD_PREFIX}usestock:types:${userId}:${buildingId}`,
      )
      .setPlaceholder(
        buildings.messages.buildingWizardFundPickTypesPlaceholder.slice(0, 150),
      )
      .setMinValues(1)
      .setMaxValues(Math.min(MULTI_AMOUNT_MAX, options.length))
      .addOptions(options),
  );

  return {
    ok: true,
    kind: 'select',
    content: formatTemplate(buildings.messages.buildingWizardFundPickTypes, {
      building: building.name,
    }),
    row,
  };
}

async function showUseStockAmountModal(
  interaction: StringSelectMenuInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
  keys: string[],
): Promise<void> {
  const { buildings, resources } = deps;
  const building = buildings.getInGuild(interaction.guildId!, buildingId);
  if (!building) {
    await interaction.update({
      content: buildings.messages.buildingWizardBuildingGone,
      components: [],
    });
    return;
  }

  const missingByKey = new Map(
    buildings
      .listMissingMaterials(buildingId)
      .map((m) => [m.resourceKey, m]),
  );
  const stockByKey = new Map(
    resources
      .stockOverview(interaction.guildId!)
      .map((s) => [s.type.key, s.quantity]),
  );

  const rows = keys
    .map((key) => {
      const m = missingByKey.get(key);
      if (!m) return null;
      return {
        key: m.resourceKey,
        displayName: m.displayName,
        left: m.required - m.funded,
        stock: stockByKey.get(m.resourceKey) ?? 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, MULTI_AMOUNT_MAX);

  if (rows.length === 0) {
    await interaction.update({
      content: buildings.messages.buildingWizardNoMissing,
      components: [],
    });
    return;
  }

  await interaction.showModal(
    buildUseStockAmountModalBuilder(
      buildings,
      interaction.user.id,
      buildingId,
      building.name,
      rows,
    ),
  );
}

function buildUseStockAmountModalBuilder(
  buildings: BuildingService,
  userId: string,
  buildingId: number,
  buildingName: string,
  rows: Array<{ key: string; displayName: string; left: number; stock: number }>,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(
      `${BUILDING_WIZARD_PREFIX}usestock:multi:${userId}:${buildingId}`,
    )
    .setTitle(
      formatTemplate(buildings.messages.buildingWizardFundAmountTitle, {
        building: buildingName,
      }).slice(0, 45),
    );

  if (rows.length < MULTI_AMOUNT_MAX) {
    addModalIntro(
      modal,
      formatTemplate(buildings.messages.buildingWizardFundAmountIntro, {
        building: buildingName,
      }),
    );
  }

  modal.addLabelComponents(
    ...rows.map((row) =>
      new LabelBuilder()
        .setLabel(row.displayName.slice(0, 45))
        .setDescription(
          formatTemplate(buildings.messages.buildingWizardFundAmountHint, {
            left: String(row.left),
            stock: String(row.stock),
          }).slice(0, 100),
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(qtyCustomId(row.key))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(4)
            .setPlaceholder('0'),
        ),
    ),
  );

  return modal;
}

async function finishUseStockMulti(
  interaction: ModalSubmitInteraction,
  deps: { buildings: BuildingService; resources: ResourceService },
  buildingId: number,
): Promise<void> {
  const { buildings, resources } = deps;
  const parsed = parseRequestedAmounts(interaction);
  if (!parsed.ok) {
    await interaction.reply({
      content:
        parsed.reason === 'invalid'
          ? buildings.messages.resourceInvalidAmount
          : buildings.messages.buildingWizardMultiNoneEntered,
      ephemeral: true,
    });
    return;
  }

  const channel = await fetchResourceChannel(interaction, resources);
  if (!channel) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const nickname = nicknameFrom(interaction);
  const missingByKey = new Map(
    buildings
      .listMissingMaterials(buildingId)
      .map((m) => [m.resourceKey, m]),
  );
  const stockByKey = new Map(
    resources
      .stockOverview(interaction.guildId!)
      .map((s) => [s.type.key, s.quantity]),
  );

  for (const item of parsed.items) {
    const missing = missingByKey.get(item.key);
    if (!missing) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: formatTemplate(buildings.messages.buildingNoCostForType, {
            building:
              buildings.getInGuild(interaction.guildId!, buildingId)?.name ?? '?',
            key: item.key,
          }),
        }),
        ephemeral: true,
      });
      return;
    }
    const room = Math.max(0, missing.required - missing.funded);
    const appliedNeed = Math.min(item.amount, room);
    const available = stockByKey.get(item.key) ?? 0;
    if (appliedNeed > 0 && available < appliedNeed) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: formatTemplate(resources.messages.resourceInsufficientStock, {
            stock: String(available),
            name: missing.displayName,
          }),
        }),
        ephemeral: true,
      });
      return;
    }
  }

  const applied: Array<{
    amount: number;
    typeName: string;
    stockAfter: number;
  }> = [];
  let phaseNote = '';
  let buildingName = '?';

  for (const item of parsed.items) {
    const result = buildings.fundById({
      guildId: interaction.guildId!,
      buildingId,
      keyRaw: item.key,
      amount: item.amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({
        content: formatTemplate(buildings.messages.buildingWizardMultiPartialFail, {
          reason: result.message,
        }),
        ephemeral: true,
      });
      return;
    }
    applied.push({
      amount: result.amount,
      typeName: result.type.display_name,
      stockAfter: result.stockAfter ?? 0,
    });
    buildingName = result.building.name;
    if (result.phaseNote) phaseNote = result.phaseNote;
  }

  const progress = materialProgressFor(
    buildings,
    interaction.guildId!,
    buildingId,
  );

  const embed =
    applied.length === 1
      ? buildBuildingFundEmbed(buildings.messages, {
          nickname,
          amount: applied[0]!.amount,
          typeName: applied[0]!.typeName,
          buildingName,
          stockAfter: applied[0]!.stockAfter,
          progress,
          phaseNote,
        })
      : buildBuildingFundMultiEmbed(buildings.messages, {
          nickname,
          buildingName,
          lines: applied,
          progress,
          phaseNote,
        });
  await postSilentEmbed(channel, embed);

  const lines = applied
    .map((line) =>
      formatTemplate(buildings.messages.buildingFundSuccessLine, {
        amount: String(line.amount),
        type: line.typeName,
      }),
    )
    .join('\n');

  await interaction.reply({
    content:
      applied.length === 1
        ? formatTemplate(buildings.messages.buildingFundSuccess, {
            amount: String(applied[0]!.amount),
            type: applied[0]!.typeName,
            building: buildingName,
            phase: phaseNote,
          })
        : formatTemplate(buildings.messages.buildingFundMultiSuccess, {
            building: buildingName,
            lines,
            phase: phaseNote,
          }),
    ephemeral: true,
  });
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
