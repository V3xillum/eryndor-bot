import {
  ActionRowBuilder,
  EmbedBuilder,
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
import type { ProductionService } from '../services/ProductionService.js';
import type { ResourceService } from '../services/ResourceService.js';
import type { ProductionInterval } from '../types.js';
import { formatTemplate } from '../utils/helpers.js';
import { addModalIntro } from '../utils/modalIntro.js';
import { guildNickname } from './resourceEmbeds.js';

export const PRODUCTION_WIZARD_PREFIX = 'pwiz:';

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

function selectRow(
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

function parseWizardId(customId: string): string[] | null {
  if (!customId.startsWith(PRODUCTION_WIZARD_PREFIX)) return null;
  return customId.slice(PRODUCTION_WIZARD_PREFIX.length).split(':');
}

function sourceOptions(
  production: ProductionService,
  guildId: string,
): StringSelectMenuOptionBuilder[] {
  return production.list(guildId).slice(0, 25).map((s) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(s.name.slice(0, 100))
      .setValue(String(s.id))
      .setDescription(
        `${s.workers}/${s.max_workers} · ${s.yield_per_worker}/${s.interval}`.slice(
          0,
          100,
        ),
      ),
  );
}

/** One modal: type + interval + name + workers + yield (max_workers = default). */
export async function startAddWizard(
  interaction: ChatInputCommandInteraction,
  deps: { production: ProductionService; resources: ResourceService },
): Promise<void> {
  const types = deps.resources.listTypes(interaction.guildId!);
  if (types.length === 0) {
    await interaction.reply({
      content: deps.production.messages.productionWizardNoTypes,
      ephemeral: true,
    });
    return;
  }

  const typeOptions = types.slice(0, 25).map((t) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(t.display_name.slice(0, 100))
      .setValue(t.key)
      .setDescription(t.key.slice(0, 100)),
  );

  const modal = new ModalBuilder()
    .setCustomId(`${PRODUCTION_WIZARD_PREFIX}add:form:${interaction.user.id}`)
    .setTitle(deps.production.messages.productionWizardAddModalTitle.slice(0, 45));
  // 5 labels already = Discord modal max; intro goes on the first label.
  modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(
          deps.production.messages.productionWizardResourceLabel.slice(0, 45),
        )
        .setDescription(
          deps.production.messages.productionWizardAddIntro.slice(0, 100),
        )
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('type')
            .setPlaceholder(
              deps.production.messages.productionWizardResourcePlaceholder.slice(
                0,
                150,
              ),
            )
            .setRequired(true)
            .addOptions(typeOptions),
        ),
      new LabelBuilder()
        .setLabel(
          deps.production.messages.productionWizardIntervalLabel.slice(0, 45),
        )
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('interval')
            .setPlaceholder(
              deps.production.messages.productionWizardIntervalPlaceholder.slice(
                0,
                150,
              ),
            )
            .setRequired(true)
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(deps.production.messages.productionIntervalDaily)
                .setValue('daily'),
              new StringSelectMenuOptionBuilder()
                .setLabel(deps.production.messages.productionIntervalWeekly)
                .setValue('weekly'),
            ),
        ),
      new LabelBuilder()
        .setLabel(deps.production.messages.productionWizardNameLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64),
        ),
      new LabelBuilder()
        .setLabel(
          deps.production.messages.productionWizardWorkersLabel.slice(0, 45),
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('workers')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2)
            .setValue('0'),
        ),
      new LabelBuilder()
        .setLabel(deps.production.messages.productionWizardYieldLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('yield')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4),
        ),
    );

  await interaction.showModal(modal);
}

export async function startSourcePickWizard(
  interaction: ChatInputCommandInteraction,
  deps: { production: ProductionService },
  action: 'workers' | 'yield' | 'remove',
): Promise<void> {
  const sources = deps.production.list(interaction.guildId!);
  if (sources.length === 0) {
    await interaction.reply({
      content: deps.production.messages.productionWizardNoSources,
      ephemeral: true,
    });
    return;
  }

  const options = sourceOptions(deps.production, interaction.guildId!);

  if (action === 'remove') {
    await interaction.reply({
      content: deps.production.messages.productionWizardPickSource,
      components: [
        selectRow(
          `${PRODUCTION_WIZARD_PREFIX}remove:src:${interaction.user.id}`,
          deps.production.messages.productionWizardSourcePlaceholder,
          options,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const valueCustomId = action === 'workers' ? 'workers' : 'yield';
  const valueLabel =
    action === 'workers'
      ? deps.production.messages.productionWizardWorkersLabel
      : deps.production.messages.productionWizardYieldLabel;
  const title =
    action === 'workers'
      ? deps.production.messages.productionWizardWorkersFormTitle
      : deps.production.messages.productionWizardYieldFormTitle;

  const modal = new ModalBuilder()
    .setCustomId(
      `${PRODUCTION_WIZARD_PREFIX}${action}:form:${interaction.user.id}`,
    )
    .setTitle(title.slice(0, 45));
  addModalIntro(
    modal,
    action === 'workers'
      ? deps.production.messages.productionWizardWorkersIntro
      : deps.production.messages.productionWizardYieldIntro,
  );
  modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(
          deps.production.messages.productionWizardSourceLabel.slice(0, 45),
        )
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('source')
            .setPlaceholder(
              deps.production.messages.productionWizardSourcePlaceholder.slice(
                0,
                150,
              ),
            )
            .setRequired(true)
            .addOptions(options),
        ),
      new LabelBuilder()
        .setLabel(valueLabel.slice(0, 45))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(valueCustomId)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(action === 'workers' ? 2 : 4),
        ),
    );

  await interaction.showModal(modal);
}

export async function handleProductionWizardSelect(
  interaction: StringSelectMenuInteraction,
  deps: { production: ProductionService; resources: ResourceService },
): Promise<void> {
  const parts = parseWizardId(interaction.customId);
  if (!parts) return;

  const [action, step, ownerId] = parts;
  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      content: deps.production.messages.productionWizardNotYours,
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: deps.production.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (action === 'remove' && step === 'src') {
    const sourceId = Number(interaction.values[0]);
    const source = deps.production.getById(sourceId);
    if (!source || source.guild_id !== interaction.guildId) {
      await interaction.update({
        content: deps.production.messages.productionUnknown,
        components: [],
      });
      return;
    }

    const result = deps.production.remove({
      guildId: interaction.guildId,
      sourceId,
      actorUserId: interaction.user.id,
      actorNickname: nicknameFrom(interaction),
    });
    if (!result.ok) {
      await interaction.update({ content: result.message, components: [] });
      return;
    }
    await interaction.update({
      content: formatTemplate(
        deps.production.messages.productionRemoveSuccess,
        { name: result.source.name },
      ),
      components: [],
    });
  }
}

export async function handleProductionWizardModal(
  interaction: ModalSubmitInteraction,
  deps: { production: ProductionService; resources: ResourceService },
): Promise<void> {
  const parts = parseWizardId(interaction.customId);
  if (!parts) return;

  const [action, step, ownerId] = parts;
  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      content: deps.production.messages.productionWizardNotYours,
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({
      content: deps.production.messages.guildOnly,
      ephemeral: true,
    });
    return;
  }

  const nickname = nicknameFrom(interaction);

  if (action === 'add' && step === 'form') {
    const resourceKey = interaction.fields.getStringSelectValues('type')[0];
    const interval = interaction.fields.getStringSelectValues(
      'interval',
    )[0] as ProductionInterval;
    const name = interaction.fields.getTextInputValue('name');
    const workers = Number(interaction.fields.getTextInputValue('workers'));
    const yieldPerWorker = Number(interaction.fields.getTextInputValue('yield'));

    if (!resourceKey || (interval !== 'daily' && interval !== 'weekly')) {
      await interaction.reply({
        content: deps.production.messages.unknownSubcommand,
        ephemeral: true,
      });
      return;
    }

    const result = deps.production.add({
      guildId: interaction.guildId,
      name,
      resourceKeyRaw: resourceKey,
      workers,
      maxWorkers: null,
      yieldPerWorker,
      interval,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const intervalLabel =
      result.source.interval === 'weekly'
        ? deps.production.messages.productionIntervalWeekly
        : deps.production.messages.productionIntervalDaily;

    await interaction.reply({
      content: formatTemplate(deps.production.messages.productionAddSuccess, {
        name: result.source.name,
        workers: String(result.source.workers),
        max: String(result.source.max_workers),
        yield: String(result.source.yield_per_worker),
        type: result.type.display_name,
        interval: intervalLabel.toLowerCase(),
      }),
      ephemeral: true,
    });
    return;
  }

  if (action === 'workers' && step === 'form') {
    const sourceId = Number(interaction.fields.getStringSelectValues('source')[0]);
    const workers = Number(interaction.fields.getTextInputValue('workers'));
    const result = deps.production.setWorkers({
      guildId: interaction.guildId,
      sourceId,
      workers,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    const type = deps.resources.getType(
      interaction.guildId,
      result.source.resource_key,
    );
    const intervalLabel =
      result.source.interval === 'weekly'
        ? deps.production.messages.productionIntervalWeekly
        : deps.production.messages.productionIntervalDaily;
    await interaction.reply({
      content: formatTemplate(
        deps.production.messages.productionWorkersSuccess,
        {
          name: result.source.name,
          workers: String(result.source.workers),
          max: String(result.source.max_workers),
          total: String(deps.production.expectedYield(result.source)),
          type: type?.display_name ?? result.source.resource_key,
          interval: intervalLabel.toLowerCase(),
        },
      ),
      ephemeral: true,
    });
    return;
  }

  if (action === 'yield' && step === 'form') {
    const sourceId = Number(interaction.fields.getStringSelectValues('source')[0]);
    const yieldPerWorker = Number(interaction.fields.getTextInputValue('yield'));
    const result = deps.production.setYield({
      guildId: interaction.guildId,
      sourceId,
      yieldPerWorker,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }
    const type = deps.resources.getType(
      interaction.guildId,
      result.source.resource_key,
    );
    const intervalLabel =
      result.source.interval === 'weekly'
        ? deps.production.messages.productionIntervalWeekly
        : deps.production.messages.productionIntervalDaily;
    await interaction.reply({
      content: formatTemplate(deps.production.messages.productionYieldSuccess, {
        name: result.source.name,
        yield: String(result.source.yield_per_worker),
        total: String(deps.production.expectedYield(result.source)),
        type: type?.display_name ?? result.source.resource_key,
        interval: intervalLabel.toLowerCase(),
      }),
      ephemeral: true,
    });
    return;
  }

  // Legacy multi-step modal customIds (still handle if in flight)
  if (action === 'add' && step === 'modal') {
    const rest = parts.slice(3);
    const [resourceKey, intervalRaw] = rest;
    const interval = intervalRaw as ProductionInterval;
    const name = interaction.fields.getTextInputValue('name');
    const workers = Number(interaction.fields.getTextInputValue('workers'));
    const yieldPerWorker = Number(interaction.fields.getTextInputValue('yield'));
    const maxRaw = interaction.fields.getTextInputValue('max_workers').trim();
    const maxWorkers = maxRaw === '' ? null : Number(maxRaw);

    const result = deps.production.add({
      guildId: interaction.guildId,
      name,
      resourceKeyRaw: resourceKey,
      workers,
      maxWorkers,
      yieldPerWorker,
      interval,
      actorUserId: interaction.user.id,
      actorNickname: nickname,
    });
    if (!result.ok) {
      await interaction.reply({ content: result.message, ephemeral: true });
      return;
    }

    const intervalLabel =
      result.source.interval === 'weekly'
        ? deps.production.messages.productionIntervalWeekly
        : deps.production.messages.productionIntervalDaily;

    await interaction.reply({
      content: formatTemplate(deps.production.messages.productionAddSuccess, {
        name: result.source.name,
        workers: String(result.source.workers),
        max: String(result.source.max_workers),
        yield: String(result.source.yield_per_worker),
        type: result.type.display_name,
        interval: intervalLabel.toLowerCase(),
      }),
      ephemeral: true,
    });
  }
}

/** Used by list command only — keeps command file thinner. */
export function buildProductionListEmbed(
  production: ProductionService,
  resources: ResourceService,
  guildId: string,
): EmbedBuilder | null {
  const sources = production.list(guildId);
  if (sources.length === 0) return null;

  const lines = sources.map((s) => {
    const type = resources.getType(guildId, s.resource_key);
    const intervalLabel =
      s.interval === 'weekly'
        ? production.messages.productionIntervalWeekly
        : production.messages.productionIntervalDaily;
    return formatTemplate(production.messages.productionListItem, {
      name: s.name,
      workers: String(s.workers),
      max: String(s.max_workers),
      total: String(production.expectedYield(s)),
      type: type?.display_name ?? s.resource_key,
      interval: intervalLabel.toLowerCase(),
    });
  });

  return new EmbedBuilder()
    .setTitle(production.messages.productionListTitle)
    .setDescription(lines.join('\n').slice(0, 4000));
}
