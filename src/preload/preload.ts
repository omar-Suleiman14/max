import { contextBridge, ipcRenderer } from 'electron';

import type { AccountDraft } from '../shared/account-contract';
import type { BackupTrigger } from '../shared/backup-contract';
import type { Blueprint, CompleteOnboardingDraft, ShopMetadata } from '../shared/blueprint-contract';
import { IPC_CHANNELS, type MaxApi } from '../shared/ipc-contract';
import type { ConfigurableRecordDraft, ObjectKind, PropertyDraft } from '../shared/object-contract';
import type { ForgivenessDraft, RepaymentDraft } from '../shared/person-debt-contract';
import type { CloseSessionDraft, OpenSessionDraft } from '../shared/reconciliation-contract';
import type { TemplateDraft } from '../shared/template-contract';
import type { TransactionDraft, TransferDraft } from '../shared/transaction-contract';
import type { CustomPageDraft, SavedViewDraft, ViewTargetKind } from '../shared/views-search-contract';
import type { WorkspaceDatabaseDraft, WorkspaceDatabasePatch } from '../shared/database-contract';
import type {
  PropertyType as WorkspacePropertyType,
  TypeConversionStrategy,
  WorkspacePropertyDraft,
  WorkspacePropertyPatch,
  WorkspaceRecordDraft,
  WorkspaceRecordPatch,
} from '../shared/property-contract';
import type { DatabaseQueryParams } from '../shared/query-contract';
import type { WorkspaceRelationDraft } from '../shared/relation-contract';
import type { WorkspaceTemplateV2 } from '../shared/template-v2-contract';
import type { WorkspaceViewDraft, WorkspaceViewPatch } from '../shared/view-contract';
import type { WorkflowExecutionInput, WorkspaceWorkflowDraft } from '../shared/workflow-contract';
import type { WorkspaceNodeDraft, WorkspaceNodePatch } from '../shared/workspace-contract';

const maxApi: MaxApi = Object.freeze({
  updates: Object.freeze({
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updateStatus),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updateCheck),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updateInstall),
  }),
  accounts: Object.freeze({
    archive: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.accountArchive, id) as ReturnType<MaxApi['accounts']['archive']>,
    create: (draft: AccountDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.accountCreate, draft) as ReturnType<MaxApi['accounts']['create']>,
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.accountList) as ReturnType<MaxApi['accounts']['list']>,
    update: (id: string, draft: AccountDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.accountUpdate, id, draft) as ReturnType<MaxApi['accounts']['update']>,
  }),
  backups: Object.freeze({
    create: (trigger?: BackupTrigger) =>
      ipcRenderer.invoke(IPC_CHANNELS.backupCreate, trigger) as ReturnType<MaxApi['backups']['create']>,
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.backupList) as ReturnType<MaxApi['backups']['list']>,
    restore: (backupIdOrPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.backupRestore, backupIdOrPath) as ReturnType<MaxApi['backups']['restore']>,
    verify: (backupIdOrPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.backupVerify, backupIdOrPath) as ReturnType<MaxApi['backups']['verify']>,
  }),
  blueprints: Object.freeze({
    export: () => ipcRenderer.invoke(IPC_CHANNELS.blueprintExport) as ReturnType<MaxApi['blueprints']['export']>,
    import: (blueprint: Blueprint) =>
      ipcRenderer.invoke(IPC_CHANNELS.blueprintImport, blueprint) as ReturnType<MaxApi['blueprints']['import']>,
    validate: (blueprint: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.blueprintValidate, blueprint) as ReturnType<MaxApi['blueprints']['validate']>,
  }),
  cloudBackups: Object.freeze({
    create: (sessionToken: string, trigger?: BackupTrigger) =>
      ipcRenderer.invoke(IPC_CHANNELS.cloudBackupCreate, sessionToken, trigger) as ReturnType<MaxApi['cloudBackups']['create']>,
    getStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.cloudBackupStatus) as ReturnType<MaxApi['cloudBackups']['getStatus']>,
    list: (sessionToken: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.cloudBackupList, sessionToken) as ReturnType<MaxApi['cloudBackups']['list']>,
    restore: (sessionToken: string, backupId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.cloudBackupRestore, sessionToken, backupId) as ReturnType<MaxApi['cloudBackups']['restore']>,
    runScheduled: (sessionToken: string, schedule: 'daily' | 'manual' | 'weekly') =>
      ipcRenderer.invoke(IPC_CHANNELS.cloudBackupRunScheduled, sessionToken, schedule) as ReturnType<MaxApi['cloudBackups']['runScheduled']>,
  }),
  objects: Object.freeze({
    archiveProperty: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyArchive, id) as ReturnType<MaxApi['objects']['archiveProperty']>,
    archiveRecord: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordArchive, id) as ReturnType<MaxApi['objects']['archiveRecord']>,
    createProperty: (draft: PropertyDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyCreate, draft) as ReturnType<MaxApi['objects']['createProperty']>,
    createRecord: (draft: ConfigurableRecordDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordCreate, draft) as ReturnType<MaxApi['objects']['createRecord']>,
    listAudit: (entityId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectAuditList, entityId) as ReturnType<MaxApi['objects']['listAudit']>,
    listProperties: (objectKind: ObjectKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyList, objectKind) as ReturnType<MaxApi['objects']['listProperties']>,
    listRecords: (objectKind: ObjectKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordList, objectKind) as ReturnType<MaxApi['objects']['listRecords']>,
    reorderRecords: (objectKind: ObjectKind, orderedIds: readonly string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordReorder, objectKind, orderedIds) as ReturnType<MaxApi['objects']['reorderRecords']>,
    updateProperty: (id: string, draft: PropertyDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyUpdate, id, draft) as ReturnType<MaxApi['objects']['updateProperty']>,
    updateRecord: (id: string, draft: ConfigurableRecordDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordUpdate, id, draft) as ReturnType<MaxApi['objects']['updateRecord']>,
  }),
  people: Object.freeze({
    forgiveDebt: (draft: ForgivenessDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.peopleForgiveDebt, draft) as ReturnType<MaxApi['people']['forgiveDebt']>,
    getBalances: () =>
      ipcRenderer.invoke(IPC_CHANNELS.peopleBalances) as ReturnType<MaxApi['people']['getBalances']>,
    getStatement: (personId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.peopleStatement, personId) as ReturnType<MaxApi['people']['getStatement']>,
    repayDebt: (draft: RepaymentDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.peopleRepayDebt, draft) as ReturnType<MaxApi['people']['repayDebt']>,
  }),
  reconciliation: Object.freeze({
    closeSession: (draft: CloseSessionDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.reconciliationCloseSession, draft) as ReturnType<
        MaxApi['reconciliation']['closeSession']
      >,
    getCurrentSession: (accountId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.reconciliationCurrentSession, accountId) as ReturnType<
        MaxApi['reconciliation']['getCurrentSession']
      >,
    getExpectedClosing: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.reconciliationExpectedClosing, sessionId) as ReturnType<
        MaxApi['reconciliation']['getExpectedClosing']
      >,
    listSessions: (limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.reconciliationListSessions, limit) as ReturnType<
        MaxApi['reconciliation']['listSessions']
      >,
    openSession: (draft: OpenSessionDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.reconciliationOpenSession, draft) as ReturnType<
        MaxApi['reconciliation']['openSession']
      >,
  }),
  shop: Object.freeze({
    completeOnboarding: (draft: CompleteOnboardingDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.shopCompleteOnboarding, draft) as ReturnType<MaxApi['shop']['completeOnboarding']>,
    getMetadata: () =>
      ipcRenderer.invoke(IPC_CHANNELS.shopGetMetadata) as ReturnType<MaxApi['shop']['getMetadata']>,
    resetDemoData: (locale: 'ar' | 'en') =>
      ipcRenderer.invoke(IPC_CHANNELS.shopResetDemoData, locale) as ReturnType<MaxApi['shop']['resetDemoData']>,
    seedDemoData: (locale: 'ar' | 'en') =>
      ipcRenderer.invoke(IPC_CHANNELS.shopSeedDemoData, locale) as ReturnType<MaxApi['shop']['seedDemoData']>,
    updateMetadata: (patch: Partial<ShopMetadata>) =>
      ipcRenderer.invoke(IPC_CHANNELS.shopUpdateMetadata, patch) as ReturnType<MaxApi['shop']['updateMetadata']>,
  }),
  system: Object.freeze({
    getHealth: () =>
      ipcRenderer.invoke(IPC_CHANNELS.systemHealth) as Promise<Awaited<ReturnType<MaxApi['system']['getHealth']>>>,
    resetWorkspace: () =>
      ipcRenderer.invoke(IPC_CHANNELS.systemResetWorkspace) as ReturnType<MaxApi['system']['resetWorkspace']>,
  }),
  templates: Object.freeze({
    archive: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateArchive, id) as ReturnType<MaxApi['templates']['archive']>,
    create: (draft: TemplateDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateCreate, draft) as ReturnType<MaxApi['templates']['create']>,
    list: (objectKind: ObjectKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateList, objectKind) as ReturnType<MaxApi['templates']['list']>,
    update: (id: string, draft: TemplateDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateUpdate, id, draft) as ReturnType<MaxApi['templates']['update']>,
  }),
  transactions: Object.freeze({
    create: (draft: TransactionDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionCreate, draft) as ReturnType<MaxApi['transactions']['create']>,
    createTransfer: (draft: TransferDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionTransfer, draft) as ReturnType<MaxApi['transactions']['createTransfer']>,
    get: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionGet, id) as ReturnType<MaxApi['transactions']['get']>,
    getSummary: () =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionSummary) as ReturnType<MaxApi['transactions']['getSummary']>,
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionList) as ReturnType<MaxApi['transactions']['list']>,
    reverse: (id: string, reason?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionReverse, id, reason) as ReturnType<MaxApi['transactions']['reverse']>,
    undo: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.transactionUndo, id) as ReturnType<MaxApi['transactions']['undo']>,
  }),
  pages: Object.freeze({
    archive: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.pageArchive, id) as ReturnType<MaxApi['pages']['archive']>,
    create: (draft: CustomPageDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.pageCreate, draft) as ReturnType<MaxApi['pages']['create']>,
    emptyTrash: () =>
      ipcRenderer.invoke(IPC_CHANNELS.pageEmptyTrash) as ReturnType<MaxApi['pages']['emptyTrash']>,
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.pageList) as ReturnType<MaxApi['pages']['list']>,
    listArchived: () =>
      ipcRenderer.invoke(IPC_CHANNELS.pageListArchived) as ReturnType<MaxApi['pages']['listArchived']>,
    restore: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.pageRestore, id) as ReturnType<MaxApi['pages']['restore']>,
    update: (id: string, draft: CustomPageDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.pageUpdate, id, draft) as ReturnType<MaxApi['pages']['update']>,
  }),
  search: Object.freeze({
    query: (searchTerm: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.searchQuery, searchTerm) as ReturnType<MaxApi['search']['query']>,
  }),
  views: Object.freeze({
    archive: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.viewArchive, id) as ReturnType<MaxApi['views']['archive']>,
    create: (draft: SavedViewDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.viewCreate, draft) as ReturnType<MaxApi['views']['create']>,
    list: (targetKind?: ViewTargetKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.viewList, targetKind) as ReturnType<MaxApi['views']['list']>,
    update: (id: string, draft: SavedViewDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.viewUpdate, id, draft) as ReturnType<MaxApi['views']['update']>,
  }),
  workspace: Object.freeze({
    archiveDatabase: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveDatabase, id) as ReturnType<MaxApi['workspace']['archiveDatabase']>,
    archiveNode: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveNode, id) as ReturnType<MaxApi['workspace']['archiveNode']>,
    permanentlyDeleteNode: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.workspacePermanentlyDeleteNode, id) as ReturnType<MaxApi['workspace']['permanentlyDeleteNode']>,
    archiveProperty: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveProperty, id) as ReturnType<MaxApi['workspace']['archiveProperty']>,
    archiveRecord: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveRecord, id) as ReturnType<MaxApi['workspace']['archiveRecord']>,
    archiveRelation: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveRelation, id) as ReturnType<MaxApi['workspace']['archiveRelation']>,
    archiveView: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveView, id) as ReturnType<MaxApi['workspace']['archiveView']>,
    archiveWorkflow: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveWorkflow, id) as ReturnType<MaxApi['workspace']['archiveWorkflow']>,
    applyTypeConversion: (propertyId: string, targetType: WorkspacePropertyType, strategy?: TypeConversionStrategy) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceApplyTypeConversion, propertyId, targetType, strategy) as ReturnType<MaxApi['workspace']['applyTypeConversion']>,
    batchCreateRecords: (records: readonly WorkspaceRecordDraft[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceBatchCreateRecords, records) as ReturnType<MaxApi['workspace']['batchCreateRecords']>,
    createDatabase: (draft: WorkspaceDatabaseDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateDatabase, draft) as ReturnType<MaxApi['workspace']['createDatabase']>,
    createNode: (draft: WorkspaceNodeDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateNode, draft) as ReturnType<MaxApi['workspace']['createNode']>,
    createProperty: (draft: WorkspacePropertyDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateProperty, draft) as ReturnType<MaxApi['workspace']['createProperty']>,
    createRecord: (draft: WorkspaceRecordDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateRecord, draft) as ReturnType<MaxApi['workspace']['createRecord']>,
    createRelation: (draft: WorkspaceRelationDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateRelation, draft) as ReturnType<MaxApi['workspace']['createRelation']>,
    createView: (draft: WorkspaceViewDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateView, draft) as ReturnType<MaxApi['workspace']['createView']>,
    createWorkflow: (draft: WorkspaceWorkflowDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateWorkflow, draft) as ReturnType<MaxApi['workspace']['createWorkflow']>,
    duplicateDatabase: (id: string, options?: { includeRecords?: boolean; title?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceDuplicateDatabase, id, options) as ReturnType<MaxApi['workspace']['duplicateDatabase']>,
    evaluateWorkflow: (input: WorkflowExecutionInput) => ipcRenderer.invoke(IPC_CHANNELS.workspaceEvaluateWorkflow, input) as ReturnType<MaxApi['workspace']['evaluateWorkflow']>,
    executeWorkflow: (input: WorkflowExecutionInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceExecuteWorkflow, input) as ReturnType<MaxApi['workspace']['executeWorkflow']>,
    getDatabase: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetDatabase, id) as ReturnType<MaxApi['workspace']['getDatabase']>,
    getDatabaseSchema: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetDatabaseSchema, id) as ReturnType<MaxApi['workspace']['getDatabaseSchema']>,
    getNavigation: (includeArchived?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetNavigation, includeArchived) as ReturnType<MaxApi['workspace']['getNavigation']>,
    getNode: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetNode, id) as ReturnType<MaxApi['workspace']['getNode']>,
    getRecord: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetRecord, id) as ReturnType<MaxApi['workspace']['getRecord']>,
    saveRecordTemplate: (recordId: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceSaveRecordTemplate, recordId, name) as ReturnType<MaxApi['workspace']['saveRecordTemplate']>,
    editRecordTemplate: (databaseId: string, id: string | null, patch: Parameters<MaxApi['workspace']['editRecordTemplate']>[2]) => ipcRenderer.invoke(IPC_CHANNELS.workspaceEditRecordTemplate, databaseId, id, patch) as ReturnType<MaxApi['workspace']['editRecordTemplate']>,
    archiveRecordTemplate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceArchiveRecordTemplate, id) as ReturnType<MaxApi['workspace']['archiveRecordTemplate']>,
    getRelatedRecords: (recordId: string, relationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetRelatedRecords, recordId, relationId) as ReturnType<MaxApi['workspace']['getRelatedRecords']>,
    getView: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetView, id) as ReturnType<MaxApi['workspace']['getView']>,
    getWorkflow: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceGetWorkflow, id) as ReturnType<MaxApi['workspace']['getWorkflow']>,
    importTemplate: (template: WorkspaceTemplateV2) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceImportTemplate, template) as ReturnType<MaxApi['workspace']['importTemplate']>,
    validateTemplate: (template: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceValidateTemplate, template) as ReturnType<MaxApi['workspace']['validateTemplate']>,
    exportTemplate: () =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceExportTemplate) as ReturnType<MaxApi['workspace']['exportTemplate']>,
    getPageGraph: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetPageGraph) as ReturnType<MaxApi['workspace']['getPageGraph']>,
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpenExternal, url) as ReturnType<MaxApi['workspace']['openExternal']>,
    linkRecords: (relationId: string, sourceRecordId: string, targetRecordId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceLinkRecords, relationId, sourceRecordId, targetRecordId) as ReturnType<MaxApi['workspace']['linkRecords']>,
    listProperties: (databaseId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceListProperties, databaseId) as ReturnType<MaxApi['workspace']['listProperties']>,
    listRecordTemplates: (databaseId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceListRecordTemplates, databaseId) as ReturnType<MaxApi['workspace']['listRecordTemplates']>,
    listRelations: (databaseId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceListRelations, databaseId) as ReturnType<MaxApi['workspace']['listRelations']>,
    listViews: (ownerId: string, ownerType?: 'database' | 'block') =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceListViews, ownerId, ownerType) as ReturnType<MaxApi['workspace']['listViews']>,
    listWorkflows: () =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceListWorkflows) as ReturnType<MaxApi['workspace']['listWorkflows']>,
    migrateV01: (locale?: 'ar' | 'en') =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceMigrateV01, locale) as ReturnType<MaxApi['workspace']['migrateV01']>,
    previewTypeConversion: (propertyId: string, targetType: WorkspacePropertyType) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspacePreviewTypeConversion, propertyId, targetType) as ReturnType<MaxApi['workspace']['previewTypeConversion']>,
    queryDatabase: (params: DatabaseQueryParams) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceQueryDatabase, params) as ReturnType<MaxApi['workspace']['queryDatabase']>,
    reorderNode: (id: string, targetPositionKey: string, newParentId?: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceReorderNode, id, targetPositionKey, newParentId) as ReturnType<MaxApi['workspace']['reorderNode']>,
    restoreNode: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceRestoreNode, id) as ReturnType<MaxApi['workspace']['restoreNode']>,
    searchRelationTargets: (relationId: string, query: string, limit?: number, fromRecordId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceSearchRelationTargets, relationId, query, limit, fromRecordId) as ReturnType<MaxApi['workspace']['searchRelationTargets']>,
    searchWorkspace: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceSearch, query, limit) as ReturnType<MaxApi['workspace']['searchWorkspace']>,
    unlinkRecords: (relationId: string, sourceRecordId: string, targetRecordId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUnlinkRecords, relationId, sourceRecordId, targetRecordId) as ReturnType<MaxApi['workspace']['unlinkRecords']>,
    updateDatabase: (id: string, patch: WorkspaceDatabasePatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdateDatabase, id, patch) as ReturnType<MaxApi['workspace']['updateDatabase']>,
    updateNode: (id: string, patch: WorkspaceNodePatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdateNode, id, patch) as ReturnType<MaxApi['workspace']['updateNode']>,
    updateProperty: (id: string, patch: WorkspacePropertyPatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdateProperty, id, patch) as ReturnType<MaxApi['workspace']['updateProperty']>,
    updateRecord: (id: string, patch: WorkspaceRecordPatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdateRecord, id, patch) as ReturnType<MaxApi['workspace']['updateRecord']>,
    updateView: (id: string, patch: WorkspaceViewPatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdateView, id, patch) as ReturnType<MaxApi['workspace']['updateView']>,
    updateWorkflow: (id: string, patch: Partial<WorkspaceWorkflowDraft>) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceUpdateWorkflow, id, patch) as ReturnType<MaxApi['workspace']['updateWorkflow']>,
    importFile: (sourcePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceImportFile, sourcePath) as ReturnType<MaxApi['workspace']['importFile']>,
  }),
});

contextBridge.exposeInMainWorld('maxApi', maxApi);
