import { app, ipcMain } from 'electron';

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
import { IPC_CHANNELS, type SystemHealth } from '../../shared/ipc-contract';
import {
  objectKinds,
  propertyTypes,
  type ConfigurableRecordDraft,
  type MutationResult,
  type ObjectKind,
  type PropertyDraft,
  type PropertyValue,
} from '../../shared/object-contract';
import type { PaymentMode, QuickEntryDraft } from '../../shared/quick-entry-contract';
import type { TemplateDraft } from '../../shared/template-contract';
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
import { ObjectDomainError } from '../database/object-repository';
import type { PlatformAdapter } from '../platform/platform-adapter';
import { assertTrustedSender } from '../security/trusted-sender';

type RegisterIpcHandlersOptions = Readonly<{
  database: DatabaseService;
  developmentServerUrl?: string;
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
      maximum: optionalNumber(rules.maximum, 'Maximum'),
      maximumLength: optionalLength(rules.maximumLength, 'Maximum length'),
      minimum: optionalNumber(rules.minimum, 'Minimum'),
      minimumLength: optionalLength(rules.minimumLength, 'Minimum length'),
      relationTarget: rules.relationTarget === undefined ? undefined : parseObjectKind(rules.relationTarget),
      required: rules.required,
      unique: rules.unique,
    },
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
  return { label: value.label, objectKind: parseObjectKind(value.objectKind), values };
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

  return {
    backupSchedule: value.backupSchedule as CompleteOnboardingDraft['backupSchedule'],
    blueprint: value.blueprint as Blueprint | undefined,
    locale: value.locale,
    shopName: value.shopName,
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
    initialBalance,
    name: value.name,
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
    toAccountId: value.toAccountId,
  };
}

function parseQuickEntryDraft(value: unknown): QuickEntryDraft {
  if (!isObject(value)) {
    throw new ObjectDomainError('invalid-input', 'A valid quick entry draft is required.');
  }
  const totalAmount = Number(value.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new ObjectDomainError('invalid-input', 'Total amount must be greater than zero.');
  }
  if (!['full', 'partial', 'later'].includes(String(value.paymentMode))) {
    throw new ObjectDomainError('invalid-input', 'A valid payment mode is required.');
  }

  return {
    accountId: typeof value.accountId === 'string' ? value.accountId : undefined,
    collectorId: typeof value.collectorId === 'string' ? value.collectorId : undefined,
    itemId: typeof value.itemId === 'string' ? value.itemId : undefined,
    note: typeof value.note === 'string' ? value.note : undefined,
    paidAmount: typeof value.paidAmount === 'number' ? value.paidAmount : undefined,
    paymentMode: value.paymentMode as PaymentMode,
    personId: typeof value.personId === 'string' ? value.personId : undefined,
    templateId: typeof value.templateId === 'string' ? value.templateId : undefined,
    totalAmount,
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

export function registerIpcHandlers({
  database,
  developmentServerUrl,
  platform,
}: RegisterIpcHandlersOptions): void {
  function trust(event: Electron.IpcMainInvokeEvent): void {
    const senderUrl = event.senderFrame?.url;
    if (!senderUrl) {
      throw new Error('Rejected IPC request without a sender frame.');
    }
    assertTrustedSender(senderUrl, developmentServerUrl);
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
  ipcMain.handle(IPC_CHANNELS.shopUpdateMetadata, (event, patch: unknown) => {
    trust(event);
    return mutation(() => database.shopMetadata.updateMetadata(patch as Partial<ShopMetadata>));
  });
  ipcMain.handle(IPC_CHANNELS.shopCompleteOnboarding, (event, draft: unknown) => {
    trust(event);
    return mutation(() => {
      const parsed = parseCompleteOnboardingDraft(draft);
      if (parsed.blueprint) {
        database.blueprints.importBlueprint(parsed.blueprint);
      }
      return database.shopMetadata.completeOnboarding(parsed);
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
  // Quick Entry
  ipcMain.handle(IPC_CHANNELS.quickEntryGetSuggestion, (event, itemId: unknown, templateId: unknown) => {
    trust(event);
    return database.quickEntry.getSuggestion(
      typeof itemId === 'string' ? itemId : undefined,
      typeof templateId === 'string' ? templateId : undefined,
    );
  });
  ipcMain.handle(IPC_CHANNELS.quickEntrySubmit, (event, draft: unknown) => {
    trust(event);
    return mutation(() => database.quickEntry.submit(parseQuickEntryDraft(draft)));
  });
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}
