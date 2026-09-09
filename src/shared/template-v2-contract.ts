/**
 * Blueprint v2 and Workspace Template contracts for Max v0.2.0.
 */

import type { PropertyType, StatusCategory } from './property-contract';
import type { ViewLayout, PropertyViewState } from './view-contract';
import type { FilterNode, GroupRule, SortRule } from './query-contract';
import type { WorkflowInputSchema, WorkflowStep } from './workflow-contract';

export type TemplateProperty = Readonly<{
  config?: Readonly<Record<string, unknown>>;
  defaultValue?: unknown;
  key: string;
  name: string;
  options?: readonly Readonly<{ key?: string; label: string; statusGroupKey?: string; style?: { background?: string; color?: string } }>[];
  statusGroups?: readonly Readonly<{ key: string; label: string; category: StatusCategory }>[];
  required?: boolean;
  type: PropertyType;
  uniqueValue?: boolean;
}>;

export type TemplateView = Readonly<{
  filterAst?: FilterNode | null;
  group?: GroupRule | null;
  key: string;
  layout: ViewLayout;
  layoutConfig?: Readonly<Record<string, unknown>>;
  name: string;
  propertyKeys?: readonly string[];
  propertyState?: PropertyViewState;
  sorts?: readonly SortRule[];
}>;

export type TemplateRecordTemplate = Readonly<{
  contentJson?: string;
  databaseKey: string;
  defaults?: Readonly<Record<string, unknown>>;
  icon?: string;
  key: string;
  name: string;
}>;

export type TemplateDatabase = Readonly<{
  parentPageKey?: string;
  positionKey?: string;
  defaultViewKey?: string;
  icon?: string;
  key: string;
  properties: readonly TemplateProperty[];
  title: string;
  views: readonly TemplateView[];
  visibility?: 'normal' | 'advanced';
}>;

export type TemplateRelation = Readonly<{
  inversePropertyKey?: string;
  inversePropertyName?: string;
  key: string;
  sourceCardinality?: 'one' | 'many';
  sourceDatabaseKey: string;
  sourcePropertyKey: string;
  targetCardinality?: 'one' | 'many';
  targetDatabaseKey: string;
}>;

export type TemplateWorkflow = Readonly<{
  enabled?: boolean;
  icon?: string;
  inputSchema: WorkflowInputSchema;
  key: string;
  name: string;
  steps: readonly WorkflowStep[];
}>;

export type TemplatePage = Readonly<{
  parentPageKey?: string;
  positionKey?: string;
  contentJson: string;
  /** Emoji, or a Lucide icon encoded as lucide:IconName#RRGGBB. */
  icon?: string;
  key: string;
  title: string;
}>;

export type TemplateRecord = Readonly<{
  key: string;
  databaseKey: string;
  title: string;
  icon?: string;
  contentJson?: string;
  properties?: Readonly<Record<string, unknown>>;
}>;

export type WorkspaceTemplateV2 = Readonly<{
  author?: string;
  databases: readonly TemplateDatabase[];
  description?: string;
  name: string;
  pages?: readonly TemplatePage[];
  recordTemplates?: readonly TemplateRecordTemplate[];
  records?: readonly TemplateRecord[];
  relations: readonly TemplateRelation[];
  version: 2;
  workflows?: readonly TemplateWorkflow[];
}>;

export type TemplateImportResult = Readonly<{
  databaseCount: number;
  databases: readonly { id: string; key: string; title: string }[];
  pageCount: number;
  pages: readonly { id: string; key: string; title: string }[];
  propertyCount: number;
  recordCount: number;
  relationCount: number;
  workflowCount: number;
}>;
