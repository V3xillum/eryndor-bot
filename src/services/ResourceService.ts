import type Database from 'better-sqlite3';
import * as dbQueries from '../db/index.js';
import type { Messages, ResourceSettings, ResourceType } from '../types.js';
import { formatTemplate } from '../utils/helpers.js';
import { normalizeResourceKey } from '../utils/resourceKeys.js';

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 9999;

export type ResourceFail = { ok: false; message: string };
export type ResourceOk<T> = { ok: true } & T;
export type ResourceResult<T> = ResourceOk<T> | ResourceFail;

export interface StockDonateResult {
  type: ResourceType;
  amount: number;
  /** Amount that fit in guild stock (cap). */
  added: number;
  /** Remainder moved to personal stock. */
  overflow: number;
  gc: number;
  stockAfter: number;
  personalAfter: number | null;
}

export interface StockBuyResult {
  type: ResourceType;
  amount: number;
  gc: number;
  stockAfter: number;
}

export class ResourceService {
  constructor(
    private readonly db: Database.Database,
    readonly messages: Messages,
  ) {}

  getSettings(guildId: string): ResourceSettings | null {
    return dbQueries.getResourceSettings(this.db, guildId);
  }

  setup(guildId: string, channelId: string): ResourceSettings {
    return dbQueries.upsertResourceSettings(this.db, guildId, channelId);
  }

  clear(guildId: string): boolean {
    return dbQueries.clearResourceSettings(this.db, guildId);
  }

  listTypes(guildId: string): ResourceType[] {
    return dbQueries.listResourceTypes(this.db, guildId);
  }

  getType(guildId: string, raw: string): ResourceType | null {
    return dbQueries.findResourceType(this.db, guildId, raw);
  }

  addType(input: {
    guildId: string;
    displayName: string;
    sellGc: number;
    buyGc?: number | null;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<{ type: ResourceType }> {
    const displayName = input.displayName.trim();
    const key = normalizeResourceKey(displayName);
    if (!displayName || !key) {
      return { ok: false, message: this.messages.resourceTypeInvalidKey };
    }
    if (!Number.isInteger(input.sellGc) || input.sellGc < 0) {
      return { ok: false, message: this.messages.resourceInvalidGc };
    }
    const buy =
      input.buyGc === undefined || input.buyGc === null
        ? input.sellGc * 2
        : input.buyGc;
    if (!Number.isInteger(buy) || buy < 0) {
      return { ok: false, message: this.messages.resourceInvalidGc };
    }
    if (dbQueries.getResourceType(this.db, input.guildId, key)) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeExists, { key }),
      };
    }

    const type = dbQueries.insertResourceType(this.db, {
      guildId: input.guildId,
      key,
      displayName,
      sellGc: input.sellGc,
      buyGc: buy,
    });

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'type_add',
      resourceKey: key,
      amount: 0,
      gcDelta: 0,
    });

    return { ok: true, type };
  }

  editType(input: {
    guildId: string;
    nameRaw: string;
    displayName?: string | null;
    sellGc?: number | null;
    buyGc?: number | null;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<{ type: ResourceType }> {
    const existing = dbQueries.findResourceType(this.db, input.guildId, input.nameRaw);
    if (!existing) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeUnknown, {
          key: input.nameRaw.trim() || '?',
        }),
      };
    }

    const hasName = input.displayName != null && input.displayName.trim() !== '';
    const hasSell = input.sellGc != null;
    const hasBuy = input.buyGc != null;
    if (!hasName && !hasSell && !hasBuy) {
      return { ok: false, message: this.messages.resourceTypeNothingSet };
    }
    if (hasSell && (!Number.isInteger(input.sellGc!) || input.sellGc! < 0)) {
      return { ok: false, message: this.messages.resourceInvalidGc };
    }
    if (hasBuy && (!Number.isInteger(input.buyGc!) || input.buyGc! < 0)) {
      return { ok: false, message: this.messages.resourceInvalidGc };
    }

    const type = dbQueries.updateResourceType(this.db, input.guildId, existing.key, {
      displayName: hasName ? input.displayName!.trim() : undefined,
      sellGc: hasSell ? input.sellGc! : undefined,
      buyGc: hasBuy ? input.buyGc! : undefined,
    });
    if (!type) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeUnknown, {
          key: existing.key,
        }),
      };
    }

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'type_edit',
      resourceKey: existing.key,
      amount: 0,
      gcDelta: 0,
    });

    return { ok: true, type };
  }

  removeType(input: {
    guildId: string;
    nameRaw: string;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<{ type: ResourceType }> {
    const existing = dbQueries.findResourceType(this.db, input.guildId, input.nameRaw);
    if (!existing) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeUnknown, {
          key: input.nameRaw.trim() || '?',
        }),
      };
    }

    const key = existing.key;
    const stock = dbQueries.getStockQuantity(this.db, input.guildId, key);
    const playerStock = dbQueries.totalPlayerStockForKey(this.db, input.guildId, key);
    const inUse = dbQueries.isResourceKeyInActiveBuildings(this.db, input.guildId, key);
    const inProduction = dbQueries.isResourceKeyInProduction(
      this.db,
      input.guildId,
      key,
    );
    if (stock > 0 || playerStock > 0 || inUse || inProduction) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeInUse, { key }),
      };
    }

    dbQueries.deleteResourceType(this.db, input.guildId, key);
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'type_remove',
      resourceKey: key,
      amount: 0,
      gcDelta: 0,
    });

    return { ok: true, type: existing };
  }

  stockOverview(guildId: string): Array<{ type: ResourceType; quantity: number }> {
    const types = new Map(
      dbQueries.listResourceTypes(this.db, guildId).map((t) => [t.key, t]),
    );
    const rows = dbQueries.listGuildStock(this.db, guildId);
    const out: Array<{ type: ResourceType; quantity: number }> = [];
    for (const row of rows) {
      const type = types.get(row.resource_key);
      if (!type) continue;
      out.push({ type, quantity: row.quantity });
    }
    return out;
  }

  getStorageCap(guildId: string): number {
    return dbQueries.getStorageCap(this.db, guildId);
  }

  setStorageCap(
    guildId: string,
    cap: number,
  ): ResourceResult<{ cap: number }> {
    if (!Number.isInteger(cap) || cap < 1 || cap > 999_999) {
      return { ok: false, message: this.messages.resourceInvalidCap };
    }
    const settings = dbQueries.getResourceSettings(this.db, guildId);
    if (!settings) {
      return { ok: false, message: this.messages.resourceNotConfigured };
    }
    dbQueries.setStorageCap(this.db, guildId, cap);
    return { ok: true, cap };
  }

  isHouseTaxEnabled(guildId: string): boolean {
    return dbQueries.isHouseTaxEnabled(this.db, guildId);
  }

  getHouseTaxThreshold(guildId: string): number {
    return dbQueries.getHouseTaxThreshold(this.db, guildId);
  }

  getHouseTaxSettings(guildId: string): {
    enabled: boolean;
    threshold: number;
  } {
    return {
      enabled: this.isHouseTaxEnabled(guildId),
      threshold: this.getHouseTaxThreshold(guildId),
    };
  }

  setHouseTaxSettings(
    guildId: string,
    patch: { enabled?: boolean; threshold?: number },
  ): ResourceResult<{ enabled: boolean; threshold: number }> {
    if (patch.enabled == null && patch.threshold == null) {
      return { ok: false, message: this.messages.resourceHouseTaxNothingSet };
    }
    if (
      patch.threshold != null &&
      (!Number.isInteger(patch.threshold) ||
        patch.threshold < 1 ||
        patch.threshold > 9999)
    ) {
      return { ok: false, message: this.messages.resourceInvalidHouseTaxThreshold };
    }
    const settings = dbQueries.getResourceSettings(this.db, guildId);
    if (!settings) {
      return { ok: false, message: this.messages.resourceNotConfigured };
    }
    dbQueries.setHouseTaxSettings(this.db, guildId, patch);
    return {
      ok: true,
      enabled: this.isHouseTaxEnabled(guildId),
      threshold: this.getHouseTaxThreshold(guildId),
    };
  }

  donate(input: {
    guildId: string;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<StockDonateResult> {
    const amountCheck = this.validatePositiveAmount(input.amount);
    if (!amountCheck.ok) return amountCheck;

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const { added, overflow, stockAfter } = dbQueries.addGuildStockCapped(
      this.db,
      input.guildId,
      type.key,
      input.amount,
    );
    let personalAfter: number | null = null;
    if (overflow > 0) {
      personalAfter = dbQueries.addPlayerStockQuantity(
        this.db,
        input.guildId,
        input.actorUserId,
        type.key,
        overflow,
      );
    }

    const gc = added * type.sell_gc;

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'donate',
      resourceKey: type.key,
      amount: added,
      gcDelta: gc,
      stockAfter,
    });
    if (overflow > 0) {
      dbQueries.insertResourceLedger(this.db, {
        guildId: input.guildId,
        actorUserId: input.actorUserId,
        actorNickname: input.actorNickname,
        action: 'donate_overflow_personal',
        resourceKey: type.key,
        amount: overflow,
        stockAfter: personalAfter,
      });
    }

    return {
      ok: true,
      type,
      amount: input.amount,
      added,
      overflow,
      gc,
      stockAfter,
      personalAfter,
    };
  }

  buy(input: {
    guildId: string;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<StockBuyResult> {
    const amountCheck = this.validatePositiveAmount(input.amount);
    if (!amountCheck.ok) return amountCheck;

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const available = dbQueries.getStockQuantity(this.db, input.guildId, type.key);
    if (available < input.amount) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceInsufficientStock, {
          stock: String(available),
          name: type.display_name,
        }),
      };
    }

    const stockAfter = dbQueries.addStockQuantity(
      this.db,
      input.guildId,
      type.key,
      -input.amount,
    );
    const gc = input.amount * type.buy_gc;

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'buy',
      resourceKey: type.key,
      amount: input.amount,
      gcDelta: -gc,
      stockAfter,
    });

    return { ok: true, type, amount: input.amount, gc, stockAfter };
  }

  adjust(input: {
    guildId: string;
    keyRaw: string;
    delta: number;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<{
    type: ResourceType;
    delta: number;
    added: number;
    overflow: number;
    stockAfter: number;
    personalAfter: number | null;
  }> {
    if (
      !Number.isInteger(input.delta) ||
      input.delta === 0 ||
      input.delta < -AMOUNT_MAX ||
      input.delta > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const current = dbQueries.getStockQuantity(this.db, input.guildId, type.key);
    if (input.delta < 0 && current + input.delta < 0) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceInsufficientStock, {
          stock: String(current),
          name: type.display_name,
        }),
      };
    }

    let stockAfter: number;
    let added = input.delta;
    let overflow = 0;
    let personalAfter: number | null = null;

    if (input.delta > 0) {
      const capped = dbQueries.addGuildStockCapped(
        this.db,
        input.guildId,
        type.key,
        input.delta,
      );
      stockAfter = capped.stockAfter;
      added = capped.added;
      overflow = capped.overflow;
      if (overflow > 0) {
        personalAfter = dbQueries.addPlayerStockQuantity(
          this.db,
          input.guildId,
          input.actorUserId,
          type.key,
          overflow,
        );
      }
    } else {
      stockAfter = dbQueries.addStockQuantity(
        this.db,
        input.guildId,
        type.key,
        input.delta,
      );
    }

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'adjust',
      resourceKey: type.key,
      amount: added,
      gcDelta: 0,
      stockAfter,
    });
    if (overflow > 0) {
      dbQueries.insertResourceLedger(this.db, {
        guildId: input.guildId,
        actorUserId: input.actorUserId,
        actorNickname: input.actorNickname,
        action: 'adjust_overflow_personal',
        resourceKey: type.key,
        amount: overflow,
        stockAfter: personalAfter,
      });
    }

    return {
      ok: true,
      type,
      delta: input.delta,
      added,
      overflow,
      stockAfter,
      personalAfter,
    };
  }

  /** Absolute guild stock set. Increase uses storage cap (overflow → personal). */
  setStock(input: {
    guildId: string;
    keyRaw: string;
    target: number;
    actorUserId: string;
    actorNickname: string;
  }): ResourceResult<{
    type: ResourceType;
    delta: number;
    added: number;
    overflow: number;
    stockAfter: number;
    personalAfter: number | null;
  }> {
    if (
      !Number.isInteger(input.target) ||
      input.target < 0 ||
      input.target > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const current = dbQueries.getStockQuantity(this.db, input.guildId, type.key);
    const delta = input.target - current;
    if (delta === 0) {
      return {
        ok: true,
        type,
        delta: 0,
        added: 0,
        overflow: 0,
        stockAfter: current,
        personalAfter: null,
      };
    }

    return this.adjust({
      guildId: input.guildId,
      keyRaw: type.key,
      delta,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
    });
  }

  personalOverview(
    guildId: string,
    userId: string,
  ): Array<{ type: ResourceType; quantity: number }> {
    const types = new Map(
      dbQueries.listResourceTypes(this.db, guildId).map((t) => [t.key, t]),
    );
    const rows = dbQueries.listPlayerStock(this.db, guildId, userId);
    const out: Array<{ type: ResourceType; quantity: number }> = [];
    for (const row of rows) {
      const type = types.get(row.resource_key);
      if (!type) continue;
      out.push({ type, quantity: row.quantity });
    }
    return out;
  }

  /** Snapshot for status-report backup. */
  allPersonalStock(guildId: string): Array<{
    userId: string;
    type: ResourceType;
    quantity: number;
  }> {
    const types = new Map(
      dbQueries.listResourceTypes(this.db, guildId).map((t) => [t.key, t]),
    );
    const rows = dbQueries.listAllPlayerStock(this.db, guildId);
    const out: Array<{ userId: string; type: ResourceType; quantity: number }> = [];
    for (const row of rows) {
      const type = types.get(row.resource_key);
      if (!type) continue;
      out.push({ userId: row.user_id, type, quantity: row.quantity });
    }
    return out;
  }

  personalAdd(input: {
    guildId: string;
    userId: string;
    keyRaw: string;
    amount: number;
    actorNickname: string;
    /** Speler vinkte “eigen huis?” aan. Genegeerd als tax uit staat. */
    ownsHouse?: boolean;
  }): ResourceResult<{
    type: ResourceType;
    /** Ingevoerd totaal in de modal. */
    amount: number;
    /** Hoeveel naar persoonlijke voorraad ging. */
    personalAmount: number;
    stockAfter: number;
    /** 1 als tax in guild landde, anders 0. */
    taxAdded: number;
    /** True als tax van toepassing was maar guild geen plek had. */
    taxSkippedFull: boolean;
    gc: number;
    guildStockAfter: number | null;
  }> {
    const amountCheck = this.validatePositiveAmount(input.amount);
    if (!amountCheck.ok) return amountCheck;

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const taxEnabled = this.isHouseTaxEnabled(input.guildId);
    const threshold = this.getHouseTaxThreshold(input.guildId);
    const ownsHouse = input.ownsHouse === true;
    const taxDue =
      taxEnabled && ownsHouse && input.amount >= threshold ? 1 : 0;

    let taxAdded = 0;
    let taxSkippedFull = false;
    let gc = 0;
    let guildStockAfter: number | null = null;

    if (taxDue > 0) {
      const capped = dbQueries.addGuildStockCapped(
        this.db,
        input.guildId,
        type.key,
        taxDue,
      );
      taxAdded = capped.added;
      guildStockAfter = capped.stockAfter;
      if (taxAdded === 0) {
        taxSkippedFull = true;
      } else {
        gc = taxAdded * type.sell_gc;
        dbQueries.insertResourceLedger(this.db, {
          guildId: input.guildId,
          actorUserId: input.userId,
          actorNickname: input.actorNickname,
          action: 'personal_house_tax',
          resourceKey: type.key,
          amount: taxAdded,
          gcDelta: gc,
          stockAfter: guildStockAfter,
        });
      }
    }

    const personalAmount = input.amount - taxAdded;
    const stockAfter = dbQueries.addPlayerStockQuantity(
      this.db,
      input.guildId,
      input.userId,
      type.key,
      personalAmount,
    );

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.userId,
      actorNickname: input.actorNickname,
      action: 'personal_add',
      resourceKey: type.key,
      amount: personalAmount,
      gcDelta: 0,
      stockAfter,
    });

    return {
      ok: true,
      type,
      amount: input.amount,
      personalAmount,
      stockAfter,
      taxAdded,
      taxSkippedFull,
      gc,
      guildStockAfter,
    };
  }

  personalRemove(input: {
    guildId: string;
    userId: string;
    keyRaw: string;
    amount: number;
    actorNickname: string;
  }): ResourceResult<{
    type: ResourceType;
    amount: number;
    stockAfter: number;
  }> {
    const amountCheck = this.validatePositiveAmount(input.amount);
    if (!amountCheck.ok) return amountCheck;

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const available = dbQueries.getPlayerStockQuantity(
      this.db,
      input.guildId,
      input.userId,
      type.key,
    );
    if (available < input.amount) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceInsufficientPersonal, {
          stock: String(available),
          name: type.display_name,
        }),
      };
    }

    const stockAfter = dbQueries.addPlayerStockQuantity(
      this.db,
      input.guildId,
      input.userId,
      type.key,
      -input.amount,
    );

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.userId,
      actorNickname: input.actorNickname,
      action: 'personal_remove',
      resourceKey: type.key,
      amount: input.amount,
      gcDelta: 0,
      stockAfter,
    });

    return { ok: true, type, amount: input.amount, stockAfter };
  }

  ledgerSnapshot(guildId: string, sinceIso: string, limit = 25): {
    entries: ReturnType<typeof dbQueries.listResourceLedgerSince>;
    total: number;
  } {
    const total = dbQueries.countResourceLedgerSince(this.db, guildId, sinceIso);
    const entries = dbQueries.listResourceLedgerSince(this.db, guildId, sinceIso, limit);
    return { entries, total };
  }

  listGuildIdsWithData(): string[] {
    return dbQueries.listGuildIdsWithResourceData(this.db);
  }

  private requireType(
    guildId: string,
    keyRaw: string,
  ): ResourceResult<{ type: ResourceType }> {
    const type = dbQueries.findResourceType(this.db, guildId, keyRaw);
    if (!type) {
      return {
        ok: false,
        message: formatTemplate(this.messages.resourceTypeUnknown, {
          key: keyRaw.trim() || '?',
        }),
      };
    }
    return { ok: true, type };
  }

  private validatePositiveAmount(amount: number): ResourceResult<object> {
    if (!Number.isInteger(amount) || amount < AMOUNT_MIN || amount > AMOUNT_MAX) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }
    return { ok: true };
  }
}

export { AMOUNT_MIN, AMOUNT_MAX };
