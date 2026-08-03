/** Temporary DM dial: only magical types, or only non-magical. */
export type MagicalMode = 'only' | 'none';

export interface WeatherTableEntry {
  min: number;
  max: number;
  type: string;
  image: string;
  severity: number;
  /** Whether this weather is magical (arcane / clockwork / etc.). */
  magical: boolean;
  /** Optional; both must be set together. Minutes until next auto-update while this type is current. */
  durationMinMinutes?: number;
  durationMaxMinutes?: number;
}

/** Transition / cooldown thresholds — loaded from content/weather-rules.json */
export interface WeatherRules {
  cooldownAfterSeverity: number;
  cooldownMaxNextSeverity: number;
}

export interface WorldState {
  guild_id: string;
  channel_id: string | null;
  thread_id: string | null;
  current_weather_type: string | null;
  current_weather_rolled_at: string | null;
  next_update_at: string | null;
  paused_until: string | null;
  season: string;
  updated_at: string | null;
  /** Temporary dial: inclusive severity band while override_until is in the future. */
  severity_min: number | null;
  severity_max: number | null;
  severity_override_until: string | null;
  /** Temporary dial: `only` | `none` while override_until is in the future. */
  magical_mode: MagicalMode | null;
  magical_override_until: string | null;
  /**
   * Optional per-guild auto-update interval (minutes). Both set together, or both null
   * (fall back to `.env` / defaults).
   */
  update_min_minutes: number | null;
  update_max_minutes: number | null;
  /**
   * Optional per-guild active posting window. `null` = inherit env;
   * `0` = disabled; `1` = enabled (use start/end or env defaults for missing times).
   */
  active_window_enabled: number | null;
  active_window_start: string | null;
  active_window_end: string | null;
  /**
   * Optional per-guild severity cooldown. `null` = inherit `weather-rules.json`;
   * `0` = disabled; `1` = enabled. Thresholds null = inherit content defaults.
   */
  cooldown_enabled: number | null;
  cooldown_after_severity: number | null;
  cooldown_max_next_severity: number | null;
  /** Channel for daily calendar-event posts (null = disabled). Separate from weather destination. */
  calendar_channel_id: string | null;
  /** Local calendar date (YYYY-MM-DD in WEATHER_TIMEZONE) already handled for event auto-post. */
  calendar_events_last_handled_date: string | null;
  /** Local calendar date already handled for evening Full Moon (Rising) / exact Full Moon post. */
  calendar_fullmoon_last_handled_date: string | null;
}

export interface WeatherResult {
  type: string;
  image: string;
  roll?: number;
  forced: boolean;
}

/** DM-scheduled free-text post (separate from weather destination). */
export interface ScheduledPost {
  id: number;
  guild_id: string;
  channel_id: string;
  body: string;
  post_at: string;
  created_by: string;
  created_at: string;
  posted_at: string | null;
}

export interface Messages {
  setupSuccess: string;
  rollSuccess: string;
  setSuccess: string;
  setSuccessWithDuration: string;
  setRollSuccess: string;
  setRollSuccessWithDuration: string;
  scheduleSuccess: string;
  pauseSuccess: string;
  resumeSuccess: string;
  nextNotScheduled: string;
  nextScheduled: string;
  nextPaused: string;
  nextWaitingWindow: string;
  statusEmbedTitle: string;
  statusEmbedTitleWithType: string;
  statusFieldCurrent: string;
  statusFieldSchedule: string;
  statusFieldRules: string;
  statusSeverity: string;
  statusForced: string;
  statusRolledAt: string;
  statusNext: string;
  statusNextNone: string;
  statusPaused: string;
  statusWaitingWindow: string;
  statusDurationType: string;
  statusDurationEnv: string;
  statusDurationGuild: string;
  statusInterval: string;
  statusWindowOn: string;
  statusWindowOff: string;
  settingsShowTitle: string;
  settingsIntervalSuccess: string;
  settingsWindowSuccess: string;
  settingsWindowDisabledSuccess: string;
  settingsCooldownSuccess: string;
  settingsCooldownDisabledSuccess: string;
  settingsCooldownWarnMaxNext: string;
  settingsCooldownWarnEmptyStartPool: string;
  settingsClearSuccess: string;
  settingsClearNone: string;
  settingsClearCooldownSuccess: string;
  settingsClearCooldownNone: string;
  settingsClearAllSuccess: string;
  settingsClearAllNone: string;
  settingsCooldownNothingSet: string;
  invalidUpdateInterval: string;
  invalidActiveWindow: string;
  invalidTimeOfDay: string;
  invalidCooldownThreshold: string;
  statusCooldownRulesOn: string;
  statusCooldownRulesOff: string;
  statusCooldownOn: string;
  statusDialOn: string;
  statusDialOff: string;
  statusMagical: string;
  statusMagicalDialOn: string;
  statusMagicalDialOff: string;
  severitySetSuccess: string;
  severityClearSuccess: string;
  severityClearNone: string;
  invalidSeverityRange: string;
  severityRangeEmpty: string;
  dialFilterEmpty: string;
  magicalSetSuccess: string;
  magicalClearSuccess: string;
  magicalClearNone: string;
  invalidMagicalMode: string;
  magicalPoolEmpty: string;
  noWeatherYet: string;
  notConfigured: string;
  unauthorized: string;
  invalidDuration: string;
  invalidRoll: string;
  unknownType: string;
  guildOnly: string;
  skippedNoChannel: string;
  unknownSubcommand: string;
  commandError: string;
  calendarLoadError: string;
  calendarTodayTitle: string;
  calendarEventsHeader: string;
  calendarNoEvents: string;
  calendarViewLink: string;
  calendarFullMoonTitle: string;
  calendarFullMoonWhen: string;
  calendarMoonNightTitle: string;
  calendarSetupSuccess: string;
  calendarClearSuccess: string;
  calendarClearNone: string;
  helpEmbedTitle: string;
  helpEmbedDescription: string;
  helpEmbedDescriptionPlayer: string;
  helpFieldEveryone: string;
  helpFieldPlayer: string;
  helpEveryoneBody: string;
  helpFieldDm: string;
  helpDmBody: string;
  announceScheduleSuccess: string;
  announceListEmpty: string;
  announceListTitle: string;
  announceListItem: string;
  announceCancelSuccess: string;
  announceCancelNotFound: string;
  announceInvalidWhen: string;
  announceWhenInPast: string;
  announceBodyEmpty: string;
  announceModalTitle: string;
  announceModalIntro: string;
  announceModalBodyLabel: string;
  announcePostFailedDm: string;
  announcePostFailedDmIntro: string;
  statusReportTitle: string;
  statusReportDescription: string;
  statusReportCadenceLabel: string;
  statusReportUptimeMinutes: string;
  statusReportUptimeHours: string;
  statusReportFieldGuilds: string;
  statusReportFieldUsage: string;
  statusReportFieldIssues: string;
  statusReportGuildActive: string;
  statusReportGuildPaused: string;
  statusReportGuildsNone: string;
  statusReportUsageBody: string;
  statusReportIssuesNone: string;
  statusReportFieldStock: string;
  statusReportFieldBuildings: string;
  statusReportFieldLedger: string;
  statusReportStockNone: string;
  statusReportStockLine: string;
  statusReportBuildingsNone: string;
  statusReportBuildingLine: string;
  statusReportLedgerNone: string;
  statusReportLedgerLine: string;
  statusReportLedgerMore: string;
  resourceSetupSuccess: string;
  resourceClearSuccess: string;
  resourceClearNone: string;
  resourceNotConfigured: string;
  resourceTypeAddSuccess: string;
  resourceTypeEditSuccess: string;
  resourceTypeRemoveSuccess: string;
  resourceTypeExists: string;
  resourceTypeUnknown: string;
  resourceTypeInUse: string;
  resourceTypeInvalidKey: string;
  resourceTypeListEmpty: string;
  resourceTypeListTitle: string;
  resourceTypeListItem: string;
  resourceTypeNothingSet: string;
  resourceStockEmpty: string;
  resourceStockTitle: string;
  resourceStockCapNote: string;
  resourceStockLine: string;
  resourceDonateSuccess: string;
  resourceDonateOverflowNote: string;
  resourceWizardDonateModalTitle: string;
  resourceWizardBuyModalTitle: string;
  resourceWizardPersonalAddModalTitle: string;
  resourceWizardPersonalRemoveModalTitle: string;
  resourceWizardAdjustModalTitle: string;
  resourceWizardDonateIntro: string;
  resourceWizardBuyIntro: string;
  resourceWizardPersonalAddIntro: string;
  resourceWizardPersonalRemoveIntro: string;
  resourceWizardAdjustIntro: string;
  resourceWizardTypeLabel: string;
  resourceWizardTypePlaceholder: string;
  resourceWizardTypeOptionDesc: string;
  resourceWizardBuyTypeOptionDesc: string;
  resourceWizardPersonalTypeOptionDesc: string;
  resourceWizardAdjustTypeOptionDesc: string;
  resourceWizardAdjustTypeHint: string;
  resourceWizardAmountLabel: string;
  resourceWizardAmountPlaceholder: string;
  resourceWizardAdjustDirectionLabel: string;
  resourceWizardAdjustDirectionPlaceholder: string;
  resourceWizardAdjustDirectionHint: string;
  resourceWizardAdjustDirectionAdd: string;
  resourceWizardAdjustDirectionAddDesc: string;
  resourceWizardAdjustDirectionRemove: string;
  resourceWizardAdjustDirectionRemoveDesc: string;
  resourceWizardAdjustDirectionInvalid: string;
  resourceWizardAdjustAmountHint: string;
  resourceWizardNotYours: string;
  resourceOverviewGuildTitle: string;
  resourceOverviewPersonalTitle: string;
  resourceOverviewBuildingsTitle: string;
  resourceOverviewBuildingHeader: string;
  resourceOverviewBuildingPhase: string;
  resourceOverviewBuildingTime: string;
  resourceBuySuccess: string;
  resourceAdjustSuccess: string;
  resourceAdjustAdded: string;
  resourceAdjustRemoved: string;
  resourceAdjustOverflowNote: string;
  resourceInsufficientStock: string;
  resourceInsufficientPersonal: string;
  resourceInvalidAmount: string;
  resourceInvalidGc: string;
  resourceInvalidCap: string;
  resourceCapSuccess: string;
  resourceCapShow: string;
  resourcePersonalAddSuccess: string;
  resourcePersonalRemoveSuccess: string;
  resourcePersonalEmpty: string;
  resourcePersonalTitle: string;
  resourcePersonalLine: string;
  resourceEmbedDonateTitle: string;
  resourceEmbedBuyTitle: string;
  resourceEmbedBuildingDonateTitle: string;
  resourceEmbedBuildingDonatePersonalTitle: string;
  resourceEmbedBuildingFundTitle: string;
  resourceEmbedContributeTitle: string;
  resourceEmbedPersonalAddTitle: string;
  resourceEmbedPersonalRemoveTitle: string;
  resourceEmbedDonateDesc: string;
  resourceEmbedDonateOverflow: string;
  resourceEmbedBuyDesc: string;
  resourceEmbedBuildingDonateDesc: string;
  resourceEmbedBuildingDonatePersonalDesc: string;
  resourceEmbedBuildingFundDesc: string;
  resourceEmbedContributeDesc: string;
  resourceEmbedPersonalAddDesc: string;
  resourceEmbedPersonalRemoveDesc: string;
  resourceEmbedProductionTitle: string;
  resourceEmbedProductionLine: string;
  resourceEmbedProductionLostLine: string;
  resourceEmbedProductionFooter: string;
  productionAddSuccess: string;
  productionExists: string;
  productionUnknown: string;
  productionInvalidName: string;
  productionInvalidWorkers: string;
  productionInvalidYield: string;
  productionInvalidInterval: string;
  productionListEmpty: string;
  productionListTitle: string;
  productionListItem: string;
  productionWorkersSuccess: string;
  productionYieldSuccess: string;
  productionRemoveSuccess: string;
  productionWizardPickResource: string;
  productionWizardPickInterval: string;
  productionWizardPickSource: string;
  productionWizardResourcePlaceholder: string;
  productionWizardResourceLabel: string;
  productionWizardIntervalPlaceholder: string;
  productionWizardIntervalLabel: string;
  productionWizardSourcePlaceholder: string;
  productionWizardSourceLabel: string;
  productionWizardNoTypes: string;
  productionWizardNoSources: string;
  productionWizardNotYours: string;
  productionWizardAddModalTitle: string;
  productionWizardAddIntro: string;
  productionWizardNameLabel: string;
  productionWizardWorkersLabel: string;
  productionWizardYieldLabel: string;
  productionWizardMaxWorkersLabel: string;
  productionWizardWorkersModalTitle: string;
  productionWizardWorkersModalLabel: string;
  productionWizardWorkersFormTitle: string;
  productionWizardWorkersIntro: string;
  productionWizardYieldModalTitle: string;
  productionWizardYieldModalLabel: string;
  productionWizardYieldFormTitle: string;
  productionWizardYieldIntro: string;
  productionIntervalDaily: string;
  productionIntervalWeekly: string;
  statusReportFieldPersonal: string;
  statusReportPersonalNone: string;
  statusReportPersonalLine: string;
  buildingCreateSuccess: string;
  buildingExists: string;
  buildingUnknown: string;
  buildingInvalidName: string;
  buildingCostAddSuccess: string;
  buildingCostSetTimeSuccess: string;
  buildingCostBuildtimeSuccess: string;
  buildingCostLocked: string;
  buildingCostShowTitle: string;
  buildingCostShowEmpty: string;
  buildingCostShowLine: string;
  buildingCostShowTime: string;
  buildingCostShowPhase: string;
  buildingListEmpty: string;
  buildingListTitle: string;
  buildingListItem: string;
  buildingStatusTitle: string;
  buildingStatusFunding: string;
  buildingStatusBuilding: string;
  buildingStatusComplete: string;
  buildingStatusCancelled: string;
  buildingFundSuccess: string;
  buildingDonateSuccess: string;
  buildingDonatePersonalSuccess: string;
  buildingContributeSuccess: string;
  buildingWrongPhase: string;
  buildingNoCostForType: string;
  buildingCancelSuccess: string;
  buildingCancelWrongStatus: string;
  buildingPhaseFundingDone: string;
  buildingPhaseComplete: string;
  buildingWizardPickBuilding: string;
  buildingWizardPickBuildingTime: string;
  buildingWizardPickResource: string;
  buildingWizardBuildingPlaceholder: string;
  buildingWizardBuildingLabel: string;
  buildingWizardResourcePlaceholder: string;
  buildingWizardResourceLabel: string;
  buildingWizardAmountLabel: string;
  buildingWizardNoFunding: string;
  buildingWizardNoBuilding: string;
  buildingWizardNoMissing: string;
  buildingWizardBuildingGone: string;
  buildingWizardNotYours: string;
  buildingWizardStillNeeded: string;
  buildingWizardStillNeededWithPersonal: string;
  buildingWizardTimeLeft: string;
  buildingWizardPickBuildingCost: string;
  buildingWizardPickResourceCost: string;
  buildingWizardPickBuildingTimeSet: string;
  buildingWizardPickBuildingBuildtime: string;
  buildingWizardPickBuildingShow: string;
  buildingWizardNoCostEditable: string;
  buildingWizardNoBuildtimeEditable: string;
  buildingWizardBuildtimeOptionDesc: string;
  buildingWizardBuildtimeIntro: string;
  buildingWizardNoFundingAdjust: string;
  buildingWizardFundingAdjustTitle: string;
  buildingWizardFundingAdjustIntro: string;
  buildingWizardFundingOptionDesc: string;
  buildingWizardNoSpentAdjust: string;
  buildingWizardSpentAdjustTitle: string;
  buildingWizardSpentAdjustIntro: string;
  buildingWizardSpentOptionDesc: string;
  buildingBuildtimeLocked: string;
  buildingFundingAdjustLocked: string;
  buildingFundingTypeNotOnProject: string;
  buildingFundingInsufficient: string;
  buildingFundingAdjustSuccess: string;
  buildingFundingAdjustAdded: string;
  buildingFundingAdjustRemoved: string;
  buildingSpentAdjustLocked: string;
  buildingSpentInsufficient: string;
  buildingSpentAdjustSuccess: string;
  buildingSpentAdjustAdded: string;
  buildingSpentAdjustRemoved: string;
  buildingWizardTypePrices: string;
  buildingWizardAmountModalTitle: string;
  buildingWizardAmountModalLabel: string;
  buildingWizardTimeModalTitle: string;
  buildingWizardTimeModalLabel: string;
  buildingWizardBuildtimeModalTitle: string;
  buildingWizardBuildtimeModalLabel: string;
  buildingWizardCostModalTitle: string;
  buildingWizardCostTypeLabel: string;
  buildingWizardCostAmountLabel: string;
  buildingWizardCostAddAnother: string;
  buildingWizardMaterialModalTitle: string;
  buildingWizardDonateIntro: string;
  buildingWizardFundIntro: string;
  buildingWizardSourceLabel: string;
  buildingWizardSourcePlaceholder: string;
  buildingWizardSourceOutside: string;
  buildingWizardSourceOutsideDesc: string;
  buildingWizardSourcePersonal: string;
  buildingWizardSourcePersonalDesc: string;
  buildingWizardSourceInvalid: string;
  buildingWizardMaterialModalLabel: string;
  buildingWizardContributeModalTitle: string;
  buildingWizardContributeIntro: string;
  buildingWizardContributeModalLabel: string;
  buildingWizardCostAddIntro: string;
}

/** Per-guild channel for public resource/building posts. */
export interface ResourceSettings {
  guild_id: string;
  channel_id: string;
  updated_at: string;
  storage_cap: number;
  production_last_post_date: string | null;
}

export type ProductionInterval = 'daily' | 'weekly';

export interface ProductionSource {
  id: number;
  guild_id: string;
  name: string;
  name_key: string;
  resource_key: string;
  workers: number;
  max_workers: number;
  yield_per_worker: number;
  interval: ProductionInterval;
  last_paid_period: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceType {
  guild_id: string;
  key: string;
  display_name: string;
  sell_gc: number;
  buy_gc: number;
  created_at: string;
}

export interface GuildStockRow {
  guild_id: string;
  resource_key: string;
  quantity: number;
}

export interface PlayerStockRow {
  guild_id: string;
  user_id: string;
  resource_key: string;
  quantity: number;
}

export type BuildingStatus = 'funding' | 'building' | 'complete' | 'cancelled';

export interface Building {
  id: number;
  guild_id: string;
  name: string;
  name_key: string;
  status: BuildingStatus;
  time_required: number;
  time_spent: number;
  created_at: string;
  completed_at: string | null;
}

export interface BuildingCost {
  building_id: number;
  resource_key: string;
  required_qty: number;
}

export interface BuildingFunding {
  building_id: number;
  resource_key: string;
  deposited_qty: number;
}

export interface ResourceLedgerEntry {
  id: number;
  guild_id: string;
  created_at: string;
  actor_user_id: string;
  actor_nickname: string;
  action: string;
  resource_key: string | null;
  amount: number;
  gc_delta: number;
  building_id: number | null;
  stock_after: number | null;
}

export type CalendarEvent =
  | { type: 'festival'; name: string; icon: string; css?: string }
  | { type: 'birthday'; name: string }
  | {
      type: 'memorial';
      title: string;
      memorialType: 'festive' | 'death' | 'memorial';
      subtitle: string | null;
    };

export interface CalendarNextFullMoon {
  dayOfYear: number;
  daysUntil: number;
  whenText: string;
  label: string;
}

export interface CalendarDay {
  dayOfYear: number;
  refYear: number;
  timezone: string;
  leapYearNote: string | null;
  harptos: {
    label: string;
    month: string;
    day: number;
    special: string | null;
  };
  gregorian: {
    iso: string;
    year: number;
    month: number;
    day: number;
  };
  moon: {
    phase: string;
    emoji: string;
    isExactFullMoon: boolean;
  };
  events: CalendarEvent[];
  /** Optional while calendar API still includes it; bot no longer requires this for /eryndor today. */
  nextFullMoon?: CalendarNextFullMoon;
}
