/**
 * Workspace node, navigation, and error contracts for Max v0.2.0.
 */

export type WorkspaceNodeKind = 'page' | 'database' | 'record';

export type WorkspaceNode = Readonly<{
  archivedAt?: string | null;
  contentJson: string;
  createdAt: string;
  icon?: string | null;
  id: string;
  kind: WorkspaceNodeKind;
  parentNodeId?: string | null;
  positionKey: string;
  revision: number;
  title: string;
  updatedAt: string;
}>;

export type WorkspaceNodeDraft = Readonly<{
  contentJson?: string;
  icon?: string | null;
  id?: string;
  kind: WorkspaceNodeKind;
  parentNodeId?: string | null;
  positionKey?: string;
  title: string;
}>;

export type WorkspaceNodePatch = Readonly<{
  contentJson?: string;
  icon?: string | null;
  parentNodeId?: string | null;
  positionKey?: string;
  title?: string;
}>;

export type NavigationItem = Readonly<{
  archivedAt?: string | null;
  icon?: string | null;
  id: string;
  kind: WorkspaceNodeKind;
  level: number;
  parentNodeId?: string | null;
  positionKey: string;
  title: string;
  visibility?: 'normal' | 'advanced';
}>;

export type WorkspaceNavigation = Readonly<{
  databases: readonly NavigationItem[];
  pages: readonly NavigationItem[];
}>;

export type WorkspaceErrorCode =
  | 'invalid-input'
  | 'not-found'
  | 'constraint-violation'
  | 'dependency-conflict'
  | 'conversion-required'
  | 'relation-cardinality'
  | 'workflow-failed'
  | 'insufficient-stock'
  | 'duplicate-value'
  | 'cannot-archive-title';

export class WorkspaceDomainError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
    readonly entityId?: string,
  ) {
    super(message);
    this.name = 'WorkspaceDomainError';
  }
}

export type MutationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ code?: WorkspaceErrorCode; error: string; ok: false }>;

export type WorkspaceSearchResult = Readonly<{
  highlightSnippet: string;
  id: string;
  kind: 'database' | 'page' | 'record';
  matchField: string;
  rank: number;
  title: string;
}>;

export type MigrationSummary = Readonly<{
  accountsMigrated: number;
  inventoryMovementsMigrated: number;
  itemsMigrated: number;
  moneyMovementsMigrated: number;
  pagesMigrated: number;
  parityCheckPassed: boolean;
  peopleMigrated: number;
  transactionsMigrated: number;
  viewsMigrated: number;
}>;
