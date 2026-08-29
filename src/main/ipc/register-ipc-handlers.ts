import { app, ipcMain } from 'electron';

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
import type { TemplateDraft } from '../../shared/template-contract';
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
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}
