import type { ObjectKind, PropertyValue } from './object-contract';

export type TemplateDraft = Readonly<{
  defaults: Readonly<Record<string, PropertyValue>>;
  fieldOrder: readonly string[];
  name: string;
  objectKind: ObjectKind;
  progressive: readonly string[];
}>;

export type TemplateDefinition = TemplateDraft & Readonly<{
  createdAt: string;
  id: string;
  position: number;
  updatedAt: string;
}>;
