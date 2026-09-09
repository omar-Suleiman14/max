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
  /** Compatibility identifier for links saved before generic databases. */
  legacyAlias?: string;
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
  | Readonly<{
      error: Readonly<{ code: WorkspaceErrorCode; entityId?: string; message: string }>;
      ok: false;
    }>;

export type WorkspaceSearchResult = Readonly<{
  databaseId?: string;
  displayMetadata?: string;
  displaySubtitle?: string;
  displayTitle: string;
  entityId: string;
  entityKind: 'database' | 'page' | 'record' | 'view';
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
