import {
  ActionRowBuilder,
  CheckboxBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { ResourceService } from '../services/ResourceService.js';
import type { ResourceType } from '../types.js';
import { formatTemplate } from '../utils/helpers.js';
import { addModalIntro } from '../utils/modalIntro.js';
import {
  buildBuyEmbed,
  buildDonateEmbed,
  buildPersonalAddEmbed,
  buildPersonalRemoveEmbed,
  buildPersonalRemoveMultiEmbed,
  guildNickname,
  postSilentEmbed,
} from './resourceEmbeds.js';

export const RESOURCE_WIZARD_PREFIX = 'rwiz:';

/** Max amount fields per personal-remove modal (Discord modal top-level limit with intro). */
const PERSONAL_REMOVE_MAX = 5;
const PERSONAL_REMOVE_PICK = 'personal_remove_pick';
const PERSONAL_REMOVE_MULTI = 'personal_remove_multi';

export type ResourceAmountAction =
  | 'donate'
  | 'buy'
  | 'personal_add'
  | 'personal_remove'
  | 'adjust';

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

function modalIntro(
  resources: ResourceService,
  action: ResourceAmountAction,
  guildId: string,
): string {
  switch (action) {
    case 'donate':
      return resources.messages.resourceWizardDonateIntro;
    case 'buy':
      return resources.messages.resourceWizardBuyIntro;
    case 'personal_add': {
      if (resources.isHouseTaxEnabled(guildId)) {
        return formatTemplate(resources.messages.resourceWizardPersonalAddIntroTax, {
          threshold: String(resources.getHouseTaxThreshold(guildId)),
        });
      }
      return resources.messages.resourceWizardPersonalAddIntro;
    }
    case 'personal_remove':
      return resources.messages.resourceWizardPersonalRemoveIntro;
    case 'adjust':
      return resources.messages.resourceWizardAdjustIntro;
  }
}

function modalTitle(
  resources: ResourceService,
  action: ResourceAmountAction,
): string {
  switch (action) {
    case 'donate':
      return resources.messages.resourceWizardDonateModalTitle;
    case 'buy':
      return resources.messages.resourceWizardBuyModalTitle;
    case 'personal_add':
      return resources.messages.resourceWizardPersonalAddModalTitle;
    case 'personal_remove':
      return resources.messages.resourceWizardPersonalRemoveModalTitle;
    case 'adjust':
      return resources.messages.resourceWizardAdjustModalTitle;
  }
}

function typeOptionsFor(
  resources: ResourceService,
  guildId: string,
  userId: string,
  action: ResourceAmountAction,
): StringSelectMenuOptionBuilder[] | null {
  if (action === 'personal_remove') {
    const rows = resources.personalOverview(guildId, userId);
    if (rows.length === 0) return null;
    return rows.slice(0, 25).map((row) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(row.type.display_name.slice(0, 100))
        .setValue(row.type.key)
        .setDescription(
          formatTemplate(resources.messages.resourceWizardPersonalTypeOptionDesc, {
            qty: String(row.quantity),
          }).slice(0, 100),
        ),
    );
  }

  const types = resources.listTypes(guildId);
  if (types.length === 0) return null;

  if (action === 'personal_add') {
    const personalByKey = new Map(
      resources.personalOverview(guildId, userId).map((r) => [r.type.key, r.quantity]),
    );
    return types.slice(0, 25).map((t) =>
      optionForPersonal(resources, t, personalByKey.get(t.key) ?? 0),
    );
  }

  const stockByKey = new Map(
    resources.stockOverview(guildId).map((s) => [s.type.key, s.quantity]),
  );

  return types.slice(0, 25).map((t) => {
    const qty = stockByKey.get(t.key) ?? 0;
    if (action === 'buy') {
      return new StringSelectMenuOptionBuilder()
        .setLabel(t.display_name.slice(0, 100))
        .setValue(t.key)
        .setDescription(
          formatTemplate(resources.messages.resourceWizardBuyTypeOptionDesc, {
            qty: String(qty),
            buy: String(t.buy_gc),
          }).slice(0, 100),
        );
    }
    if (action === 'adjust') {
      return new StringSelectMenuOptionBuilder()
        .setLabel(t.display_name.slice(0, 100))
        .setValue(t.key)
        .setDescription(
          formatTemplate(resources.messages.resourceWizardAdjustTypeOptionDesc, {
            qty: String(qty),
          }).slice(0, 100),
        );
    }
    return new StringSelectMenuOptionBuilder()
      .setLabel(t.display_name.slice(0, 100))
      .setValue(t.key)
      .setDescription(
        formatTemplate(resources.messages.resourceWizardTypeOptionDesc, {
          qty: String(qty),
          sell: String(t.sell_gc),
        }).slice(0, 100),
      );
  });
}

function optionForPersonal(
  resources: ResourceService,
  type: ResourceType,
  qty: number,
): StringSelectMenuOptionBuilder {
  return new StringSelectMenuOptionBuilder()
    .setLabel(type.display_name.slice(0, 100))
    .setValue(type.key)
    .setDescription(
      formatTemplate(resources.messages.resourceWizardPersonalTypeOptionDesc, {
        qty: String(qty),
      }).slice(0, 100),
    );
}

function personalRemoveQtyCustomId(key: string): string {
  return `q:${key}`.slice(0, 100);
}

function parsePersonalRemoveQtyCustomId(customId: string): string | null {
  if (!customId.startsWith('q:')) return null;
  const key = customId.slice(2);
  return key.length > 0 ? key : null;
}

async function showPersonalRemoveAmountModal(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  resources: ResourceService,
  rows: Array<{ type: ResourceType; quantity: number }>,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(
      `${RESOURCE_WIZARD_PREFIX}${PERSONAL_REMOVE_MULTI}:${interaction.user.id}`,
    )
    .setTitle(
      resources.messages.resourceWizardPersonalRemoveModalTitle.slice(0, 45),
    );

  const limited = rows.slice(0, PERSONAL_REMOVE_MAX);
  // Intro + 5 labels exceeds Discord's 5 top-level modal components.
  if (limited.length < PERSONAL_REMOVE_MAX) {
    addModalIntro(modal, resources.messages.resourceWizardPersonalRemoveIntro);
  }

  const qtyByKey = new Map(rows.map((r) => [r.type.key, r.quantity]));
  modal.addLabelComponents(
    ...limited.map((row) =>
      new LabelBuilder()
        .setLabel(row.type.display_name.slice(0, 45))
        .setDescription(
          formatTemplate(
            resources.messages.resourceWizardPersonalRemoveAmountHint,
            { qty: String(qtyByKey.get(row.type.key) ?? 0) },
          ).slice(0, 100),
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(personalRemoveQtyCustomId(row.type.key))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(4)
            .setPlaceholder('0'),
        ),
    ),
  );

  await interaction.showModal(modal);
}

async function startPersonalRemoveWizard(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const rows = resources.personalOverview(
    interaction.guildId!,
    interaction.user.id,
  );
  if (rows.length === 0) {
    await interaction.reply({
      content: resources.messages.resourcePersonalEmpty,
      ephemeral: true,
    });
    return;
  }

  // Fits in one amount-modal → skip the pick step.
  if (rows.length <= PERSONAL_REMOVE_MAX) {
    await showPersonalRemoveAmountModal(
      interaction,
      resources,
      rows.slice(0, PERSONAL_REMOVE_MAX),
    );
    return;
  }

  const options = rows.slice(0, 25).map((row) =>
    optionForPersonal(resources, row.type, row.quantity),
  );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `${RESOURCE_WIZARD_PREFIX}${PERSONAL_REMOVE_PICK}:${interaction.user.id}`,
      )
      .setPlaceholder(
        resources.messages.resourceWizardPersonalRemovePickPlaceholder.slice(
          0,
          150,
        ),
      )
      .setMinValues(1)
      .setMaxValues(Math.min(PERSONAL_REMOVE_MAX, options.length))
      .addOptions(options),
  );

  await interaction.reply({
    content: resources.messages.resourceWizardPersonalRemovePickPrompt,
    components: [row],
    ephemeral: true,
  });
}

/** Player stockpile flows: één modal met type-dropdown + aantal. */
export async function startResourceAmountWizard(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
  action: ResourceAmountAction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: resources.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (action !== 'adjust') {
    const settings = resources.getSettings(interaction.guildId);
    if (!settings) {
      await interaction.reply({
        content: resources.messages.resourceNotConfigured,
        ephemeral: true,
      });
      return;
    }
  }

  if (action === 'personal_remove') {
    await startPersonalRemoveWizard(interaction, resources);
    return;
  }

  const options = typeOptionsFor(
    resources,
    interaction.guildId,
    interaction.user.id,
    action,
  );
  if (!options || options.length === 0) {
    await interaction.reply({
      content: resources.messages.resourceTypeListEmpty,
      ephemeral: true,
    });
    return;
  }

  const amountPlaceholder = resources.messages.resourceWizardAmountPlaceholder;
  const amountLabel = resources.messages.resourceWizardAmountLabel;

  const modal = new ModalBuilder()
    .setCustomId(`${RESOURCE_WIZARD_PREFIX}${action}:${interaction.user.id}`)
    .setTitle(modalTitle(resources, action).slice(0, 45));

  addModalIntro(modal, modalIntro(resources, action, interaction.guildId!));

  if (action === 'adjust') {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(resources.messages.resourceWizardTypeLabel.slice(0, 45))
        .setDescription(
          resources.messages.resourceWizardAdjustTypeHint.slice(0, 100),
        )
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('type')
            .setPlaceholder(
              resources.messages.resourceWizardTypePlaceholder.slice(0, 150),
            )
            .setRequired(true)
            .addOptions(options),
        ),
      new LabelBuilder()
        .setLabel(resources.messages.resourceWizardAmountLabel.slice(0, 45))
        .setDescription(
          resources.messages.resourceWizardAdjustAmountHint.slice(0, 100),
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
  } else {
    const labels = [
      new LabelBuilder()
        .setLabel(resources.messages.resourceWizardTypeLabel.slice(0, 45))
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('type')
            .setPlaceholder(
              resources.messages.resourceWizardTypePlaceholder.slice(0, 150),
            )
            .setRequired(true)
            .addOptions(options),
        ),
      new LabelBuilder()
        .setLabel(amountLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4)
            .setPlaceholder(amountPlaceholder.slice(0, 100)),
        ),
    ];

    if (
      action === 'personal_add' &&
      resources.isHouseTaxEnabled(interaction.guildId!)
    ) {
      labels.push(
        new LabelBuilder()
          .setLabel(resources.messages.resourceWizardOwnHouseLabel.slice(0, 45))
          .setDescription(
            resources.messages.resourceWizardOwnHouseDescription.slice(0, 100),
          )
          .setCheckboxComponent(
            new CheckboxBuilder()
              .setCustomId('own_house')
              .setDefault(true),
          ),
      );
    }

    modal.addLabelComponents(...labels);
  }

  await interaction.showModal(modal);
}

export async function handleResourceWizardSelect(
  interaction: StringSelectMenuInteraction,
  resources: ResourceService,
): Promise<void> {
  if (!interaction.customId.startsWith(RESOURCE_WIZARD_PREFIX)) return;

  const parts = interaction.customId
    .slice(RESOURCE_WIZARD_PREFIX.length)
    .split(':');
  const [actionRaw, userId] = parts;

  if (userId !== interaction.user.id) {
    await interaction.reply({
      content: resources.messages.resourceWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  if (actionRaw !== PERSONAL_REMOVE_PICK) return;

  if (!interaction.guildId) {
    await interaction.reply({
      content: resources.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const settings = resources.getSettings(interaction.guildId);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const selected = interaction.values.slice(0, PERSONAL_REMOVE_MAX);
  const stock = new Map(
    resources
      .personalOverview(interaction.guildId, interaction.user.id)
      .map((r) => [r.type.key, r]),
  );

  const rows: Array<{ type: ResourceType; quantity: number }> = [];
  for (const key of selected) {
    const row = stock.get(key);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    await interaction.reply({
      content: resources.messages.resourcePersonalEmpty,
      ephemeral: true,
    });
    return;
  }

  await showPersonalRemoveAmountModal(interaction, resources, rows);
}

/** @deprecated use startResourceAmountWizard(..., 'donate') */
export async function startDonateWizard(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  await startResourceAmountWizard(interaction, resources, 'donate');
}

export async function handleResourceWizardModal(
  interaction: ModalSubmitInteraction,
  resources: ResourceService,
): Promise<void> {
  if (!interaction.customId.startsWith(RESOURCE_WIZARD_PREFIX)) return;

  if (!interaction.guildId) {
    await interaction.reply({
      content: resources.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const parts = interaction.customId
    .slice(RESOURCE_WIZARD_PREFIX.length)
    .split(':');
  const [actionRaw, userId] = parts;

  if (userId !== interaction.user.id) {
    await interaction.reply({
      content: resources.messages.resourceWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  if (actionRaw === PERSONAL_REMOVE_MULTI) {
    await handlePersonalRemoveMultiModal(interaction, resources);
    return;
  }

  const action = actionRaw as ResourceAmountAction;

  if (
    action !== 'donate' &&
    action !== 'buy' &&
    action !== 'personal_add' &&
    action !== 'adjust'
  ) {
    await interaction.reply({
      content: resources.messages.unknownSubcommand,
      ephemeral: true,
    });
    return;
  }

  const selected = interaction.fields.getStringSelectValues('type');
  const resourceKey = selected[0];
  if (!resourceKey) {
    await interaction.reply({
      content: formatTemplate(resources.messages.resourceTypeUnknown, {
        key: '?',
      }),
      ephemeral: true,
    });
    return;
  }

  const raw = interaction.fields.getTextInputValue('amount').trim();
  const amount = Number(raw);
  if (action === 'adjust') {
    if (!Number.isInteger(amount) || amount < 0 || amount > 9999) {
      await interaction.reply({
        content: resources.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
  } else if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
    await interaction.reply({
      content: resources.messages.resourceInvalidAmount,
      ephemeral: true,
    });
    return;
  }

  const nickname = nicknameFrom(interaction);

  if (action === 'adjust') {
    const result = resources.setStock({
      guildId: interaction.guildId,
      keyRaw: resourceKey,
      target: amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    let reply = formatTemplate(resources.messages.resourceAdjustSuccess, {
      name: result.type.display_name,
      stock: String(result.stockAfter),
    });
    if (result.overflow > 0) {
      reply +=
        '\n' +
        formatTemplate(resources.messages.resourceAdjustOverflowNote, {
          overflow: String(result.overflow),
          personal: String(result.personalAfter ?? 0),
        });
    }
    await interaction.reply({ content: reply, ephemeral: true });
    return;
  }

  const settings = resources.getSettings(interaction.guildId);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const channel = await fetchResourceChannel(interaction, settings.channel_id);
  if (action === 'donate') {
    const result = resources.donate({
      guildId: interaction.guildId,
      keyRaw: resourceKey,
      amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const embed = buildDonateEmbed(resources.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
      gc: result.gc,
      stockAfter: result.stockAfter,
      overflow: result.overflow,
    });
    const posted = await postSilentEmbed(channel, embed);
    if (!posted) {
      await interaction.reply({
        content: resources.messages.resourceNotConfigured,
        ephemeral: true,
      });
      return;
    }

    let reply = formatTemplate(resources.messages.resourceDonateSuccess, {
      amount: String(result.amount),
      name: result.type.display_name,
      added: String(result.added),
      gc: String(result.gc),
      stock: String(result.stockAfter),
    });
    if (result.overflow > 0) {
      reply +=
        '\n' +
        formatTemplate(resources.messages.resourceDonateOverflowNote, {
          overflow: String(result.overflow),
          name: result.type.display_name,
          personal: String(result.personalAfter ?? 0),
        });
    }
    await interaction.reply({ content: reply, ephemeral: true });
    return;
  }

  if (action === 'buy') {
    const result = resources.buy({
      guildId: interaction.guildId,
      keyRaw: resourceKey,
      amount,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const embed = buildBuyEmbed(resources.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
      gc: result.gc,
      stockAfter: result.stockAfter,
    });
    const posted = await postSilentEmbed(channel, embed);
    if (!posted) {
      await interaction.reply({
        content: resources.messages.resourceNotConfigured,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: formatTemplate(resources.messages.resourceBuySuccess, {
        amount: String(result.amount),
        name: result.type.display_name,
        gc: String(result.gc),
        stock: String(result.stockAfter),
      }),
      ephemeral: true,
    });
    return;
  }

  if (action === 'personal_add') {
    const taxEnabled = resources.isHouseTaxEnabled(interaction.guildId);
    let ownsHouse = false;
    if (taxEnabled) {
      try {
        ownsHouse = interaction.fields.getCheckbox('own_house');
      } catch {
        ownsHouse = true;
      }
    }

    const result = resources.personalAdd({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      keyRaw: resourceKey,
      amount,
      actorNickname: nickname,
      ownsHouse,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const embed = buildPersonalAddEmbed(resources.messages, {
      nickname,
      amount: result.amount,
      personalAmount: result.personalAmount,
      typeName: result.type.display_name,
      stockAfter: result.stockAfter,
      taxAdded: result.taxAdded,
      taxSkippedFull: result.taxSkippedFull,
      gc: result.gc,
      guildStockAfter: result.guildStockAfter,
    });
    const posted = await postSilentEmbed(channel, embed);
    if (!posted) {
      await interaction.reply({
        content: resources.messages.resourceNotConfigured,
        ephemeral: true,
      });
      return;
    }

    let success: string;
    if (result.taxAdded > 0) {
      success = formatTemplate(resources.messages.resourcePersonalAddTaxSuccess, {
        personal: String(result.personalAmount),
        tax: String(result.taxAdded),
        name: result.type.display_name,
        gc: String(result.gc),
        stock: String(result.stockAfter),
      });
    } else if (result.taxSkippedFull) {
      success = formatTemplate(
        resources.messages.resourcePersonalAddTaxSkippedFull,
        {
          amount: String(result.amount),
          name: result.type.display_name,
          stock: String(result.stockAfter),
        },
      );
    } else {
      success = formatTemplate(resources.messages.resourcePersonalAddSuccess, {
        amount: String(result.personalAmount),
        name: result.type.display_name,
        stock: String(result.stockAfter),
      });
    }

    await interaction.reply({
      content: success,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: resources.messages.unknownSubcommand,
    ephemeral: true,
  });
}

async function handlePersonalRemoveMultiModal(
  interaction: ModalSubmitInteraction,
  resources: ResourceService,
): Promise<void> {
  const guildId = interaction.guildId!;
  const settings = resources.getSettings(guildId);
  if (!settings) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const requested: Array<{ key: string; amount: number }> = [];
  for (const [customId] of interaction.fields.fields) {
    const key = parsePersonalRemoveQtyCustomId(customId);
    if (!key) continue;
    const raw = interaction.fields.getTextInputValue(customId).trim();
    if (raw === '' || raw === '0') continue;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      await interaction.reply({
        content: resources.messages.resourceInvalidAmount,
        ephemeral: true,
      });
      return;
    }
    requested.push({ key, amount });
  }

  if (requested.length === 0) {
    await interaction.reply({
      content: resources.messages.resourceWizardPersonalRemoveNoneEntered,
      ephemeral: true,
    });
    return;
  }

  const stockByKey = new Map(
    resources
      .personalOverview(guildId, interaction.user.id)
      .map((r) => [r.type.key, r]),
  );

  for (const item of requested) {
    const row = stockByKey.get(item.key);
    if (!row || row.quantity < item.amount) {
      const name = row?.type.display_name ?? item.key;
      const available = row?.quantity ?? 0;
      await interaction.reply({
        content: formatTemplate(
          resources.messages.resourceWizardPersonalRemovePartialFail,
          {
            reason: formatTemplate(
              resources.messages.resourceInsufficientPersonal,
              { stock: String(available), name },
            ),
          },
        ),
        ephemeral: true,
      });
      return;
    }
  }

  const nickname = nicknameFrom(interaction);
  const applied: Array<{
    amount: number;
    typeName: string;
    stockAfter: number;
  }> = [];

  for (const item of requested) {
    const result = resources.personalRemove({
      guildId,
      userId: interaction.user.id,
      keyRaw: item.key,
      amount: item.amount,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({
        content: formatTemplate(
          resources.messages.resourceWizardPersonalRemovePartialFail,
          { reason: result.message },
        ),
        ephemeral: true,
      });
      return;
    }
    applied.push({
      amount: result.amount,
      typeName: result.type.display_name,
      stockAfter: result.stockAfter,
    });
  }

  const channel = await fetchResourceChannel(interaction, settings.channel_id);
  const embed =
    applied.length === 1
      ? buildPersonalRemoveEmbed(resources.messages, {
          nickname,
          amount: applied[0]!.amount,
          typeName: applied[0]!.typeName,
          stockAfter: applied[0]!.stockAfter,
        })
      : buildPersonalRemoveMultiEmbed(resources.messages, {
          nickname,
          lines: applied,
        });
  const posted = await postSilentEmbed(channel, embed);
  if (!posted) {
    await interaction.reply({
      content: resources.messages.resourceNotConfigured,
      ephemeral: true,
    });
    return;
  }

  const lines = applied
    .map((line) =>
      formatTemplate(resources.messages.resourceWizardPersonalRemoveSuccessLine, {
        amount: String(line.amount),
        name: line.typeName,
        stock: String(line.stockAfter),
      }),
    )
    .join('\n');

  await interaction.reply({
    content:
      applied.length === 1
        ? formatTemplate(resources.messages.resourcePersonalRemoveSuccess, {
            amount: String(applied[0]!.amount),
            name: applied[0]!.typeName,
            stock: String(applied[0]!.stockAfter),
          })
        : formatTemplate(
            resources.messages.resourceWizardPersonalRemoveMultiSuccess,
            { lines },
          ),
    ephemeral: true,
  });
}

async function fetchResourceChannel(
  interaction: ModalSubmitInteraction,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  const cached = interaction.guild?.channels.cache.get(channelId);
  if (cached?.isTextBased() && !cached.isDMBased()) {
    return cached;
  }
  try {
    const fetched = await interaction.guild?.channels.fetch(channelId);
    if (fetched?.isTextBased() && !fetched.isDMBased()) {
      return fetched;
    }
  } catch {
    return null;
  }
  return null;
}
