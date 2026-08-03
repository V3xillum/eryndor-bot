import {
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
  guildNickname,
  postSilentEmbed,
} from './resourceEmbeds.js';

export const RESOURCE_WIZARD_PREFIX = 'rwiz:';

export type ResourceAmountAction =
  | 'donate'
  | 'buy'
  | 'personal_add'
  | 'personal_remove'
  | 'adjust';

function nicknameFrom(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
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
): string {
  switch (action) {
    case 'donate':
      return resources.messages.resourceWizardDonateIntro;
    case 'buy':
      return resources.messages.resourceWizardBuyIntro;
    case 'personal_add':
      return resources.messages.resourceWizardPersonalAddIntro;
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

  const options = typeOptionsFor(
    resources,
    interaction.guildId,
    interaction.user.id,
    action,
  );
  if (!options || options.length === 0) {
    await interaction.reply({
      content:
        action === 'personal_remove'
          ? resources.messages.resourcePersonalEmpty
          : resources.messages.resourceTypeListEmpty,
      ephemeral: true,
    });
    return;
  }

  const amountPlaceholder = resources.messages.resourceWizardAmountPlaceholder;
  const amountLabel = resources.messages.resourceWizardAmountLabel;

  const modal = new ModalBuilder()
    .setCustomId(`${RESOURCE_WIZARD_PREFIX}${action}:${interaction.user.id}`)
    .setTitle(modalTitle(resources, action).slice(0, 45));

  addModalIntro(modal, modalIntro(resources, action));

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
        .setLabel(resources.messages.resourceWizardAdjustDirectionLabel.slice(0, 45))
        .setDescription(
          resources.messages.resourceWizardAdjustDirectionHint.slice(0, 100),
        )
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('direction')
            .setPlaceholder(
              resources.messages.resourceWizardAdjustDirectionPlaceholder.slice(
                0,
                150,
              ),
            )
            .setRequired(true)
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(resources.messages.resourceWizardAdjustDirectionAdd)
                .setValue('add')
                .setDescription(
                  resources.messages.resourceWizardAdjustDirectionAddDesc.slice(
                    0,
                    100,
                  ),
                ),
              new StringSelectMenuOptionBuilder()
                .setLabel(resources.messages.resourceWizardAdjustDirectionRemove)
                .setValue('remove')
                .setDescription(
                  resources.messages.resourceWizardAdjustDirectionRemoveDesc.slice(
                    0,
                    100,
                  ),
                ),
            ),
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
            .setPlaceholder(amountPlaceholder.slice(0, 100)),
        ),
    );
  } else {
    modal.addLabelComponents(
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
    );
  }

  await interaction.showModal(modal);
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
  const action = actionRaw as ResourceAmountAction;

  if (userId !== interaction.user.id) {
    await interaction.reply({
      content: resources.messages.resourceWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  if (
    action !== 'donate' &&
    action !== 'buy' &&
    action !== 'personal_add' &&
    action !== 'personal_remove' &&
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
  if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
    await interaction.reply({
      content: resources.messages.resourceInvalidAmount,
      ephemeral: true,
    });
    return;
  }

  const nickname = nicknameFrom(interaction);

  if (action === 'adjust') {
    const direction = interaction.fields.getStringSelectValues('direction')[0];
    if (direction !== 'add' && direction !== 'remove') {
      await interaction.reply({
        content: resources.messages.resourceWizardAdjustDirectionInvalid,
        ephemeral: true,
      });
      return;
    }
    const delta = direction === 'remove' ? -amount : amount;
    const result = resources.adjust({
      guildId: interaction.guildId,
      keyRaw: resourceKey,
      delta,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    const verb =
      direction === 'remove'
        ? resources.messages.resourceAdjustRemoved
        : resources.messages.resourceAdjustAdded;
    let reply = formatTemplate(resources.messages.resourceAdjustSuccess, {
      verb,
      amount: String(amount),
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
    const result = resources.personalAdd({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      keyRaw: resourceKey,
      amount,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const embed = buildPersonalAddEmbed(resources.messages, {
      nickname,
      amount: result.amount,
      typeName: result.type.display_name,
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
      content: formatTemplate(resources.messages.resourcePersonalAddSuccess, {
        amount: String(result.amount),
        name: result.type.display_name,
        stock: String(result.stockAfter),
      }),
      ephemeral: true,
    });
    return;
  }

  const result = resources.personalRemove({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    keyRaw: resourceKey,
    amount,
    actorNickname: nickname,
  });
  if (!result.ok) {
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  const embed = buildPersonalRemoveEmbed(resources.messages, {
    nickname,
    amount: result.amount,
    typeName: result.type.display_name,
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
    content: formatTemplate(resources.messages.resourcePersonalRemoveSuccess, {
      amount: String(result.amount),
      name: result.type.display_name,
      stock: String(result.stockAfter),
    }),
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
