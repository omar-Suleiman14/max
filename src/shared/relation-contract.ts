/**
 * Relation definitions and edges contracts for Max v0.2.0.
 */

export type RelationCardinality = 'one' | 'many';

export type WorkspaceRelation = Readonly<{
  archivedAt?: string | null;
  createdAt: string;
  id: string;
  inversePropertyId?: string | null;
  sourceCardinality: RelationCardinality;
  sourceDatabaseId: string;
  sourcePropertyId: string;
  targetCardinality: RelationCardinality;
  targetDatabaseId: string;
  updatedAt: string;
}>;

export type WorkspaceRelationDraft = Readonly<{
  id?: string;
  inversePropertyId?: string | null;
  inversePropertyName?: string | null;
  sourceCardinality?: RelationCardinality;
  sourceDatabaseId: string;
  sourcePropertyId: string;
  targetCardinality?: RelationCardinality;
  targetDatabaseId: string;
}>;

export type RelationEdge = Readonly<{
  archivedAt?: string | null;
  createdAt: string;
  id: string;
  positionKey: string;
  relationId: string;
  sourceRecordId: string;
  targetRecordId: string;
}>;

export type RelationTargetSummary = Readonly<{
  databaseId: string;
  databaseTitle: string;
  icon?: string | null;
  id: string;
  sequence: number;
  title: string;
}>;
