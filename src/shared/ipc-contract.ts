import type { AccountDefinition, AccountDraft } from './account-contract';
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
  objectRecordUpdate: 'max:objects:records:update',
  peopleBalances: 'max:people:balances',
  peopleForgiveDebt: 'max:people:debt:forgive',
  peopleRepayDebt: 'max:people:debt:repay',
  peopleStatement: 'max:people:statement',
  quickEntryGetSuggestion: 'max:quick-entry:suggestion',
  quickEntrySubmit: 'max:quick-entry:submit',
  shopCompleteOnboarding: 'max:shop:onboarding:complete',
  shopGetMetadata: 'max:shop:metadata:get',
  shopUpdateMetadata: 'max:shop:metadata:update',
  systemHealth: 'max:system:health',
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

import type {
  ForgivenessDraft,
  PersonBalanceSummary,
  PersonFinancialStatement,
  RepaymentDraft,
} from './person-debt-contract';
import type { QuickEntryDraft, QuickEntryPriceSuggestion } from './quick-entry-contract';

export type MaxApi = Readonly<{
  accounts: Readonly<{
    archive: (id: string) => Promise<MutationResult<null>>;
    create: (draft: AccountDraft) => Promise<MutationResult<AccountDefinition>>;
    list: () => Promise<readonly AccountDefinition[]>;
    update: (id: string, draft: AccountDraft) => Promise<MutationResult<AccountDefinition>>;
  }>;
  blueprints: Readonly<{
    export: () => Promise<Blueprint>;
    import: (blueprint: Blueprint) => Promise<MutationResult<Blueprint>>;
    validate: (blueprint: unknown) => Promise<BlueprintValidationResult>;
  }>;
  objects: Readonly<{
    archiveProperty: (id: string) => Promise<MutationResult<null>>;
    archiveRecord: (id: string) => Promise<MutationResult<null>>;
    createProperty: (draft: PropertyDraft) => Promise<MutationResult<PropertyDefinition>>;
    createRecord: (draft: ConfigurableRecordDraft) => Promise<MutationResult<ConfigurableRecord>>;
    listAudit: (entityId: string) => Promise<readonly AuditEntry[]>;
    listProperties: (objectKind: ObjectKind) => Promise<readonly PropertyDefinition[]>;
    listRecords: (objectKind: ObjectKind) => Promise<readonly ConfigurableRecord[]>;
    updateProperty: (id: string, draft: PropertyDraft) => Promise<MutationResult<PropertyDefinition>>;
    updateRecord: (id: string, draft: ConfigurableRecordDraft) => Promise<MutationResult<ConfigurableRecord>>;
  }>;
  people: Readonly<{
    forgiveDebt: (draft: ForgivenessDraft) => Promise<MutationResult<TransactionRecord>>;
    getBalances: () => Promise<readonly PersonBalanceSummary[]>;
    getStatement: (personId: string) => Promise<PersonFinancialStatement>;
    repayDebt: (draft: RepaymentDraft) => Promise<MutationResult<TransactionRecord>>;
  }>;
  quickEntry: Readonly<{
    getSuggestion: (itemId?: string, templateId?: string) => Promise<QuickEntryPriceSuggestion>;
    submit: (draft: QuickEntryDraft) => Promise<MutationResult<TransactionRecord>>;
  }>;
  shop: Readonly<{
    completeOnboarding: (draft: CompleteOnboardingDraft) => Promise<MutationResult<ShopMetadata>>;
    getMetadata: () => Promise<ShopMetadata>;
    updateMetadata: (patch: Partial<ShopMetadata>) => Promise<MutationResult<ShopMetadata>>;
  }>;
  system: Readonly<{
    getHealth: () => Promise<SystemHealth>;
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
}>;
