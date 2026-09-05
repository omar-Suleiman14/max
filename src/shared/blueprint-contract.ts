import type { ObjectKind, PropertyRules, PropertyType, PropertyValue, SemanticRole } from './object-contract';

export const backupSchedules = ['daily', 'weekly', 'manual'] as const;
export type BackupSchedule = (typeof backupSchedules)[number];

export type BlueprintProperty = Readonly<{
  name: string;
  rules: PropertyRules;
  semanticRole?: SemanticRole;
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
  acceptedTermsAt?: string;
  acceptedTermsVersion?: string;
  backupSchedule: BackupSchedule;
  blueprintName?: string;
  locale: 'ar' | 'en';
  onboardingCompleted: boolean;
  shopName: string;
}>;

export type CompleteOnboardingDraft = Readonly<{
  acceptedTermsVersion?: string;
  backupSchedule: BackupSchedule;
  blueprint?: Blueprint;
  includeDemoData?: boolean;
  locale: 'ar' | 'en';
  shopName: string;
  templateId?: 'blank' | 'custom' | 'phone-shop';
}>;
