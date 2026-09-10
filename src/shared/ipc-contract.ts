import type { UpdateApi } from './update-contract';
import type { AccountDefinition, AccountDraft } from './account-contract';
import type { PageGraph } from './page-links';
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
  LedgerSummary,
  TransactionDraft,
  TransactionRecord,
  TransferDraft,
} from './transaction-contract';
import type {
  MigrationSummary,
  MutationResult as WorkspaceMutationResult,
  WorkspaceNavigation,
  WorkspaceNode,
  WorkspaceNodeDraft,
  WorkspaceNodePatch,
  WorkspaceSearchResult,
} from './workspace-contract';
import type {
  DatabaseSchema,
  WorkspaceDatabase,
  WorkspaceDatabaseDraft,
  WorkspaceDatabasePatch,
} from './database-contract';
import type {
  PropertyDraft as WorkspacePropertyDraft,
  PropertyPatch as WorkspacePropertyPatch,
  PropertyType,
  TypeConversionPreview,
  TypeConversionStrategy,
  WorkspaceProperty,
  WorkspaceRecord,
  WorkspaceRecordDraft,
  WorkspaceRecordPatch,
  WorkspaceRecordTemplate,
} from './property-contract';
import type {
  RelationTargetSummary,
  WorkspaceRelation,
  WorkspaceRelationDraft,
} from './relation-contract';
import type {
  DatabaseQueryParams,
  DatabaseQueryResult,
} from './query-contract';
import type {
  WorkspaceView,
  WorkspaceViewDraft,
  WorkspaceViewPatch,
} from './view-contract';
import type {
  WorkflowExecutionInput,
  WorkflowExecutionResult,
  WorkflowFormEvaluation,
  WorkspaceWorkflow,
  WorkspaceWorkflowDraft,
} from './workflow-contract';
import type { TemplateImportResult, WorkspaceTemplateV2 } from './template-v2-contract';

export const IPC_CHANNELS = {
  updateStatus: 'max:update:status',
  updateCheck: 'max:update:check',
  updateInstall: 'max:update:install',
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

  // Max v0.2.0 Workspace Channels
  workspaceGetNavigation: 'max:workspace:navigation:get',
  workspaceGetNode: 'max:workspace:nodes:get',
  workspaceCreateNode: 'max:workspace:nodes:create',
  workspaceUpdateNode: 'max:workspace:nodes:update',
  workspaceArchiveNode: 'max:workspace:nodes:archive',
  workspacePermanentlyDeleteNode: 'max:workspace:nodes:permanently-delete',
  workspaceRestoreNode: 'max:workspace:nodes:restore',
  workspaceReorderNode: 'max:workspace:nodes:reorder',
  workspaceGetDatabase: 'max:workspace:databases:get',
  workspaceGetDatabaseSchema: 'max:workspace:databases:schema',
  workspaceCreateDatabase: 'max:workspace:databases:create',
  workspaceUpdateDatabase: 'max:workspace:databases:update',
  workspaceArchiveDatabase: 'max:workspace:databases:archive',
  workspacePermanentlyDeleteDatabase: 'max:workspace:databases:permanently-delete',
  workspaceDuplicateDatabase: 'max:workspace:databases:duplicate',
  workspaceListProperties: 'max:workspace:properties:list',
  workspaceListRecordTemplates: 'max:workspace:record-templates:list',
  workspaceSaveRecordTemplate: 'max:workspace:record-templates:save-from-record',
  workspaceEditRecordTemplate: 'max:workspace:record-templates:edit',
  workspaceArchiveRecordTemplate: 'max:workspace:record-templates:archive',
  workspaceCreateProperty: 'max:workspace:properties:create',
  workspaceUpdateProperty: 'max:workspace:properties:update',
  workspaceArchiveProperty: 'max:workspace:properties:archive',
  workspacePreviewTypeConversion: 'max:workspace:properties:preview-type-conversion',
  workspaceApplyTypeConversion: 'max:workspace:properties:apply-type-conversion',
  workspaceGetRecord: 'max:workspace:records:get',
  workspaceCreateRecord: 'max:workspace:records:create',
  workspaceUpdateRecord: 'max:workspace:records:update',
  workspaceArchiveRecord: 'max:workspace:records:archive',
  workspaceBatchCreateRecords: 'max:workspace:records:batch-create',
  workspaceListRelations: 'max:workspace:relations:list',
  workspaceCreateRelation: 'max:workspace:relations:create',
  workspaceArchiveRelation: 'max:workspace:relations:archive',
  workspaceGetRelatedRecords: 'max:workspace:relations:get-related',
  workspaceLinkRecords: 'max:workspace:relations:link',
  workspaceUnlinkRecords: 'max:workspace:relations:unlink',
  workspaceSearchRelationTargets: 'max:workspace:relations:search-targets',
  workspaceListViews: 'max:workspace:views:list',
  workspaceGetView: 'max:workspace:views:get',
  workspaceCreateView: 'max:workspace:views:create',
  workspaceUpdateView: 'max:workspace:views:update',
  workspaceArchiveView: 'max:workspace:views:archive',
  workspaceQueryDatabase: 'max:workspace:queries:execute',
  workspaceListWorkflows: 'max:workspace:workflows:list',
  workspaceGetWorkflow: 'max:workspace:workflows:get',
  workspaceCreateWorkflow: 'max:workspace:workflows:create',
  workspaceUpdateWorkflow: 'max:workspace:workflows:update',
  workspaceArchiveWorkflow: 'max:workspace:workflows:archive',
  workspaceEvaluateWorkflow: 'max:workspace:workflows:evaluate',
  workspaceExecuteWorkflow: 'max:workspace:workflows:execute',
  workspaceSearch: 'max:workspace:search:query',
  workspaceImportTemplate: 'max:workspace:templates:import',
  workspaceGetPageGraph: 'max:workspace:pages:graph',
  workspaceOpenExternal: 'max:workspace:open-external',
  workspaceValidateTemplate: 'max:workspace:templates:validate',
  workspaceExportTemplate: 'max:workspace:templates:export',
  workspaceImportFile: 'max:workspace:files:import',
  workspaceMigrateV01: 'max:workspace:migration:v01-to-v02',
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
  updates?: UpdateApi;
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
  workspace: Readonly<{
    archiveDatabase: (id: string) => Promise<WorkspaceMutationResult<null>>;
    permanentlyDeleteDatabase: (id: string) => Promise<WorkspaceMutationResult<null>>;
    archiveNode: (id: string) => Promise<WorkspaceMutationResult<null>>;
    permanentlyDeleteNode: (id: string) => Promise<WorkspaceMutationResult<null>>;
    archiveProperty: (id: string) => Promise<WorkspaceMutationResult<null>>;
    archiveRecord: (id: string) => Promise<WorkspaceMutationResult<null>>;
    archiveRelation: (id: string) => Promise<WorkspaceMutationResult<null>>;
    archiveView: (id: string) => Promise<WorkspaceMutationResult<null>>;
    archiveWorkflow: (id: string) => Promise<WorkspaceMutationResult<null>>;
    applyTypeConversion: (propertyId: string, targetType: PropertyType, strategy?: TypeConversionStrategy) => Promise<WorkspaceMutationResult<WorkspaceProperty>>;
    batchCreateRecords: (records: readonly WorkspaceRecordDraft[]) => Promise<WorkspaceMutationResult<readonly WorkspaceRecord[]>>;
    createDatabase: (draft: WorkspaceDatabaseDraft) => Promise<WorkspaceMutationResult<WorkspaceDatabase>>;
    createNode: (draft: WorkspaceNodeDraft) => Promise<WorkspaceMutationResult<WorkspaceNode>>;
    createProperty: (draft: WorkspacePropertyDraft) => Promise<WorkspaceMutationResult<WorkspaceProperty>>;
    createRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceMutationResult<WorkspaceRecord>>;
    createRelation: (draft: WorkspaceRelationDraft) => Promise<WorkspaceMutationResult<WorkspaceRelation>>;
    createView: (draft: WorkspaceViewDraft) => Promise<WorkspaceMutationResult<WorkspaceView>>;
    createWorkflow: (draft: WorkspaceWorkflowDraft) => Promise<WorkspaceMutationResult<WorkspaceWorkflow>>;
    duplicateDatabase: (id: string, options?: { includeRecords?: boolean; title?: string }) => Promise<WorkspaceMutationResult<WorkspaceDatabase>>;
    evaluateWorkflow: (input: WorkflowExecutionInput) => Promise<WorkspaceMutationResult<WorkflowFormEvaluation>>;
    executeWorkflow: (input: WorkflowExecutionInput) => Promise<WorkspaceMutationResult<WorkflowExecutionResult>>;
    getDatabase: (id: string) => Promise<WorkspaceDatabase | null>;
    getDatabaseSchema: (id: string) => Promise<DatabaseSchema>;
    getNavigation: (includeArchived?: boolean) => Promise<WorkspaceNavigation>;
    getPageGraph: () => Promise<PageGraph>;
    openExternal: (url: string) => Promise<WorkspaceMutationResult<null>>;
    getNode: (id: string) => Promise<WorkspaceNode | null>;
    getRecord: (id: string) => Promise<WorkspaceRecord | null>;
    getRelatedRecords: (recordId: string, relationId: string) => Promise<readonly WorkspaceRecord[]>;
    getView: (id: string) => Promise<WorkspaceView | null>;
    getWorkflow: (id: string) => Promise<WorkspaceWorkflow | null>;
    importTemplate: (template: WorkspaceTemplateV2) => Promise<WorkspaceMutationResult<TemplateImportResult>>;
    validateTemplate: (template: unknown) => Promise<WorkspaceMutationResult<null>>;
    exportTemplate: () => Promise<WorkspaceMutationResult<WorkspaceTemplateV2>>;
    linkRecords: (relationId: string, sourceRecordId: string, targetRecordId: string) => Promise<WorkspaceMutationResult<null>>;
    listProperties: (databaseId: string) => Promise<readonly WorkspaceProperty[]>;
    listRecordTemplates: (databaseId: string) => Promise<readonly WorkspaceRecordTemplate[]>;
    saveRecordTemplate: (recordId: string, name: string) => Promise<WorkspaceMutationResult<WorkspaceRecordTemplate>>;
    editRecordTemplate: (databaseId: string, id: string | null, patch: Pick<WorkspaceRecordPatch, 'title' | 'contentJson' | 'icon' | 'positionKey'>) => Promise<WorkspaceMutationResult<WorkspaceRecordTemplate>>;
    archiveRecordTemplate: (id: string) => Promise<WorkspaceMutationResult<void>>;
    listRelations: (databaseId: string) => Promise<readonly WorkspaceRelation[]>;
    listViews: (ownerId: string, ownerType?: 'database' | 'block') => Promise<readonly WorkspaceView[]>;
    listWorkflows: () => Promise<readonly WorkspaceWorkflow[]>;
    migrateV01: (locale?: 'ar' | 'en') => Promise<WorkspaceMutationResult<MigrationSummary>>;
    previewTypeConversion: (propertyId: string, targetType: PropertyType) => Promise<TypeConversionPreview>;
    queryDatabase: (params: DatabaseQueryParams) => Promise<DatabaseQueryResult>;
    reorderNode: (id: string, targetPositionKey: string, newParentId?: string | null) => Promise<WorkspaceMutationResult<WorkspaceNode>>;
    restoreNode: (id: string) => Promise<WorkspaceMutationResult<WorkspaceNode>>;
    searchRelationTargets: (relationId: string, query: string, limit?: number, fromRecordId?: string) => Promise<readonly RelationTargetSummary[]>;
    searchWorkspace: (query: string, limit?: number) => Promise<readonly WorkspaceSearchResult[]>;
    unlinkRecords: (relationId: string, sourceRecordId: string, targetRecordId: string) => Promise<WorkspaceMutationResult<null>>;
    updateDatabase: (id: string, patch: WorkspaceDatabasePatch) => Promise<WorkspaceMutationResult<WorkspaceDatabase>>;
    updateNode: (id: string, patch: WorkspaceNodePatch) => Promise<WorkspaceMutationResult<WorkspaceNode>>;
    updateProperty: (id: string, patch: WorkspacePropertyPatch) => Promise<WorkspaceMutationResult<WorkspaceProperty>>;
    updateRecord: (id: string, patch: WorkspaceRecordPatch) => Promise<WorkspaceMutationResult<WorkspaceRecord>>;
    updateView: (id: string, patch: WorkspaceViewPatch) => Promise<WorkspaceMutationResult<WorkspaceView>>;
    updateWorkflow: (id: string, patch: Partial<WorkspaceWorkflowDraft>) => Promise<WorkspaceMutationResult<WorkspaceWorkflow>>;
    importFile: (sourcePath: string) => Promise<WorkspaceMutationResult<string>>;
  }>;
}>;
