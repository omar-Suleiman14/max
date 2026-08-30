export const objectKinds = ['item', 'person'] as const;
export type ObjectKind = (typeof objectKinds)[number];

export const propertyTypes = [
  'text',
  'number',
  'money',
  'date',
  'checkbox',
  'select',
  'status',
  'relation',
] as const;
export type PropertyType = (typeof propertyTypes)[number];

export type PropertyValue = string | number | boolean;

export type PropertyRules = Readonly<{
  choices: readonly string[];
  digitsOnly: boolean;
  exactDigits?: number;
  maximum?: number;
  maximumLength?: number;
  minimum?: number;
  minimumLength?: number;
  relationTarget?: ObjectKind;
  required: boolean;
  unique: boolean;
}>;

export type PropertyDraft = Readonly<{
  name: string;
  objectKind: ObjectKind;
  rules: PropertyRules;
  type: PropertyType;
}>;

export type PropertyDefinition = PropertyDraft & Readonly<{
  createdAt: string;
  id: string;
  position: number;
  updatedAt: string;
}>;

export type ConfigurableRecordDraft = Readonly<{
  label: string;
  objectKind: ObjectKind;
  templateId?: string;
  values: Readonly<Record<string, PropertyValue>>;
}>;

export type ConfigurableRecord = ConfigurableRecordDraft & Readonly<{
  createdAt: string;
  id: string;
  position?: number;
  updatedAt: string;
}>;

export const objectErrorCodes = [
  'invalid-input',
  'not-found',
  'required',
  'unique',
  'schema-conflict',
  'relation-not-found',
] as const;
export type ObjectErrorCode = (typeof objectErrorCodes)[number];

export type ObjectMutationError = Readonly<{
  code: ObjectErrorCode;
  message: string;
  propertyId?: string;
}>;

export type MutationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ error: ObjectMutationError; ok: false }>;

export type AuditEntry = Readonly<{
  action: 'archived' | 'created' | 'updated';
  actor: 'local-user';
  createdAt: string;
  id: number;
  snapshot: unknown;
}>;
