import type Database from 'better-sqlite3';
import * as dbQueries from '../db/index.js';
import type {
  Messages,
  ProductionInterval,
  ProductionSource,
  ResourceType,
} from '../types.js';
import { formatTemplate } from '../utils/helpers.js';
import {
  localDateIso,
  periodKeyForInterval,
} from '../utils/productionPeriod.js';
import { normalizeBuildingNameKey } from '../utils/resourceKeys.js';

const WORKERS_MIN = 0;
const YIELD_MIN = 1;
const YIELD_MAX = 9999;
const MAX_WORKERS_DEFAULT = 5;
const MAX_WORKERS_CAP = 25;

export type ProductionFail = { ok: false; message: string };
export type ProductionOk<T> = { ok: true } & T;
export type ProductionResult<T> = ProductionOk<T> | ProductionFail;

export interface ProductionPayoutLine {
  source: ProductionSource;
  type: ResourceType;
  produced: number;
  added: number;
  lost: number;
  stockAfter: number;
  period: string;
}

export class ProductionService {
  constructor(
    private readonly db: Database.Database,
    readonly messages: Messages,
    private readonly timeZone: string,
  ) {}

  list(guildId: string): ProductionSource[] {
    return dbQueries.listProductionSources(this.db, guildId);
  }

  getById(id: number): ProductionSource | null {
    return dbQueries.getProductionSourceById(this.db, id);
  }

  add(input: {
    guildId: string;
    name: string;
    resourceKeyRaw: string;
    workers: number;
    maxWorkers?: number | null;
    yieldPerWorker: number;
    interval: ProductionInterval;
    actorUserId: string;
    actorNickname: string;
  }): ProductionResult<{ source: ProductionSource; type: ResourceType }> {
    const name = input.name.trim();
    const nameKey = normalizeBuildingNameKey(name);
    if (!name || !nameKey) {
      return { ok: false, message: this.messages.productionInvalidName };
    }
    if (dbQueries.getProductionSourceByNameKey(this.db, input.guildId, nameKey)) {
      return { ok: false, message: this.messages.productionExists };
    }

    const type = dbQueries.findResourceType(
      this.db,
      input.guildId,
      input.resourceKeyRaw,
    );
    if (!type) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeUnknown, {
          key: input.resourceKeyRaw.trim() || '?',
        }),
      };
    }

    const maxWorkers =
      input.maxWorkers == null ? MAX_WORKERS_DEFAULT : input.maxWorkers;
    if (
      !Number.isInteger(maxWorkers) ||
      maxWorkers < 1 ||
      maxWorkers > MAX_WORKERS_CAP
    ) {
      return { ok: false, message: this.messages.productionInvalidWorkers };
    }
    if (
      !Number.isInteger(input.workers) ||
      input.workers < WORKERS_MIN ||
      input.workers > maxWorkers
    ) {
      return { ok: false, message: this.messages.productionInvalidWorkers };
    }
    if (
      !Number.isInteger(input.yieldPerWorker) ||
      input.yieldPerWorker < YIELD_MIN ||
      input.yieldPerWorker > YIELD_MAX
    ) {
      return { ok: false, message: this.messages.productionInvalidYield };
    }
    if (input.interval !== 'daily' && input.interval !== 'weekly') {
      return { ok: false, message: this.messages.productionInvalidInterval };
    }

    const source = dbQueries.insertProductionSource(this.db, {
      guildId: input.guildId,
      name,
      nameKey,
      resourceKey: type.key,
      workers: input.workers,
      maxWorkers,
      yieldPerWorker: input.yieldPerWorker,
      interval: input.interval,
    });

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'production_add',
      resourceKey: type.key,
      amount: 0,
    });

    return { ok: true, source, type };
  }

  setWorkers(input: {
    guildId: string;
    sourceId: number;
    workers: number;
    actorUserId: string;
    actorNickname: string;
  }): ProductionResult<{ source: ProductionSource }> {
    const source = dbQueries.getProductionSourceById(this.db, input.sourceId);
    if (!source || source.guild_id !== input.guildId) {
      return { ok: false, message: this.messages.productionUnknown };
    }
    if (
      !Number.isInteger(input.workers) ||
      input.workers < WORKERS_MIN ||
      input.workers > source.max_workers
    ) {
      return { ok: false, message: this.messages.productionInvalidWorkers };
    }

    const updated = dbQueries.updateProductionWorkers(
      this.db,
      source.id,
      input.workers,
    );
    if (!updated) return { ok: false, message: this.messages.productionUnknown };

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'production_workers',
      resourceKey: source.resource_key,
      amount: input.workers,
    });

    return { ok: true, source: updated };
  }

  setYield(input: {
    guildId: string;
    sourceId: number;
    yieldPerWorker: number;
    actorUserId: string;
    actorNickname: string;
  }): ProductionResult<{ source: ProductionSource }> {
    const source = dbQueries.getProductionSourceById(this.db, input.sourceId);
    if (!source || source.guild_id !== input.guildId) {
      return { ok: false, message: this.messages.productionUnknown };
    }
    if (
      !Number.isInteger(input.yieldPerWorker) ||
      input.yieldPerWorker < YIELD_MIN ||
      input.yieldPerWorker > YIELD_MAX
    ) {
      return { ok: false, message: this.messages.productionInvalidYield };
    }

    const updated = dbQueries.updateProductionYield(
      this.db,
      source.id,
      input.yieldPerWorker,
    );
    if (!updated) return { ok: false, message: this.messages.productionUnknown };

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'production_yield',
      resourceKey: source.resource_key,
      amount: input.yieldPerWorker,
    });

    return { ok: true, source: updated };
  }

  remove(input: {
    guildId: string;
    sourceId: number;
    actorUserId: string;
    actorNickname: string;
  }): ProductionResult<{ source: ProductionSource }> {
    const source = dbQueries.getProductionSourceById(this.db, input.sourceId);
    if (!source || source.guild_id !== input.guildId) {
      return { ok: false, message: this.messages.productionUnknown };
    }

    dbQueries.deleteProductionSource(this.db, source.id);
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'production_remove',
      resourceKey: source.resource_key,
      amount: 0,
    });

    return { ok: true, source };
  }

  getSettings(guildId: string) {
    return dbQueries.getResourceSettings(this.db, guildId);
  }

  getStorageCap(guildId: string): number {
    return dbQueries.getStorageCap(this.db, guildId);
  }

  /**
   * Pay all sources due for this local day/week. Does not mark the daily post date.
   * Caller posts once and then marks production_last_post_date.
   */
  payDueForGuild(
    guildId: string,
    now = new Date(),
  ): ProductionPayoutLine[] {
    const sources = dbQueries.listProductionSources(this.db, guildId);
    const lines: ProductionPayoutLine[] = [];

    for (const source of sources) {
      const period = periodKeyForInterval(source.interval, now, this.timeZone);
      if (source.last_paid_period === period) continue;

      const type = dbQueries.getResourceType(
        this.db,
        guildId,
        source.resource_key,
      );
      if (!type) continue;

      const produced = source.workers * source.yield_per_worker;
      if (produced <= 0) {
        dbQueries.updateProductionLastPaid(this.db, source.id, period);
        continue;
      }

      const { added, overflow, stockAfter } = dbQueries.addGuildStockCapped(
        this.db,
        guildId,
        source.resource_key,
        produced,
      );

      dbQueries.insertResourceLedger(this.db, {
        guildId,
        actorUserId: 'system',
        actorNickname: 'production',
        action: 'production',
        resourceKey: source.resource_key,
        amount: added,
        stockAfter,
      });
      if (overflow > 0) {
        dbQueries.insertResourceLedger(this.db, {
          guildId,
          actorUserId: 'system',
          actorNickname: 'production',
          action: 'production_lost',
          resourceKey: source.resource_key,
          amount: overflow,
          stockAfter,
        });
      }

      dbQueries.updateProductionLastPaid(this.db, source.id, period);
      lines.push({
        source,
        type,
        produced,
        added,
        lost: overflow,
        stockAfter,
        period,
      });
    }

    return lines;
  }

  shouldPostToday(guildId: string, now = new Date()): boolean {
    const settings = dbQueries.getResourceSettings(this.db, guildId);
    if (!settings?.channel_id) return false;
    const today = localDateIso(now, this.timeZone);
    return settings.production_last_post_date !== today;
  }

  markPosted(guildId: string, now = new Date()): void {
    dbQueries.setProductionLastPostDate(
      this.db,
      guildId,
      localDateIso(now, this.timeZone),
    );
  }

  guildIdsConfigured(): string[] {
    return dbQueries.listGuildIdsWithProductionSettings(this.db);
  }

  expectedYield(source: ProductionSource): number {
    return source.workers * source.yield_per_worker;
  }
}

export {
  MAX_WORKERS_DEFAULT,
  MAX_WORKERS_CAP,
  WORKERS_MIN,
  YIELD_MIN,
  YIELD_MAX,
};
