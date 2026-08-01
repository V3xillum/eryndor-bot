import {
  ActionRowBuilder,
  EmbedBuilder,
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

  const options = types.map((t) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(t.display_name.slice(0, 100))
      .setValue(t.key)
      .setDescription(t.key.slice(0, 100)),
  );

  await interaction.reply({
    content: deps.production.messages.productionWizardPickResource,
    components: [
      selectRow(
        `${PRODUCTION_WIZARD_PREFIX}add:res:${interaction.user.id}`,
        deps.production.messages.productionWizardResourcePlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
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

  const options = sources.map((s) =>
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

  await interaction.reply({
    content: deps.production.messages.productionWizardPickSource,
    components: [
      selectRow(
        `${PRODUCTION_WIZARD_PREFIX}${action}:src:${interaction.user.id}`,
        deps.production.messages.productionWizardSourcePlaceholder,
        options,
      ),
    ],
    ephemeral: true,
  });
}

export async function handleProductionWizardSelect(
  interaction: StringSelectMenuInteraction,
  deps: { production: ProductionService; resources: ResourceService },
): Promise<void> {
  const parts = parseWizardId(interaction.customId);
  if (!parts) return;

  const [action, step, ownerId, ...rest] = parts;
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

  if (action === 'add' && step === 'res') {
    const resourceKey = interaction.values[0];
    const type = deps.resources.getType(interaction.guildId, resourceKey);
    const typeName = type?.display_name ?? resourceKey;
    await interaction.update({
      content: formatTemplate(
        deps.production.messages.productionWizardPickInterval,
        { type: typeName },
      ),
      components: [
        selectRow(
          `${PRODUCTION_WIZARD_PREFIX}add:interval:${interaction.user.id}:${resourceKey}`,
          deps.production.messages.productionWizardIntervalPlaceholder,
          [
            new StringSelectMenuOptionBuilder()
              .setLabel(deps.production.messages.productionIntervalDaily)
              .setValue('daily'),
            new StringSelectMenuOptionBuilder()
              .setLabel(deps.production.messages.productionIntervalWeekly)
              .setValue('weekly'),
          ],
        ),
      ],
    });
    return;
  }

  if (action === 'add' && step === 'interval') {
    const resourceKey = rest[0];
    const interval = interaction.values[0] as ProductionInterval;
    const modal = new ModalBuilder()
      .setCustomId(
        `${PRODUCTION_WIZARD_PREFIX}add:modal:${interaction.user.id}:${resourceKey}:${interval}`,
      )
      .setTitle(deps.production.messages.productionWizardAddModalTitle)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel(deps.production.messages.productionWizardNameLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('workers')
            .setLabel(deps.production.messages.productionWizardWorkersLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2)
            .setValue('0'),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('yield')
            .setLabel(deps.production.messages.productionWizardYieldLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('max_workers')
            .setLabel(deps.production.messages.productionWizardMaxWorkersLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(2)
            .setPlaceholder('5'),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (
    (action === 'workers' || action === 'yield' || action === 'remove') &&
    step === 'src'
  ) {
    const sourceId = Number(interaction.values[0]);
    const source = deps.production.getById(sourceId);
    if (!source || source.guild_id !== interaction.guildId) {
      await interaction.update({
        content: deps.production.messages.productionUnknown,
        components: [],
      });
      return;
    }

    if (action === 'remove') {
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
      return;
    }

    if (action === 'workers') {
      const modal = new ModalBuilder()
        .setCustomId(
          `${PRODUCTION_WIZARD_PREFIX}workers:modal:${interaction.user.id}:${sourceId}`,
        )
        .setTitle(
          formatTemplate(
            deps.production.messages.productionWizardWorkersModalTitle,
            { name: source.name },
          ).slice(0, 45),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('workers')
              .setLabel(
                formatTemplate(
                  deps.production.messages.productionWizardWorkersModalLabel,
                  { max: String(source.max_workers) },
                ).slice(0, 45),
              )
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(2)
              .setValue(String(source.workers)),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(
        `${PRODUCTION_WIZARD_PREFIX}yield:modal:${interaction.user.id}:${sourceId}`,
      )
      .setTitle(
        formatTemplate(
          deps.production.messages.productionWizardYieldModalTitle,
          { name: source.name },
        ).slice(0, 45),
      )
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('yield')
            .setLabel(
              deps.production.messages.productionWizardYieldModalLabel.slice(
                0,
                45,
              ),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4)
            .setValue(String(source.yield_per_worker)),
        ),
      );
    await interaction.showModal(modal);
  }
}

export async function handleProductionWizardModal(
  interaction: ModalSubmitInteraction,
  deps: { production: ProductionService; resources: ResourceService },
): Promise<void> {
  const parts = parseWizardId(interaction.customId);
  if (!parts) return;

  const [action, step, ownerId, ...rest] = parts;
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

  if (action === 'add' && step === 'modal') {
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
    return;
  }

  if (action === 'workers' && step === 'modal') {
    const sourceId = Number(rest[0]);
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
    const type =
      deps.resources.getType(interaction.guildId, result.source.resource_key);
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

  if (action === 'yield' && step === 'modal') {
    const sourceId = Number(rest[0]);
    const yieldPerWorker = Number(
      interaction.fields.getTextInputValue('yield'),
    );
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
    const type =
      deps.resources.getType(interaction.guildId, result.source.resource_key);
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
