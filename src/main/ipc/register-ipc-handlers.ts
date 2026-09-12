import type { UpdateService } from '../platform/windows/update-service';
import { TERMS_VERSION } from '../../shared/terms';
import { app, ipcMain, shell } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeWebUrl } from '../../shared/page-links';

import {
  accountTypes,
  type AccountDraft,
  type AccountType,
} from '../../shared/account-contract';
import type {
  Blueprint,
  CompleteOnboardingDraft,
  ShopMetadata,
} from '../../shared/blueprint-contract';
import type { BackupTrigger } from '../../shared/backup-contract';
import { IPC_CHANNELS, type SystemHealth } from '../../shared/ipc-contract';
import {
  objectKinds,
  propertyTypes,
  semanticRoles,
  type ConfigurableRecordDraft,
  type MutationResult,
  type ObjectKind,
  type PropertyDraft,
  type PropertyValue,
  type SemanticRole,
} from '../../shared/object-contract';
import type {
  ForgivenessDraft,
  RepaymentDraft,
} from '../../shared/person-debt-contract';
import type {
  CloseSessionDraft,
  OpenSessionDraft,
} from '../../shared/reconciliation-contract';
import type { TemplateDraft } from '../../shared/template-contract';
import type {
  CustomPageDraft,
  SavedViewDraft,
  ViewFilterRule,
  ViewSortRule,
  ViewTargetKind,
} from '../../shared/views-search-contract';
import {
  movementTypes,
  transactionTypes,
  type MoneyMovementDraft,
  type MovementType,
  type TransactionDraft,
  type TransactionType,
  type TransferDraft,
} from '../../shared/transaction-contract';
import type { DatabaseService } from '../database/database-service';
import { AssetError, type AssetStore } from '../assets/asset-store';
import { PhotoLibraryError, type PhotoLibrary } from '../assets/photo-library';
import type { CloudBackupService } from '../cloud/cloud-backup-service';
import { ObjectDomainError } from '../database/object-repository';
import { WorkspaceDomainError, type MutationResult as WorkspaceMutationResult } from '../../shared/workspace-contract';
import type { PlatformAdapter } from '../platform/platform-adapter';
import { assertTrustedSender } from '../security/trusted-sender';
import {
  parseDatabaseQueryParams,
  parseDuplicateDatabaseOptions,
  parsePropertyType as parseWorkspacePropertyType,
  parseTypeConversionStrategy,
  parseWorkflowExecutionInput,
  parseWorkspaceDatabaseDraft,
  parseWorkspaceDatabasePatch,
  parseWorkspaceNodeDraft,
  parseWorkspaceNodePatch,
  parseWorkspacePropertyDraft,
  parseWorkspacePropertyPatch,
  parseWorkspaceRecordDraft,
  parseWorkspaceRecordDrafts,
  parseWorkspaceRecordPatch,
  parseWorkspaceRelationDraft,
  parseWorkspaceTemplateV2,
  parseWorkspaceViewDraft,
  parseWorkspaceViewPatch,
  parseWorkspaceWorkflowDraft,
  parseWorkspaceWorkflowPatch,
} from './workspace-input-parsers';

type RegisterIpcHandlersOptions = Readonly<{
  updates?: UpdateService;
  /** Absent in test harnesses that do not exercise image storage. */
  assets?: AssetStore;
  cloudBackups: CloudBackupService;
  database: DatabaseService;
  developmentServerUrl?: string;
  photos?: PhotoLibrary;
  platform: PlatformAdapter;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120) {
    throw new ObjectDomainError('invalid-input', 'A valid identifier is required.');
  }
  return value;
}

function parseSessionToken(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 16_384) {
    throw new ObjectDomainError('invalid-input', 'A valid signed-in session is required.');
  }
  return value;
}

function parseObjectKind(value: unknown): ObjectKind {
  if (typeof value !== 'string' || !objectKinds.includes(value as ObjectKind)) {
    throw new ObjectDomainError('invalid-input', 'Object kind must be item or person.');
  }
  return value as ObjectKind;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ObjectDomainError('invalid-input', `${field} must be a finite number.`);
  }
  return value;
}

function optionalLength(value: unknown, field: string): number | undefined {
  const number = optionalNumber(value, field);
  if (number !== undefined && !Number.isInteger(number)) {
    throw new ObjectDomainError('invalid-input', `${field} must be a whole number.`);
  }
  return number;
}

function parsePropertyDraft(value: unknown): PropertyDraft {
  if (!isObject(value) || !isObject(value.rules)) {
    throw new ObjectDomainError('invalid-input', 'A valid property definition is required.');
  }
  const rules = value.rules;
  if (
    typeof value.name !== 'string' ||
    typeof value.type !== 'string' ||
    !propertyTypes.includes(value.type as PropertyDraft['type']) ||
    typeof rules.required !== 'boolean' ||
    typeof rules.unique !== 'boolean' ||
    typeof rules.digitsOnly !== 'boolean' ||
    !Array.isArray(rules.choices) ||
    !rules.choices.every((choice) => typeof choice === 'string')
  ) {
    throw new ObjectDomainError('invalid-input', 'The property definition contains invalid fields.');
  }

  return {
    name: value.name,
    objectKind: parseObjectKind(value.objectKind),
    rules: {
      choices: rules.choices,
      digitsOnly: rules.digitsOnly,
      exactDigits: optionalLength(rules.exactDigits, 'Number of digits'),
      maximum: optionalNumber(rules.maximum, 'Maximum'),
      maximumLength: optionalLength(rules.maximumLength, 'Maximum length'),
      minimum: optionalNumber(rules.minimum, 'Minimum'),
      minimumLength: optionalLength(rules.minimumLength, 'Minimum length'),
      relationTarget: rules.relationTarget === undefined ? undefined : parseObjectKind(rules.relationTarget),
      required: rules.required,
      unique: rules.unique,
    },
    semanticRole: typeof value.semanticRole === 'string' && semanticRoles.includes(value.semanticRole as SemanticRole)
      ? value.semanticRole as SemanticRole
      : undefined,
    type: value.type as PropertyDraft['type'],
  };
}

function parseRecordDraft(value: unknown): ConfigurableRecordDraft {
  if (!isObject(value) || typeof value.label !== 'string' || !isObject(value.values)) {
    throw new ObjectDomainError('invalid-input', 'A valid record is required.');
  }
  const values: Record<string, PropertyValue> = {};
  for (const [propertyId, propertyValue] of Object.entries(value.values)) {
    if (
      propertyId.length < 1 ||
      propertyId.length > 120 ||
      !['boolean', 'number', 'string'].includes(typeof propertyValue) ||
      (typeof propertyValue === 'number' && !Number.isFinite(propertyValue))
    ) {
      throw new ObjectDomainError('invalid-input', 'The record contains an invalid property value.');
    }
    values[propertyId] = propertyValue as PropertyValue;
  }
  if (value.templateId !== undefined && (typeof value.templateId !== 'string' || value.templateId.length < 1 || value.templateId.length > 120)) {
    throw new ObjectDomainError('invalid-input', 'The record contains an invalid template identifier.');
  }
  return { label: value.label, objectKind: parseObjectKind(value.objectKind), templateId: value.templateId, values };
}

function parseTemplateDraft(value: unknown): TemplateDraft {
  if (!isObject(value) || typeof value.name !== 'string' || !isObject(value.defaults)) {
    throw new ObjectDomainError('invalid-input', 'A valid template is required.');
  }
  if (!Array.isArray(value.fieldOrder) || !value.fieldOrder.every((f) => typeof f === 'string')) {
    throw new ObjectDomainError('invalid-input', 'Field order must be an array of property identifiers.');
  }
  if (!Array.isArray(value.progressive) || !value.progressive.every((f) => typeof f === 'string')) {
    throw new ObjectDomainError('invalid-input', 'Progressive fields must be an array of property identifiers.');
  }

  const defaults: Record<string, PropertyValue> = {};
  for (const [key, val] of Object.entries(value.defaults)) {
    if (['boolean', 'number', 'string'].includes(typeof val)) {
      defaults[key] = val as PropertyValue;
    }
  }

  return {
    defaults,
    fieldOrder: value.fieldOrder,
    name: value.name,
    objectKind: parseObjectKind(value.objectKind),
    progressive: value.progressive,
  };
}

function parseCompleteOnboardingDraft(value: unknown): CompleteOnboardingDraft {
  if (!isObject(value) || typeof value.shopName !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid shop name is required.');
  }
  if (value.locale !== 'ar' && value.locale !== 'en') {
    throw new ObjectDomainError('invalid-input', 'A valid locale (ar or en) is required.');
  }
  if (!['daily', 'weekly', 'manual'].includes(String(value.backupSchedule))) {
    throw new ObjectDomainError('invalid-input', 'A valid backup schedule is required.');
  }

  if (value.acceptedTermsVersion !== TERMS_VERSION) throw new ObjectDomainError('invalid-input', 'Please accept the current Terms & Conditions.');
  return {
    acceptedTermsVersion: TERMS_VERSION,
    backupSchedule: value.backupSchedule as CompleteOnboardingDraft['backupSchedule'],
    blueprint: isObject(value.blueprint) && value.blueprint.version === 2
      ? parseWorkspaceTemplateV2(value.blueprint)
      : value.blueprint as Blueprint | undefined,
    includeDemoData: value.includeDemoData === true,
    locale: value.locale,
    shopName: value.shopName,
    templateId: value.templateId === 'blank' || value.templateId === 'custom' || value.templateId === 'phone-shop' ? value.templateId : undefined,
  };
}

function parseAccountDraft(value: unknown): AccountDraft {
  if (!isObject(value) || typeof value.name !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid account name is required.');
  }
  if (!accountTypes.includes(value.accountType as AccountType)) {
    throw new ObjectDomainError('invalid-input', 'A valid account type is required.');
  }
  const initialBalance = Number(value.initialBalance ?? 0);
  if (!Number.isFinite(initialBalance) || initialBalance < 0) {
    throw new ObjectDomainError('invalid-input', 'Initial balance must be a non-negative number.');
  }

  return {
    accountType: value.accountType as AccountType,
    feeConfig: isObject(value.feeConfig) ? value.feeConfig as AccountDraft['feeConfig'] : undefined,
    initialBalance,
    name: value.name,
    providerId: typeof value.providerId === 'string' ? value.providerId : undefined,
  };
}

function parseTransactionDraft(value: unknown): TransactionDraft {
  if (!isObject(value)) {
    throw new ObjectDomainError('invalid-input', 'A valid transaction draft is required.');
  }
  if (!transactionTypes.includes(value.transactionType as TransactionType)) {
    throw new ObjectDomainError('invalid-input', 'A valid transaction type is required.');
  }
  const totalAmount = Number(value.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new ObjectDomainError('invalid-input', 'Total amount must be a non-negative number.');
  }
  const paidAmount = Number(value.paidAmount ?? 0);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new ObjectDomainError('invalid-input', 'Paid amount must be a non-negative number.');
  }

  const movements: MoneyMovementDraft[] = [];
  if (Array.isArray(value.movements)) {
    for (const m of value.movements) {
      if (!isObject(m) || typeof m.accountId !== 'string' || !movementTypes.includes(m.movementType as MovementType)) {
        throw new ObjectDomainError('invalid-input', 'Invalid money movement.');
      }
      const amount = Number(m.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ObjectDomainError('invalid-input', 'Movement amount must be greater than zero.');
      }
      movements.push({
        accountId: m.accountId,
        amount,
        movementType: m.movementType as MovementType,
      });
    }
  }

  return {
    itemId: typeof value.itemId === 'string' ? value.itemId : undefined,
    movements,
    note: typeof value.note === 'string' ? value.note : undefined,
    paidAmount,
    personId: typeof value.personId === 'string' ? value.personId : undefined,
    providerFee: typeof value.providerFee === 'number' ? value.providerFee : undefined,
    quantity: typeof value.quantity === 'number' ? value.quantity : undefined,
    serviceFee: typeof value.serviceFee === 'number' ? value.serviceFee : undefined,
    totalAmount,
    transactionType: value.transactionType as TransactionType,
  };
}

function parseTransferDraft(value: unknown): TransferDraft {
  if (!isObject(value) || typeof value.fromAccountId !== 'string' || typeof value.toAccountId !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid transfer draft is required.');
  }
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ObjectDomainError('invalid-input', 'Transfer amount must be greater than zero.');
  }

  return {
    amount,
    fromAccountId: value.fromAccountId,
    note: typeof value.note === 'string' ? value.note : undefined,
    providerFee: typeof value.providerFee === 'number' ? value.providerFee : undefined,
    serviceFee: typeof value.serviceFee === 'number' ? value.serviceFee : undefined,
    toAccountId: value.toAccountId,
  };
}

function parseRepaymentDraft(value: unknown): RepaymentDraft {
  if (!isObject(value) || typeof value.personId !== 'string' || typeof value.accountId !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid repayment draft is required.');
  }
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ObjectDomainError('invalid-input', 'Repayment amount must be greater than zero.');
  }
  return {
    accountId: value.accountId,
    amount,
    note: typeof value.note === 'string' ? value.note : undefined,
    personId: value.personId,
  };
}

function parseForgivenessDraft(value: unknown): ForgivenessDraft {
  if (!isObject(value) || typeof value.personId !== 'string' || typeof value.reason !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid forgiveness draft is required.');
  }
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ObjectDomainError('invalid-input', 'Forgiveness amount must be greater than zero.');
  }
  return {
    amount,
    personId: value.personId,
    reason: value.reason,
  };
}

function parseSavedViewDraft(value: unknown): SavedViewDraft {
  if (!isObject(value) || typeof value.name !== 'string' || !value.name.trim()) {
    throw new ObjectDomainError('invalid-input', 'Saved view name is required.');
  }
  if (!['item', 'person', 'transaction', 'account'].includes(String(value.targetKind))) {
    throw new ObjectDomainError('invalid-input', 'Valid target kind is required.');
  }
  return {
    filterRules: Array.isArray(value.filterRules) ? (value.filterRules as readonly ViewFilterRule[]) : undefined,
    groupByPropertyId: typeof value.groupByPropertyId === 'string' ? value.groupByPropertyId : undefined,
    name: value.name.trim(),
    position: typeof value.position === 'number' ? value.position : undefined,
    sortRules: Array.isArray(value.sortRules) ? (value.sortRules as readonly ViewSortRule[]) : undefined,
    targetKind: value.targetKind as ViewTargetKind,
  };
}

function parseCustomPageDraft(value: unknown): CustomPageDraft {
  if (!isObject(value) || typeof value.name !== 'string' || !value.name.trim()) {
    throw new ObjectDomainError('invalid-input', 'Custom page name is required.');
  }
  if (typeof value.layoutJson !== 'string') {
    throw new ObjectDomainError('invalid-input', 'Custom page layout JSON is required.');
  }
  return {
    icon: typeof value.icon === 'string' ? value.icon : undefined,
    layoutJson: value.layoutJson,
    name: value.name.trim(),
    position: typeof value.position === 'number' ? value.position : undefined,
  };
}

function parseOpenSessionDraft(value: unknown): OpenSessionDraft {
  if (!isObject(value) || typeof value.accountId !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid account identifier is required to open a register session.');
  }
  const openingBalance = Number(value.openingBalance);
  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    throw new ObjectDomainError('invalid-input', 'Opening balance must be zero or positive.');
  }
  return {
    accountId: value.accountId,
    openingBalance,
  };
}

function parseCloseSessionDraft(value: unknown): CloseSessionDraft {
  if (!isObject(value) || typeof value.sessionId !== 'string') {
    throw new ObjectDomainError('invalid-input', 'A valid session identifier is required.');
  }
  const actualClosingBalance = Number(value.actualClosingBalance);
  if (!Number.isFinite(actualClosingBalance) || actualClosingBalance < 0) {
    throw new ObjectDomainError('invalid-input', 'Counted actual closing balance must be zero or positive.');
  }
  return {
    actualClosingBalance,
    discrepancyNote: typeof value.discrepancyNote === 'string' ? value.discrepancyNote : undefined,
    sessionId: value.sessionId,
  };
}

function mutation<T>(work: () => T): MutationResult<T> {
  try {
    return { ok: true, value: work() };
  } catch (error) {
    if (error instanceof ObjectDomainError) {
      return {
        error: { code: error.code, message: error.message, propertyId: error.propertyId },
        ok: false,
      };
    }
    throw error;
  }
}

function workspaceMutationResult<T>(work: () => T): WorkspaceMutationResult<T> {
  try {
    return { ok: true, value: work() };
  } catch (error) {
    if (error instanceof WorkspaceDomainError) {
      return {
        error: { code: error.code, entityId: error.entityId, message: error.message },
        ok: false,
      };
    }
    if (error instanceof ObjectDomainError) {
      return {
        error: {
          code: error.code === 'not-found' ? 'not-found' : 'workflow-failed',
          message: error.message,
        },
        ok: false,
      };
    }
    throw error;
  }
}

async function asyncMutation<T>(work: () => Promise<T>): Promise<MutationResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof ObjectDomainError) {
      return { error: { code: error.code, message: error.message, propertyId: error.propertyId }, ok: false };
    }
    return { error: { code: 'invalid-input', message: error instanceof Error ? error.message : 'Cloud backup failed.' }, ok: false };
  }
}

export function registerIpcHandlers({
  updates,
  assets,
  cloudBackups,
  database,
  developmentServerUrl,
  photos,
  platform,
}: RegisterIpcHandlersOptions): void {
  function trust(event: Electron.IpcMainInvokeEvent): void {
    const senderUrl = event.senderFrame?.url;
    if (!senderUrl) {
      throw new Error('Rejected IPC request without a sender frame.');
    }
    assertTrustedSender(senderUrl, developmentServerUrl);
  }

  for (const [channel, method] of [[IPC_CHANNELS.updateStatus, 'getStatus'], [IPC_CHANNELS.updateCheck, 'check'], [IPC_CHANNELS.updateInstall, 'install']] as const) {
    ipcMain.handle(channel, (event) => { trust(event); return updates?.[method]() ?? { state: 'unsupported', currentVersion: app.getVersion() }; });
  }
  ipcMain.handle(IPC_CHANNELS.systemHealth, (event): SystemHealth => {
    trust(event);

    return {
      appVersion: app.getVersion(),
      database: database.getHealth(),
      runtime: platform,
    };
  });

  // Object Properties
  ipcMain.handle(IPC_CHANNELS.objectPropertyList, (event, objectKind: unknown) => {
    trust(event);
    return database.objects.listProperties(parseObjectKind(objectKind));
  });
  ipcMain.handle(IPC_CHANNELS.objectPropertyCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.objects.createProperty(parsePropertyDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.objectPropertyUpdate, (event, id: unknown, draft: unknown) => {
    trust(event);
    return mutation(() => database.objects.updateProperty(parseId(id), parsePropertyDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.objectPropertyArchive, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.objects.archiveProperty(parseId(id));
      return null;
    });
  });

  // Object Records
  ipcMain.handle(IPC_CHANNELS.objectRecordList, (event, objectKind: unknown) => {
    trust(event);
    return database.objects.listRecords(parseObjectKind(objectKind));
  });
  ipcMain.handle(IPC_CHANNELS.objectRecordCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.objects.createRecord(parseRecordDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.objectRecordUpdate, (event, id: unknown, draft: unknown) => {
    trust(event);
    return mutation(() => database.objects.updateRecord(parseId(id), parseRecordDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.objectRecordReorder, (event, objectKind: unknown, orderedIds: unknown) => {
    trust(event);
    return mutation(() => {
      if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
        throw new ObjectDomainError('invalid-input', 'A valid record order is required.');
      }
      database.objects.reorderRecords(parseObjectKind(objectKind), orderedIds);
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.objectRecordArchive, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.objects.archiveRecord(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.objectAuditList, (event, entityId: unknown) => {
    trust(event);
    return database.objects.listAudit(parseId(entityId));
  });

  // Templates
  ipcMain.handle(IPC_CHANNELS.templateList, (event, objectKind: unknown) => {
    trust(event);
    return database.templates.listTemplates(parseObjectKind(objectKind));
  });
  ipcMain.handle(IPC_CHANNELS.templateCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.templates.createTemplate(parseTemplateDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.templateUpdate, (event, id: unknown, draft: unknown) => {
    trust(event);
    return mutation(() => database.templates.updateTemplate(parseId(id), parseTemplateDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.templateArchive, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.templates.archiveTemplate(parseId(id));
      return null;
    });
  });

  // Blueprints
  ipcMain.handle(IPC_CHANNELS.blueprintExport, (event) => {
    trust(event);
    return database.blueprints.exportBlueprint();
  });
  ipcMain.handle(IPC_CHANNELS.blueprintValidate, (event, blueprint: unknown) => {
    trust(event);
    return database.blueprints.validateBlueprint(blueprint);
  });
  ipcMain.handle(IPC_CHANNELS.blueprintImport, (event, blueprint: unknown) => {
    trust(event);
    return mutation(() => database.blueprints.importBlueprint(blueprint as Blueprint));
  });

  // Shop Metadata
  ipcMain.handle(IPC_CHANNELS.shopGetMetadata, (event) => {
    trust(event);
    return database.shopMetadata.getMetadata();
  });
  ipcMain.handle(IPC_CHANNELS.shopSeedDemoData, (event, locale: unknown) => {
    trust(event);
    if (locale !== 'ar' && locale !== 'en') {
      throw new ObjectDomainError('invalid-input', 'A valid locale (ar or en) is required.');
    }
    return mutation(() => database.seedDemoData(locale));
  });
  ipcMain.handle(IPC_CHANNELS.shopResetDemoData, (event, locale: unknown) => {
    trust(event);
    if (locale !== 'ar' && locale !== 'en') {
      throw new ObjectDomainError('invalid-input', 'A valid locale (ar or en) is required.');
    }
    return mutation(() => database.resetDemoWorkspace(locale));
  });
  ipcMain.handle(IPC_CHANNELS.shopUpdateMetadata, (event, patch: unknown) => {
    trust(event);
    return mutation(() => database.shopMetadata.updateMetadata(patch as Partial<ShopMetadata>));
  });
  ipcMain.handle(IPC_CHANNELS.shopCompleteOnboarding, (event, draft: unknown) => {
    trust(event);
    return mutation(() => {
      const parsed = parseCompleteOnboardingDraft(draft);
      return database.completeOnboarding(parsed);
    });
  });

  // Accounts
  ipcMain.handle(IPC_CHANNELS.accountList, (event) => {
    trust(event);
    return database.accounts.listAccounts();
  });
  ipcMain.handle(IPC_CHANNELS.accountCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.accounts.createAccount(parseAccountDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.accountUpdate, (event, id: unknown, draft: unknown) => {
    trust(event);
    return mutation(() => database.accounts.updateAccount(parseId(id), parseAccountDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.accountArchive, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.accounts.archiveAccount(parseId(id));
      return null;
    });
  });

  // Transactions
  ipcMain.handle(IPC_CHANNELS.transactionList, (event) => {
    trust(event);
    return database.transactions.listTransactions();
  });
  ipcMain.handle(IPC_CHANNELS.transactionGet, (event, id: unknown) => {
    trust(event);
    return database.transactions.getTransaction(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.transactionCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.transactions.createTransaction(parseTransactionDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.transactionTransfer, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.transactions.createTransfer(parseTransferDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.transactionReverse, (event, id: unknown, reason: unknown) => {
    trust(event);
    return mutation(() =>
      database.transactions.reverseTransaction(parseId(id), typeof reason === 'string' ? reason : undefined),
    );
  });
  ipcMain.handle(IPC_CHANNELS.transactionUndo, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.transactions.undoTransaction(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.transactionSummary, (event) => {
    trust(event);
    return database.transactions.getLedgerSummary();
  });

  // People Debt
  ipcMain.handle(IPC_CHANNELS.peopleBalances, (event) => {
    trust(event);
    return database.personDebt.getBalances();
  });
  ipcMain.handle(IPC_CHANNELS.peopleStatement, (event, personId: unknown) => {
    trust(event);
    return database.personDebt.getStatement(parseId(personId));
  });
  ipcMain.handle(IPC_CHANNELS.peopleRepayDebt, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.personDebt.repayDebt(parseRepaymentDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.peopleForgiveDebt, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.personDebt.forgiveDebt(parseForgivenessDraft(draft)));
  });

  // Saved Views
  ipcMain.handle(IPC_CHANNELS.viewList, (event, targetKind: unknown) => {
    trust(event);
    return database.viewsPages.listViews(typeof targetKind === 'string' ? (targetKind as ViewTargetKind) : undefined);
  });
  ipcMain.handle(IPC_CHANNELS.viewCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.viewsPages.createView(parseSavedViewDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.viewUpdate, (event, id: unknown, draft: unknown) => {
    trust(event);
    return mutation(() => database.viewsPages.updateView(parseId(id), parseSavedViewDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.viewArchive, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.viewsPages.archiveView(parseId(id));
      return null;
    });
  });

  // Custom Pages
  ipcMain.handle(IPC_CHANNELS.pageList, (event) => {
    trust(event);
    return database.viewsPages.listPages();
  });
  ipcMain.handle(IPC_CHANNELS.pageListArchived, (event) => {
    trust(event);
    return database.viewsPages.listArchivedPages();
  });
  ipcMain.handle(IPC_CHANNELS.pageCreate, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.viewsPages.createPage(parseCustomPageDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.pageUpdate, (event, id: unknown, draft: unknown) => {
    trust(event);
    return mutation(() => database.viewsPages.updatePage(parseId(id), parseCustomPageDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.pageArchive, (event, id: unknown) => {
    trust(event);
    return mutation(() => {
      database.viewsPages.archivePage(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.pageRestore, (event, id: unknown) => {
    trust(event);
    return mutation(() => database.viewsPages.restorePage(parseId(id)));
  });
  ipcMain.handle(IPC_CHANNELS.pageEmptyTrash, (event) => {
    trust(event);
    return mutation(() => {
      database.viewsPages.emptyPageTrash();
      return null;
    });
  });

  // Universal Search
  ipcMain.handle(IPC_CHANNELS.searchQuery, (event, searchTerm: unknown) => {
    trust(event);
    return database.search.query(typeof searchTerm === 'string' ? searchTerm : '');
  });

  // Local image store and photo library
  async function storing<T>(work: () => Promise<T>): Promise<MutationResult<T>> {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      if (error instanceof AssetError || error instanceof PhotoLibraryError) {
        return { ok: false, error: { code: 'invalid-input', message: error.message } };
      }
      return { ok: false, error: { code: 'invalid-input', message: 'Could not save the image.' } };
    }
  }
  function requireAssets(): AssetStore {
    if (!assets) throw new AssetError('Image storage is unavailable in this session.');
    return assets;
  }
  function requirePhotos(): PhotoLibrary {
    if (!photos) throw new PhotoLibraryError('unconfigured');
    return photos;
  }

  ipcMain.handle(IPC_CHANNELS.assetsImport, (event, bytes: unknown) => {
    trust(event);
    return storing(async () => {
      // Structured clone delivers the renderer's ArrayBuffer as one of these.
      const data = bytes instanceof Uint8Array ? bytes
        : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
          : undefined;
      if (!data) throw new AssetError('No image was supplied.');
      return requireAssets().store(data);
    });
  });
  ipcMain.handle(IPC_CHANNELS.assetsDownload, (event, url: unknown) => {
    trust(event);
    return storing(() => requireAssets().download(typeof url === 'string' ? url : ''));
  });
  ipcMain.handle(IPC_CHANNELS.assetsUsage, (event) => {
    trust(event);
    return assets?.usage() ?? { byteLength: 0, count: 0 };
  });
  ipcMain.handle(IPC_CHANNELS.photosGetAccessKey, async (event) => {
    trust(event);
    return { configured: Boolean(await photos?.accessKey()) };
  });
  ipcMain.handle(IPC_CHANNELS.photosSetAccessKey, (event, key: unknown) => {
    trust(event);
    return storing(async () => {
      if (typeof key !== 'string') throw new PhotoLibraryError('That is not an access key.');
      const library = requirePhotos();
      await library.saveAccessKey(key);
      return { configured: Boolean(await library.accessKey()) };
    });
  });
  ipcMain.handle(IPC_CHANNELS.photosSearch, (event, query: unknown, page: unknown) => {
    trust(event);
    return storing(() => requirePhotos().search(
      typeof query === 'string' ? query : '',
      typeof page === 'number' ? page : 1,
    ));
  });
  ipcMain.handle(IPC_CHANNELS.photosUse, (event, photo: unknown) => {
    trust(event);
    return storing(async () => {
      if (!isObject(photo) || typeof photo.fullUrl !== 'string') throw new AssetError('No photo was chosen.');
      const stored = await requireAssets().download(photo.fullUrl);
      // Reported after the file is safely stored, and never allowed to fail the
      // choice: the credit matters to the photographer, not to this workspace.
      if (typeof photo.downloadUrl === 'string') await photos?.reportDownload(photo.downloadUrl);
      return stored;
    });
  });

  // Daily Reconciliation
  ipcMain.handle(IPC_CHANNELS.reconciliationCurrentSession, (event, accountId: unknown) => {
    trust(event);
    return database.reconciliation.getCurrentSession(typeof accountId === 'string' ? accountId : undefined);
  });
  ipcMain.handle(IPC_CHANNELS.reconciliationOpenSession, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.reconciliation.openSession(parseOpenSessionDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.reconciliationExpectedClosing, (event, sessionId: unknown) => {
    trust(event);
    return database.reconciliation.getExpectedClosing(parseId(sessionId));
  });
  ipcMain.handle(IPC_CHANNELS.reconciliationCloseSession, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.reconciliation.closeSession(parseCloseSessionDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.reconciliationListSessions, (event, limit: unknown) => {
    trust(event);
    return database.reconciliation.listSessions(typeof limit === 'number' ? limit : undefined);
  });

  // Local Backup & Recovery
  ipcMain.handle(IPC_CHANNELS.backupCreate, (event, trigger: unknown) => {
    trust(event);
    return mutation(() =>
      database.backups.createBackup(
        typeof trigger === 'string' && ['daily', 'manual', 'pre-delete', 'pre-migration', 'pre-restore', 'weekly'].includes(trigger)
          ? (trigger as BackupTrigger)
          : 'manual',
      ),
    );
  });
  ipcMain.handle(IPC_CHANNELS.backupList, (event) => {
    trust(event);
    return database.backups.listBackups();
  });
  ipcMain.handle(IPC_CHANNELS.backupVerify, (event, backupIdOrPath: unknown) => {
    trust(event);
    return database.backups.verifyBackup(parseId(backupIdOrPath));
  });
  ipcMain.handle(IPC_CHANNELS.backupRestore, (event, backupIdOrPath: unknown) => {
    trust(event);
    return mutation(() => database.backups.restoreBackup(parseId(backupIdOrPath)));
  });
  ipcMain.handle(IPC_CHANNELS.cloudBackupStatus, (event) => {
    trust(event);
    return cloudBackups.getStatus();
  });
  ipcMain.handle(IPC_CHANNELS.cloudBackupCreate, (event, sessionToken: unknown, trigger: unknown) => {
    trust(event);
    const parsedTrigger = typeof trigger === 'string' && ['daily', 'manual', 'pre-delete', 'pre-migration', 'pre-restore', 'weekly'].includes(trigger)
      ? trigger as BackupTrigger : 'manual';
    return asyncMutation(() => cloudBackups.create(parseSessionToken(sessionToken), parsedTrigger));
  });
  ipcMain.handle(IPC_CHANNELS.cloudBackupList, (event, sessionToken: unknown) => {
    trust(event);
    return asyncMutation(() => cloudBackups.list(parseSessionToken(sessionToken)));
  });
  ipcMain.handle(IPC_CHANNELS.cloudBackupRestore, (event, sessionToken: unknown, backupId: unknown) => {
    trust(event);
    return asyncMutation(() => cloudBackups.restore(parseSessionToken(sessionToken), parseId(backupId)));
  });
  ipcMain.handle(IPC_CHANNELS.cloudBackupRunScheduled, (event, sessionToken: unknown, schedule: unknown) => {
    trust(event);
    if (!['daily', 'manual', 'weekly'].includes(String(schedule))) {
      return mutation(() => { throw new ObjectDomainError('invalid-input', 'Invalid backup schedule.'); });
    }
    return asyncMutation(() => cloudBackups.runScheduled(parseSessionToken(sessionToken), schedule as 'daily' | 'manual' | 'weekly'));
  });
  ipcMain.handle(IPC_CHANNELS.systemResetWorkspace, (event) => {
    trust(event);
    return mutation(() => {
      database.resetWorkspace();
      return null;
    });
  });

  // ==========================================
  // Max v0.2.0 Core Workspace IPC Handlers
  // ==========================================
  const workspaceMutation = <T>(work: () => T): WorkspaceMutationResult<T> =>
    workspaceMutationResult(() => database.unitOfWork.run(work));

  // Nodes & Navigation
  ipcMain.handle(IPC_CHANNELS.workspaceGetPageGraph, (event) => { trust(event); return database.workspace.getPageGraph(); });
  ipcMain.handle(IPC_CHANNELS.workspaceOpenExternal, async (event, value: unknown): Promise<WorkspaceMutationResult<null>> => {
    trust(event);
    const url = typeof value === 'string' ? safeWebUrl(value) : null;
    if (!url) return { ok: false, error: { code: 'invalid-input', message: 'Use an HTTP or HTTPS URL.' } };
    try { await shell.openExternal(url); return { ok: true, value: null }; }
    catch { return { ok: false, error: { code: 'invalid-input', message: 'Could not open this link.' } }; }
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetNavigation, (event, includeArchived?: unknown) => {
    trust(event);
    return database.workspace.getNavigation(includeArchived === true);
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetNode, (event, id: unknown) => {
    trust(event);
    return database.workspace.getNode(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateNode, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.workspace.createNode(parseWorkspaceNodeDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateNode, (event, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.workspace.updateNode(parseId(id), parseWorkspaceNodePatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveNode, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.workspace.archiveNode(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceRestoreNode, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => database.workspace.restoreNode(parseId(id)));
  });
  ipcMain.handle(IPC_CHANNELS.workspacePermanentlyDeleteNode, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => { database.workspace.permanentlyDeleteNode(parseId(id)); return null; });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceReorderNode, (event, id: unknown, targetPosKey: unknown, newParentId: unknown) => {
    trust(event);
    return workspaceMutation(() =>
      database.workspace.reorderNode(
        parseId(id),
        parseId(targetPosKey),
        typeof newParentId === 'string' ? newParentId : null,
      ),
    );
  });

  // Databases
  ipcMain.handle(IPC_CHANNELS.workspaceGetDatabase, (event, id: unknown) => {
    trust(event);
    return database.databases.getDatabase(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetDatabaseSchema, (event, id: unknown) => {
    trust(event);
    return database.databases.getSchema(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateDatabase, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.databases.createDatabase(parseWorkspaceDatabaseDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateDatabase, (event, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.databases.updateDatabase(parseId(id), parseWorkspaceDatabasePatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveDatabase, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.databases.archiveDatabase(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspacePermanentlyDeleteDatabase, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.databases.permanentlyDeleteDatabase(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceDuplicateDatabase, (event, id: unknown, options: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      const parsedOptions = parseDuplicateDatabaseOptions(options);
      return database.databases.duplicateDatabase(parseId(id), parsedOptions?.title, parsedOptions?.includeRecords);
    });
  });

  // Properties
  ipcMain.handle(IPC_CHANNELS.workspaceListProperties, (event, databaseId: unknown) => {
    trust(event);
    return database.properties.listProperties(parseId(databaseId));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateProperty, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.properties.createProperty(parseWorkspacePropertyDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateProperty, (event, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.properties.updateProperty(parseId(id), parseWorkspacePropertyPatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveProperty, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.properties.archiveProperty(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspacePreviewTypeConversion, (event, propertyId: unknown, targetType: unknown) => {
    trust(event);
    return database.propertySchema.previewTypeConversion(parseId(propertyId), parseWorkspacePropertyType(targetType));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceApplyTypeConversion, (event, propertyId: unknown, targetType: unknown, strategy: unknown) => {
    trust(event);
    return workspaceMutation(() => database.propertySchema.applyTypeConversion(
      parseId(propertyId),
      parseWorkspacePropertyType(targetType),
      parseTypeConversionStrategy(strategy),
    ));
  });

  // Records
  ipcMain.handle(IPC_CHANNELS.workspaceGetRecord, (event, id: unknown) => {
    trust(event);
    return database.records.getRecord(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateRecord, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.records.createRecord(parseWorkspaceRecordDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceListRecordTemplates, (event, databaseId: unknown) => {
    trust(event);
    return database.recordTemplates.list(parseId(databaseId));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSaveRecordTemplate, (event, recordId: unknown, name: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      const record = database.records.getRecord(parseId(recordId));
      if (!record || record.archivedAt) throw new Error('Page not found.');
      const parsedName = parseWorkspaceRecordPatch({ title: name }).title;
      if (!parsedName) throw new Error('Template name is required.');
      const properties = database.properties.listProperties(record.databaseId);
      const editable = new Set(properties.filter((property) => !['title', 'relation', 'formula', 'rollup'].includes(property.type) && !property.uniqueValue).map((property) => property.id));
      return database.recordTemplates.create({
        databaseId: record.databaseId, name: parsedName, icon: record.icon ?? undefined,
        contentJson: record.contentJson ?? '[]',
        defaults: Object.fromEntries(Object.entries(record.properties).filter(([id]) => editable.has(id))),
      });
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceEditRecordTemplate, (event, databaseId: unknown, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.recordTemplates.edit(parseId(databaseId), id === null ? null : parseId(id), parseWorkspaceRecordPatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveRecordTemplate, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => database.recordTemplates.archive(parseId(id)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateRecord, (event, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.records.updateRecord(parseId(id), parseWorkspaceRecordPatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveRecord, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.records.archiveRecord(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceBatchCreateRecords, (event, records: unknown) => {
    trust(event);
    return workspaceMutation(() => database.records.batchCreateRecords(parseWorkspaceRecordDrafts(records)));
  });

  // Relations
  ipcMain.handle(IPC_CHANNELS.workspaceListRelations, (event, databaseId: unknown) => {
    trust(event);
    return database.relations.listRelations(parseId(databaseId));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateRelation, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.relations.createRelation(parseWorkspaceRelationDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveRelation, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.relations.archiveRelation(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetRelatedRecords, (event, recordId: unknown, relationId: unknown) => {
    trust(event);
    return database.relations.getRelatedRecords(parseId(recordId), parseId(relationId));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceLinkRecords, (event, relationId: unknown, sourceRecordId: unknown, targetRecordId: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.relations.linkRecords(parseId(relationId), parseId(sourceRecordId), parseId(targetRecordId));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUnlinkRecords, (event, relationId: unknown, sourceRecordId: unknown, targetRecordId: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.relations.unlinkRecords(parseId(relationId), parseId(sourceRecordId), parseId(targetRecordId));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSearchRelationTargets, (event, relationId: unknown, query: unknown, limit: unknown, fromRecordId: unknown) => {
    trust(event);
    return database.relations.searchRelationTargets(
      parseId(relationId),
      typeof query === 'string' ? query.slice(0, 500) : '',
      typeof limit === 'number' && Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : undefined,
      fromRecordId === undefined ? undefined : parseId(fromRecordId),
    );
  });

  // Views & Queries
  ipcMain.handle(IPC_CHANNELS.workspaceListViews, (event, ownerId: unknown, ownerType: unknown) => {
    trust(event);
    // `null` means the same as an omitted owner type. The browser preview
    // bridge serialises its arguments as JSON, which turns a trailing
    // `undefined` into `null`, and rejecting that broke every database view in
    // the preview while the packaged app was unaffected.
    const owner = ownerType ?? undefined;
    if (owner !== undefined && owner !== 'database' && owner !== 'block') throw new Error('Invalid view owner type.');
    return database.views.listViews(parseId(ownerId), owner);
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetView, (event, id: unknown) => {
    trust(event);
    return database.views.getView(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateView, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.views.createView(parseWorkspaceViewDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateView, (event, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.views.updateView(parseId(id), parseWorkspaceViewPatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveView, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.views.archiveView(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceQueryDatabase, (event, params: unknown) => {
    trust(event);
    return database.databaseQuery.query(parseDatabaseQueryParams(params));
  });

  // Workflows
  ipcMain.handle(IPC_CHANNELS.workspaceListWorkflows, (event) => {
    trust(event);
    return database.workflows.listWorkflows();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetWorkflow, (event, id: unknown) => {
    trust(event);
    return database.workflows.getWorkflow(parseId(id));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateWorkflow, (event, draft: unknown) => {
    trust(event);
    return workspaceMutation(() => database.workflows.createWorkflow(parseWorkspaceWorkflowDraft(draft)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateWorkflow, (event, id: unknown, patch: unknown) => {
    trust(event);
    return workspaceMutation(() => database.workflows.updateWorkflow(parseId(id), parseWorkspaceWorkflowPatch(patch)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceArchiveWorkflow, (event, id: unknown) => {
    trust(event);
    return workspaceMutation(() => {
      database.workflows.archiveWorkflow(parseId(id));
      return null;
    });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceEvaluateWorkflow, (event, input: unknown) => { trust(event); return workspaceMutationResult(() => database.workflows.evaluateForm(parseWorkflowExecutionInput(input))); });

  ipcMain.handle(IPC_CHANNELS.workspaceExecuteWorkflow, (event, input: unknown) => {
    trust(event);
    return workspaceMutationResult(() => database.workflows.execute(parseWorkflowExecutionInput(input)));
  });

  // Search & Migration
  ipcMain.handle(IPC_CHANNELS.workspaceSearch, (event, query: unknown, limit: unknown) => {
    trust(event);
    return database.workspaceSearch.search(
      typeof query === 'string' ? query.slice(0, 500) : '',
      typeof limit === 'number' && Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 20,
    );
  });
  const blueprintMutation = <T>(work: () => T): WorkspaceMutationResult<T> => {
    try { return workspaceMutationResult(work); }
    catch { return { ok: false, error: { code: 'invalid-input', message: 'Blueprint operation failed. Check the file and its references. No import changes were saved.' } }; }
  };
  ipcMain.handle(IPC_CHANNELS.workspaceImportTemplate, (event, template: unknown) => {
    trust(event);
    return blueprintMutation(() => database.workspaceTemplates.importBlueprintV2(parseWorkspaceTemplateV2(template)));
  });
  ipcMain.handle(IPC_CHANNELS.workspaceValidateTemplate, (event, template: unknown) => {
    trust(event);
    return blueprintMutation(() => { database.workspaceTemplates.validateTemplate(parseWorkspaceTemplateV2(template)); return null; });
  });
  ipcMain.handle(IPC_CHANNELS.workspaceExportTemplate, (event) => {
    trust(event);
    return blueprintMutation(() => database.workspaceTemplates.exportTemplate());
  });
  ipcMain.handle(IPC_CHANNELS.workspaceImportFile, async (event, sourcePath: unknown) => {
    trust(event);
    if (typeof sourcePath !== 'string') return { ok: false, error: { code: 'invalid-input', message: 'Invalid file path' } };
    try {
      const assetsDir = path.join(app.getPath('userData'), 'assets');
      await fs.mkdir(assetsDir, { recursive: true });

      const ext = path.extname(sourcePath);
      const newFileName = `${randomUUID()}${ext}`;
      const destPath = path.join(assetsDir, newFileName);

      await fs.copyFile(sourcePath, destPath);

      return { ok: true, value: destPath };
    } catch (e) {
      return { ok: false, error: { code: 'internal-error', message: String(e) } };
    }
  });
  ipcMain.handle(IPC_CHANNELS.workspaceMigrateV01, (event, locale: unknown) => {
    trust(event);
    return workspaceMutationResult(() => database.v020Migration.migrate(locale === 'ar' ? 'ar' : 'en'));
  });
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}
