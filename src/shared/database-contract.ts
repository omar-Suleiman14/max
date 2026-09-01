/**
 * Workspace database and schema contracts for Max v0.2.0.
 */

import type { WorkspaceNode } from './workspace-contract';
import type { WorkspaceProperty } from './property-contract';
import type { WorkspaceView } from './view-contract';

export type DatabaseVisibility = 'normal' | 'advanced';

export type WorkspaceDatabase = Readonly<{
  createdAt: string;
  defaultViewId?: string | null;
  id: string;
  updatedAt: string;
  visibility: DatabaseVisibility;
}>;

export type WorkspaceDatabaseDraft = Readonly<{
  defaultViewId?: string | null;
  icon?: string | null;
  id?: string;
  parentNodeId?: string | null;
  positionKey?: string;
  title: string;
  visibility?: DatabaseVisibility;
}>;

export type WorkspaceDatabasePatch = Readonly<{
  defaultViewId?: string | null;
  icon?: string | null;
  title?: string;
  visibility?: DatabaseVisibility;
}>;

export type DatabaseSchema = Readonly<{
  database: WorkspaceDatabase & Pick<WorkspaceNode, 'archivedAt' | 'icon' | 'parentNodeId' | 'positionKey' | 'revision' | 'title'>;
  properties: readonly WorkspaceProperty[];
  views: readonly WorkspaceView[];
}>;
