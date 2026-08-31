import { contextBridge, ipcRenderer } from 'electron';

import type { AccountDraft } from '../shared/account-contract';
import type { BackupTrigger } from '../shared/backup-contract';
import type { Blueprint, CompleteOnboardingDraft, ShopMetadata } from '../shared/blueprint-contract';
import { IPC_CHANNELS, type MaxApi } from '../shared/ipc-contract';
import type { ConfigurableRecordDraft, ObjectKind, PropertyDraft } from '../shared/object-contract';
import type { ForgivenessDraft, RepaymentDraft } from '../shared/person-debt-contract';
import type { QuickEntryDraft } from '../shared/quick-entry-contract';
import type { CloseSessionDraft, OpenSessionDraft } from '../shared/reconciliation-contract';
import type { TemplateDraft } from '../shared/template-contract';
import type { TransactionDraft, TransferDraft } from '../shared/transaction-contract';
import type { CustomPageDraft, SavedViewDraft, ViewTargetKind } from '../shared/views-search-contract';

const maxApi: MaxApi = Object.freeze({
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
  quickEntry: Object.freeze({
    getSuggestion: (itemId?: string, templateId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.quickEntryGetSuggestion, itemId, templateId) as ReturnType<
        MaxApi['quickEntry']['getSuggestion']
      >,
    submit: (draft: QuickEntryDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.quickEntrySubmit, draft) as ReturnType<MaxApi['quickEntry']['submit']>,
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
});

contextBridge.exposeInMainWorld('maxApi', maxApi);
