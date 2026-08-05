import {
  EmbedBuilder,
  MessageFlags,
  type GuildBasedChannel,
  type GuildMember,
  type User,
} from 'discord.js';
import type { Messages } from '../types.js';
import { formatTemplate } from '../utils/helpers.js';

const COLOR_DONATE = 0x3d8b6e;
const COLOR_BUY = 0xb8860b;
const COLOR_BUILDING_DONATE = 0x4a7c9b;
const COLOR_BUILDING_FUND = 0x6b7c8a;
const COLOR_CONTRIBUTE = 0x8b6b4a;
const COLOR_PERSONAL_ADD = 0x5b7a9a;
const COLOR_PERSONAL_REMOVE = 0x7a6b5b;
const COLOR_PRODUCTION = 0x5a7a4a;

export function guildNickname(
  member: GuildMember | null | undefined,
  user: User,
  apiNick?: string | null,
): string {
  if (member?.displayName) return member.displayName;
  if (apiNick) return apiNick;
  return user.displayName ?? user.username;
}

export async function postSilentEmbed(
  channel: GuildBasedChannel | null,
  embed: EmbedBuilder,
): Promise<boolean> {
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;
  await channel.send({
    embeds: [embed],
    flags: MessageFlags.SuppressNotifications,
  });
  return true;
}

function withPhase(body: string, phaseNote: string): string {
  return phaseNote ? `${body}\n\n${phaseNote}` : body;
}

export function buildDonateEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    typeName: string;
    gc: number;
    stockAfter: number;
    overflow?: number;
  },
): EmbedBuilder {
  const overflowNote =
    input.overflow && input.overflow > 0
      ? formatTemplate(messages.resourceEmbedDonateOverflow, {
          overflow: String(input.overflow),
          type: input.typeName,
        })
      : '';

  return new EmbedBuilder()
    .setColor(COLOR_DONATE)
    .setTitle(messages.resourceEmbedDonateTitle)
    .setDescription(
      formatTemplate(messages.resourceEmbedDonateDesc, {
        nickname: input.nickname,
        amount: String(input.amount),
        type: input.typeName,
        gc: String(input.gc),
        stock: String(input.stockAfter),
        overflow: overflowNote,
      }),
    )
    .setTimestamp();
}

export function buildBuyEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    typeName: string;
    gc: number;
    stockAfter: number;
  },
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_BUY)
    .setTitle(messages.resourceEmbedBuyTitle)
    .setDescription(
      formatTemplate(messages.resourceEmbedBuyDesc, {
        nickname: input.nickname,
        amount: String(input.amount),
        type: input.typeName,
        gc: String(input.gc),
        stock: String(input.stockAfter),
      }),
    )
    .setTimestamp();
}

export function buildBuildingDonateEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    typeName: string;
    buildingName: string;
    gc: number;
    progress: string;
    phaseNote: string;
    fromPersonal?: boolean;
    personalAfter?: number;
  },
): EmbedBuilder {
  const body = formatTemplate(
    input.fromPersonal
      ? messages.resourceEmbedBuildingDonatePersonalDesc
      : messages.resourceEmbedBuildingDonateDesc,
    {
      nickname: input.nickname,
      amount: String(input.amount),
      type: input.typeName,
      building: input.buildingName,
      gc: String(input.gc),
      progress: input.progress,
      personal: String(input.personalAfter ?? 0),
    },
  );

  return new EmbedBuilder()
    .setColor(COLOR_BUILDING_DONATE)
    .setTitle(
      input.fromPersonal
        ? messages.resourceEmbedBuildingDonatePersonalTitle
        : messages.resourceEmbedBuildingDonateTitle,
    )
    .setDescription(withPhase(body, input.phaseNote))
    .setTimestamp();
}

export function buildBuildingDonateMultiEmbed(
  messages: Messages,
  input: {
    nickname: string;
    buildingName: string;
    gc: number;
    progress: string;
    phaseNote: string;
    fromPersonal: boolean;
    lines: Array<{
      amount: number;
      typeName: string;
      personalAfter?: number;
    }>;
  },
): EmbedBuilder {
  const lines = input.lines
    .map((line) =>
      formatTemplate(
        input.fromPersonal
          ? messages.resourceEmbedBuildingDonatePersonalMultiLine
          : messages.resourceEmbedBuildingDonateMultiLine,
        {
          amount: String(line.amount),
          type: line.typeName,
          personal: String(line.personalAfter ?? 0),
        },
      ),
    )
    .join('\n');

  const body = formatTemplate(
    input.fromPersonal
      ? messages.resourceEmbedBuildingDonatePersonalMultiDesc
      : messages.resourceEmbedBuildingDonateMultiDesc,
    {
      nickname: input.nickname,
      building: input.buildingName,
      gc: String(input.gc),
      lines,
      progress: input.progress,
    },
  );

  return new EmbedBuilder()
    .setColor(COLOR_BUILDING_DONATE)
    .setTitle(
      input.fromPersonal
        ? messages.resourceEmbedBuildingDonatePersonalTitle
        : messages.resourceEmbedBuildingDonateTitle,
    )
    .setDescription(withPhase(body, input.phaseNote).slice(0, 4000))
    .setTimestamp();
}

export function buildBuildingFundEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    typeName: string;
    buildingName: string;
    stockAfter: number;
    progress: string;
    phaseNote: string;
  },
): EmbedBuilder {
  const body = formatTemplate(messages.resourceEmbedBuildingFundDesc, {
    nickname: input.nickname,
    amount: String(input.amount),
    type: input.typeName,
    building: input.buildingName,
    stock: String(input.stockAfter),
    progress: input.progress,
  });

  return new EmbedBuilder()
    .setColor(COLOR_BUILDING_FUND)
    .setTitle(messages.resourceEmbedBuildingFundTitle)
    .setDescription(withPhase(body, input.phaseNote))
    .setTimestamp();
}

export function buildBuildingFundMultiEmbed(
  messages: Messages,
  input: {
    nickname: string;
    buildingName: string;
    lines: Array<{ amount: number; typeName: string; stockAfter: number }>;
    progress: string;
    phaseNote: string;
  },
): EmbedBuilder {
  const lines = input.lines
    .map((line) =>
      formatTemplate(messages.resourceEmbedBuildingFundMultiLine, {
        amount: String(line.amount),
        type: line.typeName,
        stock: String(line.stockAfter),
      }),
    )
    .join('\n');

  const body = formatTemplate(messages.resourceEmbedBuildingFundMultiDesc, {
    nickname: input.nickname,
    building: input.buildingName,
    lines,
    progress: input.progress,
  });

  return new EmbedBuilder()
    .setColor(COLOR_BUILDING_FUND)
    .setTitle(messages.resourceEmbedBuildingFundTitle)
    .setDescription(withPhase(body, input.phaseNote).slice(0, 4000))
    .setTimestamp();
}

export function buildContributeEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    buildingName: string;
    gc: number;
    progress: string;
    phaseNote: string;
  },
): EmbedBuilder {
  const body = formatTemplate(messages.resourceEmbedContributeDesc, {
    nickname: input.nickname,
    amount: String(input.amount),
    building: input.buildingName,
    gc: String(input.gc),
    progress: input.progress,
  });

  return new EmbedBuilder()
    .setColor(COLOR_CONTRIBUTE)
    .setTitle(messages.resourceEmbedContributeTitle)
    .setDescription(withPhase(body, input.phaseNote))
    .setTimestamp();
}

export function buildPersonalAddEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    personalAmount: number;
    typeName: string;
    stockAfter: number;
    taxAdded: number;
    taxSkippedFull: boolean;
    gc: number;
    guildStockAfter: number | null;
  },
): EmbedBuilder {
  let description: string;
  if (input.taxAdded > 0) {
    description = formatTemplate(messages.resourceEmbedPersonalAddTaxDesc, {
      nickname: input.nickname,
      personal: String(input.personalAmount),
      tax: String(input.taxAdded),
      type: input.typeName,
      gc: String(input.gc),
      stock: String(input.stockAfter),
      guild: String(input.guildStockAfter ?? 0),
    });
  } else if (input.taxSkippedFull) {
    description = formatTemplate(messages.resourceEmbedPersonalAddTaxSkippedDesc, {
      nickname: input.nickname,
      amount: String(input.amount),
      type: input.typeName,
      stock: String(input.stockAfter),
    });
  } else {
    description = formatTemplate(messages.resourceEmbedPersonalAddDesc, {
      nickname: input.nickname,
      amount: String(input.personalAmount),
      type: input.typeName,
      stock: String(input.stockAfter),
    });
  }

  return new EmbedBuilder()
    .setColor(COLOR_PERSONAL_ADD)
    .setTitle(messages.resourceEmbedPersonalAddTitle)
    .setDescription(description)
    .setTimestamp();
}

export function buildPersonalRemoveEmbed(
  messages: Messages,
  input: {
    nickname: string;
    amount: number;
    typeName: string;
    stockAfter: number;
  },
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_PERSONAL_REMOVE)
    .setTitle(messages.resourceEmbedPersonalRemoveTitle)
    .setDescription(
      formatTemplate(messages.resourceEmbedPersonalRemoveDesc, {
        nickname: input.nickname,
        amount: String(input.amount),
        type: input.typeName,
        stock: String(input.stockAfter),
      }),
    )
    .setTimestamp();
}

export function buildPersonalRemoveMultiEmbed(
  messages: Messages,
  input: {
    nickname: string;
    lines: Array<{ amount: number; typeName: string; stockAfter: number }>;
  },
): EmbedBuilder {
  const lines = input.lines
    .map((line) =>
      formatTemplate(messages.resourceEmbedPersonalRemoveMultiLine, {
        amount: String(line.amount),
        type: line.typeName,
        stock: String(line.stockAfter),
      }),
    )
    .join('\n');

  return new EmbedBuilder()
    .setColor(COLOR_PERSONAL_REMOVE)
    .setTitle(messages.resourceEmbedPersonalRemoveTitle)
    .setDescription(
      formatTemplate(messages.resourceEmbedPersonalRemoveMultiDesc, {
        nickname: input.nickname,
        lines,
      }).slice(0, 4000),
    )
    .setTimestamp();
}

export function buildProductionEmbed(
  messages: Messages,
  lines: Array<{
    sourceName: string;
    typeName: string;
    added: number;
    lost: number;
    stockAfter: number;
    cap: number;
  }>,
): EmbedBuilder {
  const anyLost = lines.some((l) => l.lost > 0);
  const body = lines
    .map((line) =>
      line.lost > 0
        ? formatTemplate(messages.resourceEmbedProductionLostLine, {
            source: line.sourceName,
            amount: String(line.added),
            type: line.typeName,
            lost: String(line.lost),
            cap: String(line.cap),
          })
        : formatTemplate(messages.resourceEmbedProductionLine, {
            source: line.sourceName,
            amount: String(line.added),
            type: line.typeName,
            stock: String(line.stockAfter),
          }),
    )
    .join('\n');

  const description = anyLost
    ? `${body}\n\n${messages.resourceEmbedProductionFooter}`
    : body;

  return new EmbedBuilder()
    .setColor(COLOR_PRODUCTION)
    .setTitle(messages.resourceEmbedProductionTitle)
    .setDescription(description.slice(0, 4000))
    .setTimestamp();
}
