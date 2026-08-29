import type {
  AuditEntry,
  ConfigurableRecord,
  ConfigurableRecordDraft,
  MutationResult,
  ObjectKind,
  PropertyDefinition,
  PropertyDraft,
} from './object-contract';

export const IPC_CHANNELS = {
  objectAuditList: 'max:objects:audit:list',
  objectPropertyArchive: 'max:objects:properties:archive',
  objectPropertyCreate: 'max:objects:properties:create',
  objectPropertyList: 'max:objects:properties:list',
  objectPropertyUpdate: 'max:objects:properties:update',
  objectRecordArchive: 'max:objects:records:archive',
  objectRecordCreate: 'max:objects:records:create',
  objectRecordList: 'max:objects:records:list',
  objectRecordUpdate: 'max:objects:records:update',
  systemHealth: 'max:system:health',
} as const;

export type DatabaseHealth = Readonly<{
  status: 'ready';
  schemaVersion: number;
  migrationCount: number;
}>;

export type SystemHealth = Readonly<{
  appVersion: string;
  database: DatabaseHealth;
  runtime: Readonly<{
    arch: string;
    platform: 'linux' | 'macos' | 'windows';
  }>;
}>;

export type MaxApi = Readonly<{
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
  system: Readonly<{
    getHealth: () => Promise<SystemHealth>;
  }>;
}>;
