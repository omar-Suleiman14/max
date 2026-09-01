/**
 * Blueprint v2 and Workspace Template contracts for Max v0.2.0.
 */

import type { PropertyType } from './property-contract';
import type { ViewLayout } from './view-contract';
import type { FilterNode, SortRule } from './query-contract';
import type { WorkflowInputField, WorkflowStep } from './workflow-contract';

export type TemplateProperty = Readonly<{
  config?: Readonly<Record<string, unknown>>;
  defaultValue?: unknown;
  key: string;
  name: string;
  options?: readonly Readonly<{ label: string; style?: { background?: string; color?: string } }>[];
  required?: boolean;
  type: PropertyType;
  uniqueValue?: boolean;
}>;

export type TemplateView = Readonly<{
  filterAst?: FilterNode | null;
  key: string;
  layout: ViewLayout;
  layoutConfig?: Readonly<Record<string, unknown>>;
  name: string;
  propertyKeys?: readonly string[];
  sorts?: readonly SortRule[];
}>;

export type TemplateDatabase = Readonly<{
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
  icon?: string;
  inputSchema: Readonly<{ fields: readonly WorkflowInputField[] }>;
  key: string;
  name: string;
  steps: readonly WorkflowStep[];
}>;

export type TemplatePage = Readonly<{
  contentJson: string;
  icon?: string;
  key: string;
  title: string;
}>;

export type WorkspaceTemplateV2 = Readonly<{
  author?: string;
  databases: readonly TemplateDatabase[];
  description?: string;
  name: string;
  pages?: readonly TemplatePage[];
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
  relationCount: number;
  workflowCount: number;
}>;
