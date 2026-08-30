import type { ObjectKind, PropertyRules, PropertyType, PropertyValue } from './object-contract';

export const backupSchedules = ['daily', 'weekly', 'manual'] as const;
export type BackupSchedule = (typeof backupSchedules)[number];

export type BlueprintProperty = Readonly<{
  name: string;
  rules: PropertyRules;
  type: PropertyType;
}>;

export type BlueprintTemplate = Readonly<{
  defaults: Readonly<Record<string, PropertyValue>>;
  fieldOrder: readonly string[];
  name: string;
  objectKind: ObjectKind;
  progressive: readonly string[];
}>;

export type Blueprint = Readonly<{
  description?: string;
  locale?: 'ar' | 'en';
  name: string;
  properties: Readonly<{
    item: readonly BlueprintProperty[];
    person: readonly BlueprintProperty[];
  }>;
  templates: readonly BlueprintTemplate[];
  version: 1;
}>;

export type BlueprintValidationIssue = Readonly<{
  field?: string;
  message: string;
  path: string;
}>;

export type BlueprintValidationResult = Readonly<{
  issues: readonly BlueprintValidationIssue[];
  valid: boolean;
}>;

export type ShopMetadata = Readonly<{
  backupSchedule: BackupSchedule;
  blueprintName?: string;
  locale: 'ar' | 'en';
  onboardingCompleted: boolean;
  shopName: string;
}>;

export type CompleteOnboardingDraft = Readonly<{
  backupSchedule: BackupSchedule;
  blueprint?: Blueprint;
  includeDemoData?: boolean;
  locale: 'ar' | 'en';
  shopName: string;
}>;
