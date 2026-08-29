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

export const IPC_CHANNELS = {
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
  shopCompleteOnboarding: 'max:shop:onboarding:complete',
  shopGetMetadata: 'max:shop:metadata:get',
  shopUpdateMetadata: 'max:shop:metadata:update',
  systemHealth: 'max:system:health',
  templateArchive: 'max:templates:archive',
  templateCreate: 'max:templates:create',
  templateList: 'max:templates:list',
  templateUpdate: 'max:templates:update',
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

export type MaxApi = Readonly<{
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
}>;
