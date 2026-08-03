import type Database from 'better-sqlite3';
import * as dbQueries from '../db/index.js';
import type {
  Building,
  BuildingCost,
  BuildingFunding,
  BuildingStatus,
  Messages,
  ResourceType,
} from '../types.js';
import { formatTemplate } from '../utils/helpers.js';
import {
  normalizeBuildingNameKey,
} from '../utils/resourceKeys.js';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  type ResourceFail,
  type ResourceOk,
  type ResourceResult,
} from './ResourceService.js';

export type BuildingResult<T> = ResourceOk<T> | ResourceFail;

export interface BuildingMaterialProgress {
  resourceKey: string;
  displayName: string;
  required: number;
  funded: number;
}

export interface BuildingDetail {
  building: Building;
  materials: BuildingMaterialProgress[];
  statusLabel: string;
}

export interface BuildingMaterialActionResult {
  building: Building;
  type: ResourceType;
  amount: number;
  gc: number;
  stockAfter: number | null;
  phaseNote: string;
  previousStatus: BuildingStatus;
}

export interface BuildingContributeResult {
  building: Building;
  amount: number;
  gc: number;
  phaseNote: string;
  previousStatus: BuildingStatus;
}

export class BuildingService {
  constructor(
    private readonly db: Database.Database,
    readonly messages: Messages,
  ) {}

  create(input: {
    guildId: string;
    name: string;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{ building: Building }> {
    const displayName = input.name.trim();
    const nameKey = normalizeBuildingNameKey(displayName);
    if (!displayName || !nameKey) {
      return { ok: false, message: this.messages.buildingInvalidName };
    }
    if (dbQueries.getBuildingByNameKey(this.db, input.guildId, nameKey)) {
      return { ok: false, message: this.messages.buildingExists };
    }

    const building = dbQueries.insertBuilding(this.db, {
      guildId: input.guildId,
      name: displayName,
      nameKey,
    });

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_create',
      amount: 0,
      buildingId: building.id,
    });

    return { ok: true, building };
  }

  addCost(input: {
    guildId: string;
    buildingName: string;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{ building: Building; type: ResourceType; amount: number }> {
    if (
      !Number.isInteger(input.amount) ||
      input.amount < AMOUNT_MIN ||
      input.amount > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const buildingResult = this.requireBuilding(input.guildId, input.buildingName);
    if (!buildingResult.ok) return buildingResult;
    const building = buildingResult.building;

    if (!this.costsEditable(building)) {
      return { ok: false, message: this.messages.buildingCostLocked };
    }

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    dbQueries.upsertBuildingCost(this.db, building.id, type.key, input.amount);
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_cost_add',
      resourceKey: type.key,
      amount: input.amount,
      buildingId: building.id,
    });

    return { ok: true, building, type, amount: input.amount };
  }

  addCostById(input: {
    guildId: string;
    buildingId: number;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{ building: Building; type: ResourceType; amount: number }> {
    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    return this.addCost({ ...input, buildingName: building.name });
  }

  setTime(input: {
    guildId: string;
    buildingName: string;
    timeUnits: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{ building: Building; time: number; phaseNote: string }> {
    if (
      !Number.isInteger(input.timeUnits) ||
      input.timeUnits < AMOUNT_MIN ||
      input.timeUnits > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const buildingResult = this.requireBuilding(input.guildId, input.buildingName);
    if (!buildingResult.ok) return buildingResult;
    const building = buildingResult.building;

    if (!this.timeRequiredEditable(building)) {
      return { ok: false, message: this.messages.buildingBuildtimeLocked };
    }

    dbQueries.updateBuildingTimeRequired(this.db, building.id, input.timeUnits);
    if (building.time_spent > input.timeUnits) {
      dbQueries.updateBuildingTimeSpent(this.db, building.id, input.timeUnits);
    }
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_cost_time',
      amount: input.timeUnits,
      buildingId: building.id,
    });

    let updated = dbQueries.getBuildingById(this.db, building.id)!;
    const phaseNote = this.maybeComplete(updated);
    if (phaseNote) {
      updated = dbQueries.getBuildingById(this.db, building.id)!;
    }
    return { ok: true, building: updated, time: input.timeUnits, phaseNote };
  }

  setTimeById(input: {
    guildId: string;
    buildingId: number;
    timeUnits: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{ building: Building; time: number; phaseNote: string }> {
    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    return this.setTime({ ...input, buildingName: building.name });
  }

  /** DM: correct deposited materials on a funding project (no GC). */
  adjustFunding(input: {
    guildId: string;
    buildingId: number;
    keyRaw: string;
    delta: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{
    building: Building;
    type: ResourceType;
    delta: number;
    fundedAfter: number;
    phaseNote: string;
  }> {
    if (
      !Number.isInteger(input.delta) ||
      input.delta === 0 ||
      input.delta < -AMOUNT_MAX ||
      input.delta > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    if (building.status !== 'funding') {
      return { ok: false, message: this.messages.buildingFundingAdjustLocked };
    }

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const costs = dbQueries.listBuildingCosts(this.db, building.id);
    if (!costs.some((c) => c.resource_key === type.key)) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingFundingTypeNotOnProject, {
          type: type.display_name,
          building: building.name,
        }),
      };
    }

    const current = dbQueries.getBuildingFundingQty(this.db, building.id, type.key);
    if (input.delta < 0 && current + input.delta < 0) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingFundingInsufficient, {
          type: type.display_name,
          funded: String(current),
        }),
      };
    }

    const fundedAfter = dbQueries.addBuildingFunding(
      this.db,
      building.id,
      type.key,
      input.delta,
    );
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_funding_adjust',
      resourceKey: type.key,
      amount: input.delta,
      buildingId: building.id,
    });

    let updated = dbQueries.getBuildingById(this.db, building.id)!;
    const phaseNote = this.maybeAdvanceFromFunding(updated);
    if (phaseNote) {
      updated = dbQueries.getBuildingById(this.db, building.id)!;
    }

    return {
      ok: true,
      building: updated,
      type,
      delta: input.delta,
      fundedAfter,
      phaseNote,
    };
  }

  /** DM: correct time_spent on a project (no GC). */
  adjustTimeSpent(input: {
    guildId: string;
    buildingId: number;
    delta: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{
    building: Building;
    delta: number;
    spentAfter: number;
    phaseNote: string;
  }> {
    if (
      !Number.isInteger(input.delta) ||
      input.delta === 0 ||
      input.delta < -AMOUNT_MAX ||
      input.delta > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    if (building.status !== 'building') {
      return { ok: false, message: this.messages.buildingSpentAdjustLocked };
    }
    if (building.time_required <= 0) {
      return { ok: false, message: this.messages.buildingBuildtimeLocked };
    }

    const next = building.time_spent + input.delta;
    if (next < 0) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingSpentInsufficient, {
          spent: String(building.time_spent),
        }),
      };
    }

    const clamped = Math.min(next, building.time_required);
    dbQueries.updateBuildingTimeSpent(this.db, building.id, clamped);
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_spent_adjust',
      amount: input.delta,
      buildingId: building.id,
    });

    let updated = dbQueries.getBuildingById(this.db, building.id)!;
    const phaseNote = this.maybeComplete(updated);
    if (phaseNote) {
      updated = dbQueries.getBuildingById(this.db, building.id)!;
    }

    return {
      ok: true,
      building: updated,
      delta: input.delta,
      spentAfter: updated.time_spent,
      phaseNote,
    };
  }

  /** Projects whose material costs can still be edited (funding, nothing deposited). */
  listCostEditableBuildings(guildId: string): Building[] {
    return dbQueries
      .listBuildings(this.db, guildId)
      .filter((b) => b.status === 'funding' && this.costsEditable(b));
  }

  /** DM: set phase-2 duration — any open project (not complete/cancelled). */
  listBuildtimeEditableBuildings(guildId: string): Building[] {
    return dbQueries
      .listBuildings(this.db, guildId)
      .filter((b) => this.timeRequiredEditable(b));
  }

  /** DM: funding correction — projects still gathering materials. */
  listFundingAdjustBuildings(guildId: string): Building[] {
    return dbQueries
      .listBuildings(this.db, guildId)
      .filter((b) => b.status === 'funding');
  }

  /** DM: time_spent correction — projects in build phase. */
  listSpentAdjustBuildings(guildId: string): Building[] {
    return dbQueries
      .listBuildings(this.db, guildId)
      .filter((b) => b.status === 'building' && b.time_required > 0);
  }

  detail(guildId: string, buildingName: string): BuildingResult<BuildingDetail> {
    const buildingResult = this.requireBuilding(guildId, buildingName);
    if (!buildingResult.ok) return buildingResult;
    return { ok: true, ...this.buildDetail(buildingResult.building) };
  }

  list(guildId: string): Building[] {
    return dbQueries.listBuildings(this.db, guildId);
  }

  getInGuild(guildId: string, buildingId: number): Building | null {
    const building = dbQueries.getBuildingById(this.db, buildingId);
    if (!building || building.guild_id !== guildId) return null;
    if (building.status === 'cancelled') return null;
    return building;
  }

  /** Funding projects that still need at least one material. */
  listFundingChoices(guildId: string): Building[] {
    return dbQueries
      .listOpenBuildingsForReport(this.db, guildId)
      .filter((b) => b.status === 'funding' && this.listMissingMaterials(b.id).length > 0);
  }

  /** Building-phase projects that still need time. */
  listContributeChoices(guildId: string): Building[] {
    return dbQueries
      .listOpenBuildingsForReport(this.db, guildId)
      .filter(
        (b) =>
          b.status === 'building' && b.time_spent < b.time_required && b.time_required > 0,
      );
  }

  listMissingMaterials(buildingId: number): BuildingMaterialProgress[] {
    const building = dbQueries.getBuildingById(this.db, buildingId);
    if (!building) return [];
    return this.buildDetail(building).materials.filter((m) => m.funded < m.required);
  }

  detailById(guildId: string, buildingId: number): BuildingResult<BuildingDetail> {
    const building = this.getInGuild(guildId, buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, { name: String(buildingId) }),
      };
    }
    return { ok: true, ...this.buildDetail(building) };
  }

  fundById(input: {
    guildId: string;
    buildingId: number;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<BuildingMaterialActionResult> {
    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    return this.fund({ ...input, buildingName: building.name });
  }

  donateById(input: {
    guildId: string;
    buildingId: number;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<BuildingMaterialActionResult> {
    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    return this.donate({ ...input, buildingName: building.name });
  }

  contributeById(input: {
    guildId: string;
    buildingId: number;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<BuildingContributeResult> {
    const building = this.getInGuild(input.guildId, input.buildingId);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: String(input.buildingId),
        }),
      };
    }
    return this.contribute({ ...input, buildingName: building.name });
  }

  /** Move materials from guild stock into the project (no GC). */
  fund(input: {
    guildId: string;
    buildingName: string;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<BuildingMaterialActionResult> {
    return this.addMaterials({ ...input, fromStock: true, awardSellGc: false });
  }

  /** Donate materials directly into the project (sell GC, stock untouched). */
  donate(input: {
    guildId: string;
    buildingName: string;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<BuildingMaterialActionResult> {
    return this.addMaterials({ ...input, fromStock: false, awardSellGc: true });
  }

  contribute(input: {
    guildId: string;
    buildingName: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<BuildingContributeResult> {
    if (
      !Number.isInteger(input.amount) ||
      input.amount < AMOUNT_MIN ||
      input.amount > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const buildingResult = this.requireBuilding(input.guildId, input.buildingName);
    if (!buildingResult.ok) return buildingResult;
    let building = buildingResult.building;

    if (building.status !== 'building') {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingWrongPhase, {
          status: this.statusLabel(building.status),
        }),
      };
    }

    const remaining = Math.max(0, building.time_required - building.time_spent);
    if (remaining <= 0) {
      this.maybeComplete(building);
      building = dbQueries.getBuildingById(this.db, building.id)!;
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingWrongPhase, {
          status: this.statusLabel(building.status),
        }),
      };
    }

    const applied = Math.min(input.amount, remaining);
    const previousStatus = building.status;
    const timeSpent = building.time_spent + applied;
    dbQueries.updateBuildingTimeSpent(this.db, building.id, timeSpent);

    const gc = applied; // 1 GC per time unit
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_contribute',
      amount: applied,
      gcDelta: gc,
      buildingId: building.id,
    });

    building = dbQueries.getBuildingById(this.db, building.id)!;
    const phaseNote = this.maybeComplete(building);
    building = dbQueries.getBuildingById(this.db, building.id)!;

    return {
      ok: true,
      building,
      amount: applied,
      gc,
      phaseNote,
      previousStatus,
    };
  }

  cancel(input: {
    guildId: string;
    buildingName: string;
    actorUserId: string;
    actorNickname: string;
  }): BuildingResult<{ building: Building }> {
    const buildingResult = this.requireBuilding(input.guildId, input.buildingName);
    if (!buildingResult.ok) return buildingResult;
    const building = buildingResult.building;

    if (building.status !== 'funding' && building.status !== 'building') {
      return { ok: false, message: this.messages.buildingCancelWrongStatus };
    }

    const funding = dbQueries.listBuildingFunding(this.db, building.id);
    for (const row of funding) {
      if (row.deposited_qty <= 0) continue;
      const { overflow } = dbQueries.addGuildStockCapped(
        this.db,
        input.guildId,
        row.resource_key,
        row.deposited_qty,
      );
      if (overflow > 0) {
        dbQueries.addPlayerStockQuantity(
          this.db,
          input.guildId,
          input.actorUserId,
          row.resource_key,
          overflow,
        );
      }
    }

    dbQueries.updateBuildingStatus(this.db, building.id, 'cancelled', null);
    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: 'building_cancel',
      amount: 0,
      buildingId: building.id,
    });

    const updated = dbQueries.getBuildingById(this.db, building.id)!;
    return { ok: true, building: updated };
  }

  statusLabel(status: BuildingStatus): string {
    switch (status) {
      case 'funding':
        return this.messages.buildingStatusFunding;
      case 'building':
        return this.messages.buildingStatusBuilding;
      case 'complete':
        return this.messages.buildingStatusComplete;
      case 'cancelled':
        return this.messages.buildingStatusCancelled;
      default:
        return status;
    }
  }

  openProjectsSnapshot(guildId: string): Array<{
    building: Building;
    funded: number;
    required: number;
  }> {
    const buildings = dbQueries.listOpenBuildingsForReport(this.db, guildId);
    return buildings.map((building) => {
      const costs = dbQueries.listBuildingCosts(this.db, building.id);
      const funding = new Map(
        dbQueries
          .listBuildingFunding(this.db, building.id)
          .map((f) => [f.resource_key, f.deposited_qty]),
      );
      let required = 0;
      let funded = 0;
      for (const cost of costs) {
        required += cost.required_qty;
        funded += Math.min(funding.get(cost.resource_key) ?? 0, cost.required_qty);
      }
      return { building, funded, required };
    });
  }

  private addMaterials(input: {
    guildId: string;
    buildingName: string;
    keyRaw: string;
    amount: number;
    actorUserId: string;
    actorNickname: string;
    fromStock: boolean;
    awardSellGc: boolean;
  }): BuildingResult<BuildingMaterialActionResult> {
    if (
      !Number.isInteger(input.amount) ||
      input.amount < AMOUNT_MIN ||
      input.amount > AMOUNT_MAX
    ) {
      return { ok: false, message: this.messages.resourceInvalidAmount };
    }

    const buildingResult = this.requireBuilding(input.guildId, input.buildingName);
    if (!buildingResult.ok) return buildingResult;
    let building = buildingResult.building;

    if (building.status !== 'funding') {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingWrongPhase, {
          status: this.statusLabel(building.status),
        }),
      };
    }

    const typeResult = this.requireType(input.guildId, input.keyRaw);
    if (!typeResult.ok) return typeResult;
    const type = typeResult.type;

    const costs = dbQueries.listBuildingCosts(this.db, building.id);
    const cost = costs.find((c) => c.resource_key === type.key);
    if (!cost) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingNoCostForType, {
          building: building.name,
          key: type.key,
        }),
      };
    }

    const already = dbQueries.getBuildingFundingQty(this.db, building.id, type.key);
    const room = Math.max(0, cost.required_qty - already);
    if (room <= 0) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingNoCostForType, {
          building: building.name,
          key: type.key,
        }),
      };
    }

    const applied = Math.min(input.amount, room);
    let stockAfter: number | null = null;

    if (input.fromStock) {
      const available = dbQueries.getStockQuantity(this.db, input.guildId, type.key);
      if (available < applied) {
        return {
          ok: false,
          message: formatTemplate(this.messages.resourceInsufficientStock, {
            stock: String(available),
            name: type.display_name,
          }),
        };
      }
      stockAfter = dbQueries.addStockQuantity(
        this.db,
        input.guildId,
        type.key,
        -applied,
      );
    }

    dbQueries.addBuildingFunding(this.db, building.id, type.key, applied);
    const gc = input.awardSellGc ? applied * type.sell_gc : 0;

    dbQueries.insertResourceLedger(this.db, {
      guildId: input.guildId,
      actorUserId: input.actorUserId,
      actorNickname: input.actorNickname,
      action: input.fromStock ? 'building_fund' : 'building_donate',
      resourceKey: type.key,
      amount: applied,
      gcDelta: gc,
      buildingId: building.id,
      stockAfter,
    });

    const previousStatus = building.status;
    const phaseNote = this.maybeAdvanceFromFunding(building);
    building = dbQueries.getBuildingById(this.db, building.id)!;

    return {
      ok: true,
      building,
      type,
      amount: applied,
      gc,
      stockAfter,
      phaseNote,
      previousStatus,
    };
  }

  private maybeAdvanceFromFunding(building: Building): string {
    if (building.status !== 'funding') return '';
    const costs = dbQueries.listBuildingCosts(this.db, building.id);
    if (costs.length === 0) return '';

    for (const cost of costs) {
      const funded = dbQueries.getBuildingFundingQty(
        this.db,
        building.id,
        cost.resource_key,
      );
      if (funded < cost.required_qty) return '';
    }

    if (building.time_required <= 0) {
      dbQueries.updateBuildingStatus(
        this.db,
        building.id,
        'complete',
        new Date().toISOString(),
      );
      return this.messages.buildingPhaseComplete;
    }

    dbQueries.updateBuildingStatus(this.db, building.id, 'building', null);
    return this.messages.buildingPhaseFundingDone;
  }

  private maybeComplete(building: Building): string {
    if (building.status !== 'building') return '';
    if (building.time_spent < building.time_required) return '';
    dbQueries.updateBuildingStatus(
      this.db,
      building.id,
      'complete',
      new Date().toISOString(),
    );
    return this.messages.buildingPhaseComplete;
  }

  private costsEditable(building: Building): boolean {
    if (building.status !== 'funding') return false;
    return !dbQueries.buildingHasAnyFunding(this.db, building.id);
  }

  private timeRequiredEditable(building: Building): boolean {
    return building.status === 'funding' || building.status === 'building';
  }

  private buildDetail(building: Building): BuildingDetail {
    const costs = dbQueries.listBuildingCosts(this.db, building.id);
    const funding = new Map(
      dbQueries
        .listBuildingFunding(this.db, building.id)
        .map((f: BuildingFunding) => [f.resource_key, f.deposited_qty]),
    );
    const types = new Map(
      dbQueries
        .listResourceTypes(this.db, building.guild_id)
        .map((t) => [t.key, t]),
    );

    const materials: BuildingMaterialProgress[] = costs.map((cost: BuildingCost) => ({
      resourceKey: cost.resource_key,
      displayName: types.get(cost.resource_key)?.display_name ?? cost.resource_key,
      required: cost.required_qty,
      funded: funding.get(cost.resource_key) ?? 0,
    }));

    return {
      building,
      materials,
      statusLabel: this.statusLabel(building.status),
    };
  }

  private requireBuilding(
    guildId: string,
    buildingName: string,
  ): BuildingResult<{ building: Building }> {
    const nameKey = normalizeBuildingNameKey(buildingName);
    if (!nameKey) {
      return { ok: false, message: this.messages.buildingInvalidName };
    }
    const building = dbQueries.getBuildingByNameKey(this.db, guildId, nameKey);
    if (!building) {
      return {
        ok: false,
        message: formatTemplate(this.messages.buildingUnknown, {
          name: buildingName.trim(),
        }),
      };
    }
    return { ok: true, building };
  }

  private requireType(
    guildId: string,
    keyRaw: string,
  ): BuildingResult<{ type: ResourceType }> {
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
}
