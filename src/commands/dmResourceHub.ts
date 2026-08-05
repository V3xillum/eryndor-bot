import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ChannelSelectMenuInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../config.js';
import type { ResourceService } from '../services/ResourceService.js';
import { formatTemplate } from '../utils/helpers.js';
import { addModalIntro } from '../utils/modalIntro.js';
import { hubMessage, hubOwnerOk } from './dmHubShared.js';
import { guildNickname } from './resourceEmbeds.js';
import { startResourceAmountWizard } from './resourceWizard.js';

export const DM_RESOURCE_HUB_PREFIX = 'drh:';

type ResourceHubAction =
  | 'setup'
  | 'clear'
  | 'adjust'
  | 'cap'
  | 'house_tax'
  | 'type_add'
  | 'type_edit'
  | 'type_remove';

function nicknameFrom(
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction
    | ChannelSelectMenuInteraction,
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

export async function startResourceHub(
  interaction: ChatInputCommandInteraction,
  resources: ResourceService,
): Promise<void> {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${DM_RESOURCE_HUB_PREFIX}pick:${interaction.user.id}`)
      .setPlaceholder(resources.messages.dmResourceHubPlaceholder.slice(0, 150))
      .addOptions(
        opt(resources, 'dmResourceHubOptSetup', 'setup'),
        opt(resources, 'dmResourceHubOptClear', 'clear'),
        opt(resources, 'dmResourceHubOptAdjust', 'adjust'),
        opt(resources, 'dmResourceHubOptCap', 'cap'),
        opt(resources, 'dmResourceHubOptHouseTax', 'house_tax'),
        opt(resources, 'dmResourceHubOptTypeAdd', 'type_add'),
        opt(resources, 'dmResourceHubOptTypeEdit', 'type_edit'),
        opt(resources, 'dmResourceHubOptTypeRemove', 'type_remove'),
      ),
  );

  await interaction.reply({
    content: resources.messages.dmResourceHubPrompt,
    components: [row],
    ephemeral: true,
  });
}

function opt(
  resources: ResourceService,
  labelKey:
    | 'dmResourceHubOptSetup'
    | 'dmResourceHubOptClear'
    | 'dmResourceHubOptAdjust'
    | 'dmResourceHubOptCap'
    | 'dmResourceHubOptHouseTax'
    | 'dmResourceHubOptTypeAdd'
    | 'dmResourceHubOptTypeEdit'
    | 'dmResourceHubOptTypeRemove',
  value: ResourceHubAction,
): StringSelectMenuOptionBuilder {
  const descKey = `${labelKey}Desc` as `${typeof labelKey}Desc`;
  return new StringSelectMenuOptionBuilder()
    .setLabel(resources.messages[labelKey].slice(0, 100))
    .setValue(value)
    .setDescription(resources.messages[descKey].slice(0, 100));
}

export async function handleResourceHubSelect(
  interaction: StringSelectMenuInteraction,
  deps: { resources: ResourceService; config: AppConfig },
): Promise<void> {
  const { resources, config } = deps;
  if (!interaction.customId.startsWith(DM_RESOURCE_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_RESOURCE_HUB_PREFIX.length).split(':');
  const [step, userId] = parts;
  if (!hubOwnerOk(interaction, userId!)) {
    await interaction.reply({
      content: resources.messages.dmResourceHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: resources.messages.guildOnly, ephemeral: true });
    return;
  }
  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({ content: resources.messages.unauthorized, ephemeral: true });
    return;
  }

  if (step === 'type_edit' || step === 'type_remove') {
    const key = interaction.values[0]!;
    if (step === 'type_remove') {
      const result = resources.removeType({
        guildId: interaction.guildId,
        nameRaw: key,
        actorUserId: interaction.user.id,
        actorNickname: nicknameFrom(interaction),
      });
      await interaction.update({
        content: result.ok
          ? formatTemplate(resources.messages.resourceTypeRemoveSuccess, {
              name: result.type.display_name,
              key: result.type.key,
            })
          : result.message,
        components: [],
      });
      return;
    }
    await interaction.showModal(
      buildTypeEditModal(resources, interaction.user.id, key, interaction.guildId),
    );
    return;
  }

  if (step !== 'pick') {
    await interaction.update({
      content: resources.messages.unknownSubcommand,
      components: [],
    });
    return;
  }

  const action = interaction.values[0] as ResourceHubAction;

  if (action === 'setup') {
    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`${DM_RESOURCE_HUB_PREFIX}setup:${interaction.user.id}`)
        .setPlaceholder(resources.messages.dmResourceHubSetupPlaceholder.slice(0, 150))
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1),
    );
    await hubMessage(interaction, {
      content: resources.messages.dmResourceHubSetupPrompt,
      components: [row],
    });
    return;
  }

  if (action === 'clear') {
    const cleared = resources.clear(interaction.guildId);
    await hubMessage(interaction, {
      content: cleared
        ? resources.messages.resourceClearSuccess
        : resources.messages.resourceClearNone,
    });
    return;
  }

  if (action === 'adjust') {
    await startResourceAmountWizard(interaction, resources, 'adjust');
    return;
  }

  if (action === 'cap') {
    await interaction.showModal(buildCapModal(resources, interaction.user.id, interaction.guildId));
    return;
  }

  if (action === 'house_tax') {
    await interaction.showModal(
      buildHouseTaxModal(resources, interaction.user.id, interaction.guildId),
    );
    return;
  }

  if (action === 'type_add') {
    await interaction.showModal(buildTypeAddModal(resources, interaction.user.id));
    return;
  }

  if (action === 'type_edit' || action === 'type_remove') {
    const types = resources.listTypes(interaction.guildId);
    if (types.length === 0) {
      await hubMessage(interaction, {
        content: resources.messages.resourceTypeListEmpty,
      });
      return;
    }
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${DM_RESOURCE_HUB_PREFIX}${action}:${interaction.user.id}`)
        .setPlaceholder(resources.messages.resourceWizardTypePlaceholder.slice(0, 150))
        .addOptions(
          types.slice(0, 25).map((t) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(t.display_name.slice(0, 100))
              .setValue(t.key)
              .setDescription(
                `sell ${t.sell_gc} · buy ${t.buy_gc}`.slice(0, 100),
              ),
          ),
        ),
    );
    await hubMessage(interaction, {
      content:
        action === 'type_edit'
          ? resources.messages.dmResourceHubTypeEditPick
          : resources.messages.dmResourceHubTypeRemovePick,
      components: [row],
    });
    return;
  }

  await hubMessage(interaction, { content: resources.messages.unknownSubcommand });
}

export async function handleResourceHubChannelSelect(
  interaction: ChannelSelectMenuInteraction,
  deps: { resources: ResourceService; config: AppConfig },
): Promise<void> {
  const { resources, config } = deps;
  if (!interaction.customId.startsWith(DM_RESOURCE_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_RESOURCE_HUB_PREFIX.length).split(':');
  const [step, userId] = parts;
  if (step !== 'setup' || !hubOwnerOk(interaction, userId!)) {
    await interaction.reply({
      content: resources.messages.dmResourceHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: resources.messages.guildOnly, ephemeral: true });
    return;
  }
  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({ content: resources.messages.unauthorized, ephemeral: true });
    return;
  }
  const channel = interaction.channels.first();
  if (!channel) {
    await interaction.update({
      content: resources.messages.unknownSubcommand,
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

export async function handleResourceHubModal(
  interaction: ModalSubmitInteraction,
  deps: { resources: ResourceService; config: AppConfig },
): Promise<void> {
  const { resources, config } = deps;
  if (!interaction.customId.startsWith(DM_RESOURCE_HUB_PREFIX)) return;
  const parts = interaction.customId.slice(DM_RESOURCE_HUB_PREFIX.length).split(':');
  const [step, userId, typeKey] = parts;
  if (!hubOwnerOk(interaction, userId!)) {
    await interaction.reply({
      content: resources.messages.dmResourceHubNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({ content: resources.messages.guildOnly, ephemeral: true });
    return;
  }
  if (!config.allowedUserIds.includes(interaction.user.id)) {
    await interaction.reply({ content: resources.messages.unauthorized, ephemeral: true });
    return;
  }

  const nick = nicknameFrom(interaction);

  if (step === 'cap') {
    const raw = interaction.fields.getTextInputValue('amount').trim();
    if (raw === '') {
      const cap = resources.getStorageCap(interaction.guildId);
      await interaction.reply({
        content: formatTemplate(resources.messages.resourceCapShow, {
          cap: String(cap),
        }),
        ephemeral: true,
      });
      return;
    }
    const amount = Number(raw);
    const result = resources.setStorageCap(interaction.guildId, amount);
    await interaction.reply({
      content: result.ok
        ? formatTemplate(resources.messages.resourceCapSuccess, {
            cap: String(result.cap),
          })
        : result.message,
      ephemeral: true,
    });
    return;
  }

  if (step === 'housetax') {
    const enabledRaw = interaction.fields.getStringSelectValues('enabled')[0];
    const thresholdRaw = interaction.fields.getTextInputValue('threshold').trim();
    const patch: { enabled?: boolean; threshold?: number } = {};
    if (enabledRaw === 'true' || enabledRaw === 'false') {
      patch.enabled = enabledRaw === 'true';
    }
    if (thresholdRaw !== '') {
      const threshold = Number(thresholdRaw);
      if (!Number.isInteger(threshold)) {
        await interaction.reply({
          content: resources.messages.resourceInvalidAmount,
          ephemeral: true,
        });
        return;
      }
      patch.threshold = threshold;
    }
    if (patch.enabled === undefined && patch.threshold === undefined) {
      const current = resources.getHouseTaxSettings(interaction.guildId);
      const enabledLabel = current.enabled
        ? resources.messages.resourceHouseTaxEnabledOn
        : resources.messages.resourceHouseTaxEnabledOff;
      await interaction.reply({
        content: formatTemplate(resources.messages.resourceHouseTaxShow, {
          enabled: enabledLabel,
          threshold: String(current.threshold),
        }),
        ephemeral: true,
      });
      return;
    }
    const result = resources.setHouseTaxSettings(interaction.guildId, patch);
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    const enabledLabel = result.enabled
      ? resources.messages.resourceHouseTaxEnabledOn
      : resources.messages.resourceHouseTaxEnabledOff;
    await interaction.reply({
      content: formatTemplate(resources.messages.resourceHouseTaxSuccess, {
        enabled: enabledLabel,
        threshold: String(result.threshold),
      }),
      ephemeral: true,
    });
    return;
  }

  if (step === 'typeadd') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const sell = Number(interaction.fields.getTextInputValue('sell').trim());
    const buyRaw = interaction.fields.getTextInputValue('buy').trim();
    const buy = buyRaw === '' ? undefined : Number(buyRaw);
    const result = resources.addType({
      guildId: interaction.guildId,
      displayName: name,
      sellGc: sell,
      buyGc: buy,
      actorUserId: interaction.user.id,
      actorNickname: nick,
    });
    await interaction.reply({
      content: result.ok
        ? formatTemplate(resources.messages.resourceTypeAddSuccess, {
            name: result.type.display_name,
            key: result.type.key,
            sell: String(result.type.sell_gc),
            buy: String(result.type.buy_gc),
          })
        : result.message,
      ephemeral: true,
    });
    return;
  }

  if (step === 'typeedit' && typeKey) {
    const renameRaw = interaction.fields.getTextInputValue('rename').trim();
    const sellRaw = interaction.fields.getTextInputValue('sell').trim();
    const buyRaw = interaction.fields.getTextInputValue('buy').trim();
    const result = resources.editType({
      guildId: interaction.guildId,
      nameRaw: typeKey,
      displayName: renameRaw === '' ? null : renameRaw,
      sellGc: sellRaw === '' ? null : Number(sellRaw),
      buyGc: buyRaw === '' ? null : Number(buyRaw),
      actorUserId: interaction.user.id,
      actorNickname: nick,
    });
    await interaction.reply({
      content: result.ok
        ? formatTemplate(resources.messages.resourceTypeEditSuccess, {
            name: result.type.display_name,
            key: result.type.key,
            sell: String(result.type.sell_gc),
            buy: String(result.type.buy_gc),
          })
        : result.message,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: resources.messages.unknownSubcommand,
    ephemeral: true,
  });
}

function buildCapModal(
  resources: ResourceService,
  userId: string,
  guildId: string,
): ModalBuilder {
  const cap = resources.getStorageCap(guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${DM_RESOURCE_HUB_PREFIX}cap:${userId}`)
    .setTitle(resources.messages.dmResourceHubCapTitle.slice(0, 45));
  addModalIntro(modal, resources.messages.dmResourceHubCapIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubCapAmountLabel.slice(0, 45))
      .setDescription(resources.messages.dmResourceHubCapAmountHint.slice(0, 100))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('amount')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(6)
          .setPlaceholder(String(cap)),
      ),
  );
  return modal;
}

function buildHouseTaxModal(
  resources: ResourceService,
  userId: string,
  guildId: string,
): ModalBuilder {
  const current = resources.getHouseTaxSettings(guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${DM_RESOURCE_HUB_PREFIX}housetax:${userId}`)
    .setTitle(resources.messages.dmResourceHubHouseTaxTitle.slice(0, 45));
  addModalIntro(modal, resources.messages.dmResourceHubHouseTaxIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubHouseTaxEnabledLabel.slice(0, 45))
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('enabled')
          .setRequired(false)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(resources.messages.resourceHouseTaxEnabledOn)
              .setValue('true')
              .setDefault(current.enabled),
            new StringSelectMenuOptionBuilder()
              .setLabel(resources.messages.resourceHouseTaxEnabledOff)
              .setValue('false')
              .setDefault(!current.enabled),
          ),
      ),
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubHouseTaxThresholdLabel.slice(0, 45))
      .setDescription(resources.messages.dmResourceHubHouseTaxThresholdHint.slice(0, 100))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('threshold')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4)
          .setPlaceholder(String(current.threshold)),
      ),
  );
  return modal;
}

function buildTypeAddModal(resources: ResourceService, userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${DM_RESOURCE_HUB_PREFIX}typeadd:${userId}`)
    .setTitle(resources.messages.dmResourceHubTypeAddTitle.slice(0, 45));
  addModalIntro(modal, resources.messages.dmResourceHubTypeAddIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubTypeNameLabel.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(64)
          .setPlaceholder('Hout'),
      ),
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubTypeSellLabel.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('sell')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setPlaceholder('1'),
      ),
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubTypeBuyLabel.slice(0, 45))
      .setDescription(resources.messages.dmResourceHubTypeBuyHint.slice(0, 100))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('buy')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4),
      ),
  );
  return modal;
}

function buildTypeEditModal(
  resources: ResourceService,
  userId: string,
  typeKey: string,
  guildId: string,
): ModalBuilder {
  const type = resources.listTypes(guildId).find((t) => t.key === typeKey);
  const modal = new ModalBuilder()
    .setCustomId(`${DM_RESOURCE_HUB_PREFIX}typeedit:${userId}:${typeKey}`)
    .setTitle(resources.messages.dmResourceHubTypeEditTitle.slice(0, 45));
  addModalIntro(modal, resources.messages.dmResourceHubTypeEditIntro);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubTypeRenameLabel.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('rename')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(64)
          .setPlaceholder(type?.display_name ?? typeKey),
      ),
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubTypeSellLabel.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('sell')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4)
          .setPlaceholder(type ? String(type.sell_gc) : '1'),
      ),
    new LabelBuilder()
      .setLabel(resources.messages.dmResourceHubTypeBuyLabel.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('buy')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4)
          .setPlaceholder(type ? String(type.buy_gc) : '2'),
      ),
  );
  return modal;
}
