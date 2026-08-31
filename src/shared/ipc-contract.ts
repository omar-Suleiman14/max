import type { AccountDefinition, AccountDraft } from './account-contract';
import type {
  BackupMetadata,
  BackupTrigger,
  BackupVerificationResult,
  CloudBackupCreateResult,
  CloudBackupMetadata,
  CloudBackupStatus,
  RestoreResult,
} from './backup-contract';
import type {
  Blueprint,
  BlueprintValidationResult,
  CompleteOnboardingDraft,
  ShopMetadata,
} from './blueprint-contract';
import type {
  AuditEntry,
  ConfigurableRecord,
  ConfigurableRecordDraft,
  MutationResult,
  ObjectKind,
  PropertyDefinition,
  PropertyDraft,
} from './object-contract';
import type { TemplateDefinition, TemplateDraft } from './template-contract';
import type {
  PricingChannel, PricingChannelDraft, PricingProfile, PricingProfileDraft, PricingProvider, PricingProviderDraft,
  PricingQuoteInput, PricingService, PricingServiceDraft, PricingSnapshot,
} from './pricing-contract';
import type {
  LedgerSummary,
  TransactionDraft,
  TransactionRecord,
  TransferDraft,
} from './transaction-contract';

export const IPC_CHANNELS = {
  accountArchive: 'max:accounts:archive',
  accountCreate: 'max:accounts:create',
  accountList: 'max:accounts:list',
  accountUpdate: 'max:accounts:update',
  backupCreate: 'max:backup:create',
  backupList: 'max:backup:list',
  backupRestore: 'max:backup:restore',
  backupVerify: 'max:backup:verify',
  cloudBackupCreate: 'max:cloud-backup:create',
  cloudBackupList: 'max:cloud-backup:list',
  cloudBackupRestore: 'max:cloud-backup:restore',
  cloudBackupRunScheduled: 'max:cloud-backup:run-scheduled',
  cloudBackupStatus: 'max:cloud-backup:status',
  blueprintExport: 'max:blueprints:export',
  blueprintImport: 'max:blueprints:import',
  blueprintValidate: 'max:blueprints:validate',
  objectAuditList: 'max:objects:audit:list',
  objectPropertyArchive: 'max:objects:properties:archive',
  objectPropertyCreate: 'max:objects:properties:create',
  objectPropertyList: 'max:objects:properties:list',
  objectPropertyUpdate: 'max:objects:properties:update',
  objectRecordArchive: 'max:objects:records:archive',
  objectRecordCreate: 'max:objects:records:create',
  objectRecordList: 'max:objects:records:list',
  objectRecordReorder: 'max:objects:records:reorder',
  objectRecordUpdate: 'max:objects:records:update',
  pageArchive: 'max:pages:archive',
  pageCreate: 'max:pages:create',
  pageList: 'max:pages:list',
  pageListArchived: 'max:pages:list-archived',
  pageRestore: 'max:pages:restore',
  pageEmptyTrash: 'max:pages:empty-trash',
  pageUpdate: 'max:pages:update',
  peopleBalances: 'max:people:balances',
  peopleForgiveDebt: 'max:people:debt:forgive',
  peopleRepayDebt: 'max:people:debt:repay',
  peopleStatement: 'max:people:statement',
  pricingArchive: 'max:pricing:archive',
  pricingCreate: 'max:pricing:create',
  pricingList: 'max:pricing:list',
  pricingQuote: 'max:pricing:quote',
  pricingUpdate: 'max:pricing:update',
  pricingProviderArchive: 'max:pricing:providers:archive',
  pricingProviderCreate: 'max:pricing:providers:create',
  pricingProviderList: 'max:pricing:providers:list',
  pricingProviderUpdate: 'max:pricing:providers:update',
  pricingChannelArchive: 'max:pricing:channels:archive',
  pricingChannelCreate: 'max:pricing:channels:create',
  pricingChannelList: 'max:pricing:channels:list',
  pricingChannelUpdate: 'max:pricing:channels:update',
  pricingServiceArchive: 'max:pricing:services:archive',
  pricingServiceCreate: 'max:pricing:services:create',
  pricingServiceList: 'max:pricing:services:list',
  pricingServiceUpdate: 'max:pricing:services:update',
  quickEntryGetSuggestion: 'max:quick-entry:suggestion',
  quickEntryQuotePricing: 'max:quick-entry:pricing-quote',
  quickEntrySubmit: 'max:quick-entry:submit',
  reconciliationCloseSession: 'max:reconciliation:session:close',
  reconciliationCurrentSession: 'max:reconciliation:session:current',
  reconciliationExpectedClosing: 'max:reconciliation:session:expected',
  reconciliationListSessions: 'max:reconciliation:session:list',
  reconciliationOpenSession: 'max:reconciliation:session:open',
  searchQuery: 'max:search:query',
  shopCompleteOnboarding: 'max:shop:onboarding:complete',
  shopGetMetadata: 'max:shop:metadata:get',
  shopSeedDemoData: 'max:shop:demo-data:seed',
  shopResetDemoData: 'max:shop:demo-data:reset',
  shopUpdateMetadata: 'max:shop:metadata:update',
  systemHealth: 'max:system:health',
  systemResetWorkspace: 'max:system:workspace:reset',
  templateArchive: 'max:templates:archive',
  templateCreate: 'max:templates:create',
  templateList: 'max:templates:list',
  templateUpdate: 'max:templates:update',
  transactionCreate: 'max:transactions:create',
  transactionGet: 'max:transactions:get',
  transactionList: 'max:transactions:list',
  transactionReverse: 'max:transactions:reverse',
  transactionSummary: 'max:transactions:summary',
  transactionTransfer: 'max:transactions:transfer',
  transactionUndo: 'max:transactions:undo',
  viewArchive: 'max:views:archive',
  viewCreate: 'max:views:create',
  viewList: 'max:views:list',
  viewUpdate: 'max:views:update',
} as const;

export type DatabaseHealth = Readonly<{
  migrationCount: number;
  schemaVersion: number;
  status: 'ready';
}>;

export type SystemHealth = Readonly<{
  appVersion: string;
  database: DatabaseHealth;
  runtime: Readonly<{
    arch: string;
    platform: 'linux' | 'macos' | 'windows';
  }>;
}>;

export type DemoSeedSummary = Readonly<{
  accounts: number;
  items: number;
  pages: number;
  people: number;
  transactions: number;
}>;

import type {
  ForgivenessDraft,
  PersonBalanceSummary,
  PersonFinancialStatement,
  RepaymentDraft,
} from './person-debt-contract';
import type { QuickEntryDraft, QuickEntryPriceSuggestion } from './quick-entry-contract';
import type {
  CloseSessionDraft,
  DailySession,
  OpenSessionDraft,
  SessionExpectedClosing,
} from './reconciliation-contract';
import type {
  CustomPage,
  CustomPageDraft,
  SavedView,
  SavedViewDraft,
  SearchResult,
  ViewTargetKind,
} from './views-search-contract';

export type MaxApi = Readonly<{
  accounts: Readonly<{
    archive: (id: string) => Promise<MutationResult<null>>;
    create: (draft: AccountDraft) => Promise<MutationResult<AccountDefinition>>;
    list: () => Promise<readonly AccountDefinition[]>;
    update: (id: string, draft: AccountDraft) => Promise<MutationResult<AccountDefinition>>;
  }>;
  backups: Readonly<{
    create: (trigger?: BackupTrigger) => Promise<MutationResult<BackupMetadata>>;
    list: () => Promise<readonly BackupMetadata[]>;
    restore: (backupIdOrPath: string) => Promise<MutationResult<RestoreResult>>;
    verify: (backupIdOrPath: string) => Promise<BackupVerificationResult>;
  }>;
  blueprints: Readonly<{
    export: () => Promise<Blueprint>;
    import: (blueprint: Blueprint) => Promise<MutationResult<Blueprint>>;
    validate: (blueprint: unknown) => Promise<BlueprintValidationResult>;
  }>;
  cloudBackups: Readonly<{
    create: (sessionToken: string, trigger?: BackupTrigger) => Promise<MutationResult<CloudBackupCreateResult>>;
    getStatus: () => Promise<CloudBackupStatus>;
    list: (sessionToken: string) => Promise<MutationResult<readonly CloudBackupMetadata[]>>;
    restore: (sessionToken: string, backupId: string) => Promise<MutationResult<RestoreResult>>;
    runScheduled: (sessionToken: string, schedule: 'daily' | 'manual' | 'weekly') => Promise<MutationResult<CloudBackupCreateResult | null>>;
  }>;
  objects: Readonly<{
    archiveProperty: (id: string) => Promise<MutationResult<null>>;
    archiveRecord: (id: string) => Promise<MutationResult<null>>;
    createProperty: (draft: PropertyDraft) => Promise<MutationResult<PropertyDefinition>>;
    createRecord: (draft: ConfigurableRecordDraft) => Promise<MutationResult<ConfigurableRecord>>;
    listAudit: (entityId: string) => Promise<readonly AuditEntry[]>;
    listProperties: (objectKind: ObjectKind) => Promise<readonly PropertyDefinition[]>;
    listRecords: (objectKind: ObjectKind) => Promise<readonly ConfigurableRecord[]>;
    reorderRecords: (objectKind: ObjectKind, orderedIds: readonly string[]) => Promise<MutationResult<null>>;
    updateProperty: (id: string, draft: PropertyDraft) => Promise<MutationResult<PropertyDefinition>>;
    updateRecord: (id: string, draft: ConfigurableRecordDraft) => Promise<MutationResult<ConfigurableRecord>>;
  }>;
  pages: Readonly<{
    archive: (id: string) => Promise<MutationResult<null>>;
    create: (draft: CustomPageDraft) => Promise<MutationResult<CustomPage>>;
    emptyTrash: () => Promise<MutationResult<null>>;
    list: () => Promise<readonly CustomPage[]>;
    listArchived: () => Promise<readonly CustomPage[]>;
    restore: (id: string) => Promise<MutationResult<CustomPage>>;
    update: (id: string, draft: CustomPageDraft) => Promise<MutationResult<CustomPage>>;
  }>;
  people: Readonly<{
    forgiveDebt: (draft: ForgivenessDraft) => Promise<MutationResult<TransactionRecord>>;
    getBalances: () => Promise<readonly PersonBalanceSummary[]>;
    getStatement: (personId: string) => Promise<PersonFinancialStatement>;
    repayDebt: (draft: RepaymentDraft) => Promise<MutationResult<TransactionRecord>>;
  }>;
  pricing: Readonly<{
    archive: (id: string) => Promise<MutationResult<null>>;
    create: (draft: PricingProfileDraft) => Promise<MutationResult<PricingProfile>>;
    list: () => Promise<readonly PricingProfile[]>;
    quote: (profileId: string, input: PricingQuoteInput) => Promise<MutationResult<PricingSnapshot>>;
    update: (id: string, draft: PricingProfileDraft) => Promise<MutationResult<PricingProfile>>;
    providers: Readonly<{
      archive: (id: string) => Promise<MutationResult<null>>;
      create: (draft: PricingProviderDraft) => Promise<MutationResult<PricingProvider>>;
      list: () => Promise<readonly PricingProvider[]>;
      update: (id: string, draft: PricingProviderDraft) => Promise<MutationResult<PricingProvider>>;
    }>;
    channels: Readonly<{
      archive: (id: string) => Promise<MutationResult<null>>;
      create: (draft: PricingChannelDraft) => Promise<MutationResult<PricingChannel>>;
      list: () => Promise<readonly PricingChannel[]>;
      update: (id: string, draft: PricingChannelDraft) => Promise<MutationResult<PricingChannel>>;
    }>;
    services: Readonly<{
      archive: (id: string) => Promise<MutationResult<null>>;
      create: (draft: PricingServiceDraft) => Promise<MutationResult<PricingService>>;
      list: () => Promise<readonly PricingService[]>;
      update: (id: string, draft: PricingServiceDraft) => Promise<MutationResult<PricingService>>;
    }>;
  }>;
  quickEntry: Readonly<{
    getSuggestion: (itemId?: string, templateId?: string) => Promise<QuickEntryPriceSuggestion>;
    quotePricing: (draft: QuickEntryDraft) => Promise<MutationResult<PricingSnapshot | null>>;
    submit: (draft: QuickEntryDraft) => Promise<MutationResult<TransactionRecord>>;
  }>;
  reconciliation: Readonly<{
    closeSession: (draft: CloseSessionDraft) => Promise<MutationResult<DailySession>>;
    getCurrentSession: (accountId?: string) => Promise<DailySession | null>;
    getExpectedClosing: (sessionId: string) => Promise<SessionExpectedClosing>;
    listSessions: (limit?: number) => Promise<readonly DailySession[]>;
    openSession: (draft: OpenSessionDraft) => Promise<MutationResult<DailySession>>;
  }>;
  search: Readonly<{
    query: (searchTerm: string) => Promise<readonly SearchResult[]>;
  }>;
  shop: Readonly<{
    completeOnboarding: (draft: CompleteOnboardingDraft) => Promise<MutationResult<ShopMetadata>>;
    getMetadata: () => Promise<ShopMetadata>;
    resetDemoData: (locale: 'ar' | 'en') => Promise<MutationResult<DemoSeedSummary>>;
    seedDemoData: (locale: 'ar' | 'en') => Promise<MutationResult<DemoSeedSummary>>;
    updateMetadata: (patch: Partial<ShopMetadata>) => Promise<MutationResult<ShopMetadata>>;
  }>;
  system: Readonly<{
    getHealth: () => Promise<SystemHealth>;
    resetWorkspace: () => Promise<MutationResult<null>>;
  }>;
  templates: Readonly<{
    archive: (id: string) => Promise<MutationResult<null>>;
    create: (draft: TemplateDraft) => Promise<MutationResult<TemplateDefinition>>;
    list: (objectKind: ObjectKind) => Promise<readonly TemplateDefinition[]>;
    update: (id: string, draft: TemplateDraft) => Promise<MutationResult<TemplateDefinition>>;
  }>;
  transactions: Readonly<{
    create: (draft: TransactionDraft) => Promise<MutationResult<TransactionRecord>>;
    createTransfer: (draft: TransferDraft) => Promise<MutationResult<TransactionRecord>>;
    get: (id: string) => Promise<TransactionRecord | null>;
    getSummary: () => Promise<LedgerSummary>;
    list: () => Promise<readonly TransactionRecord[]>;
    reverse: (id: string, reason?: string) => Promise<MutationResult<TransactionRecord>>;
    undo: (id: string) => Promise<MutationResult<null>>;
  }>;
  views: Readonly<{
    archive: (id: string) => Promise<MutationResult<null>>;
    create: (draft: SavedViewDraft) => Promise<MutationResult<SavedView>>;
    list: (targetKind?: ViewTargetKind) => Promise<readonly SavedView[]>;
    update: (id: string, draft: SavedViewDraft) => Promise<MutationResult<SavedView>>;
  }>;
}>;
