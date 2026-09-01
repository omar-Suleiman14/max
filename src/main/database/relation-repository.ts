import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  RelationEdge,
  RelationTargetSummary,
  WorkspaceRelation,
  WorkspaceRelationDraft,
} from '../../shared/relation-contract';
import type { PropertyRepository } from './property-repository';
import type { WorkspaceRecord } from '../../shared/property-contract';
import type { RecordRepository } from './record-repository';

type RelationRow = Readonly<{
  archived_at: string | null;
  created_at: string;
  id: string;
  inverse_property_id: string | null;
  source_cardinality: WorkspaceRelation['sourceCardinality'];
  source_database_id: string;
  source_property_id: string;
  target_cardinality: WorkspaceRelation['targetCardinality'];
  target_database_id: string;
  updated_at: string;
}>;

type EdgeRow = Readonly<{
  archived_at: string | null;
  created_at: string;
  id: string;
  position_key: string;
  relation_id: string;
  source_record_id: string;
  target_record_id: string;
}>;

function relationFromRow(row: RelationRow): WorkspaceRelation {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    id: row.id,
    inversePropertyId: row.inverse_property_id,
    sourceCardinality: row.source_cardinality,
    sourceDatabaseId: row.source_database_id,
    sourcePropertyId: row.source_property_id,
    targetCardinality: row.target_cardinality,
    targetDatabaseId: row.target_database_id,
    updatedAt: row.updated_at,
  };
}

export class RelationRepository {
  readonly #database: DatabaseSync;
  readonly #propertyRepo: PropertyRepository;
  readonly #recordRepo: RecordRepository;

  constructor(
    database: DatabaseSync,
    propertyRepo: PropertyRepository,
    recordRepo: RecordRepository,
  ) {
    this.#database = database;
    this.#propertyRepo = propertyRepo;
    this.#recordRepo = recordRepo;
  }

  createRelation(draft: WorkspaceRelationDraft): WorkspaceRelation {
    const id = draft.id ?? randomUUID();
    const now = new Date().toISOString();
    const sourceCard = draft.sourceCardinality ?? 'many';
    const targetCard = draft.targetCardinality ?? 'many';

    let inversePropId: string | null = draft.inversePropertyId ?? null;
    if (inversePropId) {
      const inverseProperty = this.#propertyRepo.getProperty(inversePropId);
      if (!inverseProperty || inverseProperty.databaseId !== draft.targetDatabaseId || inverseProperty.type !== 'relation') {
        throw new WorkspaceDomainError('invalid-input', 'Inverse relation property is invalid.');
      }
      this.#propertyRepo.updateProperty(inverseProperty.id, {
        config: { ...inverseProperty.config, relationId: id },
      });
    } else if (draft.inversePropertyName?.trim()) {
      const invProp = this.#propertyRepo.createProperty({
        config: { relationId: id },
        databaseId: draft.targetDatabaseId,
        name: draft.inversePropertyName.trim(),
        type: 'relation',
      });
      inversePropId = invProp.id;
    }

    this.#database
      .prepare(`
        INSERT INTO workspace_relations (
          id, source_property_id, source_database_id, target_database_id, inverse_property_id,
          source_cardinality, target_cardinality, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(id, draft.sourcePropertyId, draft.sourceDatabaseId, draft.targetDatabaseId, inversePropId, sourceCard, targetCard, now, now);

    // Also update source property config with relationId
    const sourceProp = this.#propertyRepo.getProperty(draft.sourcePropertyId);
    if (sourceProp) {
      this.#propertyRepo.updateProperty(sourceProp.id, {
        config: { ...sourceProp.config, relationId: id },
      });
    }

    return {
      archivedAt: null,
      createdAt: now,
      id,
      inversePropertyId: inversePropId,
      sourceCardinality: sourceCard,
      sourceDatabaseId: draft.sourceDatabaseId,
      sourcePropertyId: draft.sourcePropertyId,
      targetCardinality: targetCard,
      targetDatabaseId: draft.targetDatabaseId,
      updatedAt: now,
    };
  }

  getRelation(id: string): WorkspaceRelation | null {
    const row = this.#database
      .prepare('SELECT * FROM workspace_relations WHERE id = ?')
      .get(id) as RelationRow | undefined;

    return row ? relationFromRow(row) : null;
  }

  getRelationByPropertyId(propertyId: string): WorkspaceRelation | null {
    const row = this.#database
      .prepare('SELECT * FROM workspace_relations WHERE source_property_id = ? OR inverse_property_id = ?')
      .get(propertyId, propertyId) as RelationRow | undefined;

    return row ? relationFromRow(row) : null;
  }

  listRelations(databaseId: string): readonly WorkspaceRelation[] {
    const rows = this.#database
      .prepare(`
        SELECT * FROM workspace_relations
        WHERE (source_database_id = ? OR target_database_id = ?) AND archived_at IS NULL
      `)
      .all(databaseId, databaseId) as RelationRow[];

    return rows.map(relationFromRow);
  }

  connect(relationId: string, sourceRecordId: string, targetRecordId: string): RelationEdge {
    const rel = this.getRelation(relationId);
    if (!rel) {
      throw new WorkspaceDomainError('not-found', `Relation not found: ${relationId}`);
    }

    // Check existing edge
    const existing = this.#database
      .prepare(`
        SELECT * FROM workspace_relation_edges
        WHERE relation_id = ? AND source_record_id = ? AND target_record_id = ?
      `)
      .get(relationId, sourceRecordId, targetRecordId) as EdgeRow | undefined;

    if (existing) {
      if (existing.archived_at) {
        this.#database
          .prepare('UPDATE workspace_relation_edges SET archived_at = NULL WHERE id = ?')
          .run(existing.id);
      }
      return {
        archivedAt: null,
        createdAt: existing.created_at,
        id: existing.id,
        positionKey: existing.position_key,
        relationId,
        sourceRecordId,
        targetRecordId,
      };
    }

    // Cardinality enforcement
    if (rel.targetCardinality === 'one') {
      // Source can only connect to one target
      this.#database
        .prepare('DELETE FROM workspace_relation_edges WHERE relation_id = ? AND source_record_id = ?')
        .run(relationId, sourceRecordId);
    }

    if (rel.sourceCardinality === 'one') {
      // Target can only be connected to one source
      this.#database
        .prepare('DELETE FROM workspace_relation_edges WHERE relation_id = ? AND target_record_id = ?')
        .run(relationId, targetRecordId);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const positionKey = generateOrderKey();

    this.#database
      .prepare(`
        INSERT INTO workspace_relation_edges (
          id, relation_id, source_record_id, target_record_id, position_key, created_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(id, relationId, sourceRecordId, targetRecordId, positionKey, now);

    return {
      archivedAt: null,
      createdAt: now,
      id,
      positionKey,
      relationId,
      sourceRecordId,
      targetRecordId,
    };
  }

  disconnect(relationId: string, sourceRecordId: string, targetRecordId: string): void {
    this.#database
      .prepare(`
        DELETE FROM workspace_relation_edges
        WHERE relation_id = ? AND source_record_id = ? AND target_record_id = ?
      `)
      .run(relationId, sourceRecordId, targetRecordId);
  }

  replace(relationId: string, sourceRecordId: string, targetRecordIds: readonly string[]): readonly RelationEdge[] {
    const rel = this.getRelation(relationId);
    if (!rel) {
      throw new WorkspaceDomainError('not-found', `Relation not found: ${relationId}`);
    }

    this.#database
      .prepare('DELETE FROM workspace_relation_edges WHERE relation_id = ? AND source_record_id = ?')
      .run(relationId, sourceRecordId);

    const edges: RelationEdge[] = [];
    for (const targetId of targetRecordIds) {
      if (targetId.trim()) {
        const edge = this.connect(relationId, sourceRecordId, targetId.trim());
        edges.push(edge);
      }
    }

    return edges;
  }

  searchTargets(relationId: string, searchTerm: string, limit = 20, fromRecordId?: string): readonly RelationTargetSummary[] {
    const rel = this.getRelation(relationId);
    if (!rel) {
      throw new WorkspaceDomainError('not-found', `Relation not found: ${relationId}`);
    }

    const fromRecord = fromRecordId ? this.#recordRepo.getRecord(fromRecordId) : null;
    const targetDbId = fromRecord?.databaseId === rel.targetDatabaseId
      ? rel.sourceDatabaseId
      : rel.targetDatabaseId;
    const term = `%${searchTerm.trim().toLowerCase()}%`;

    const rows = this.#database
      .prepare(`
        SELECT r.id, r.sequence, r.database_id, n.title, n.icon, db_node.title AS database_title
        FROM workspace_records r
        JOIN workspace_nodes n ON n.id = r.id
        JOIN workspace_nodes db_node ON db_node.id = r.database_id
        WHERE r.database_id = ? AND r.archived_at IS NULL AND (
          lower(n.title) LIKE ? OR
          cast(r.sequence as text) LIKE ?
        )
        ORDER BY r.sequence DESC
        LIMIT ?
      `)
      .all(targetDbId, term, term, limit) as Readonly<{
        database_id: string;
        database_title: string;
        icon: string | null;
        id: string;
        sequence: number;
        title: string;
      }>[];

    return rows.map((r) => ({
      databaseId: r.database_id,
      databaseTitle: r.database_title,
      icon: r.icon,
      id: r.id,
      sequence: r.sequence,
      title: r.title,
    }));
  }

  getEdgesForRecords(relationId: string, recordIds: readonly string[], asSource = true): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (recordIds.length === 0) return result;

    for (const id of recordIds) {
      result.set(id, []);
    }

    const placeholders = recordIds.map(() => '?').join(',');
    const matchCol = asSource ? 'source_record_id' : 'target_record_id';
    const targetCol = asSource ? 'target_record_id' : 'source_record_id';

    const rows = this.#database
      .prepare(`
        SELECT ${matchCol} AS match_id, ${targetCol} AS target_id
        FROM workspace_relation_edges
        WHERE relation_id = ? AND ${matchCol} IN (${placeholders}) AND archived_at IS NULL
        ORDER BY position_key ASC
      `)
      .all(relationId, ...recordIds) as { match_id: string; target_id: string }[];

    for (const row of rows) {
      const list = result.get(row.match_id);
      if (list) {
        list.push(row.target_id);
      }
    }

    return result;
  }

  archiveRelation(id: string): void {
    const rel = this.getRelation(id);
    if (!rel) {
      throw new WorkspaceDomainError('not-found', `Relation not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.#database.prepare('UPDATE workspace_relations SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  }

  linkRecords(relationId: string, sourceRecordId: string, targetRecordId: string): void {
    const relation = this.getRelation(relationId);
    const sourceRecord = this.#recordRepo.getRecord(sourceRecordId);
    if (!relation || !sourceRecord) {
      throw new WorkspaceDomainError('not-found', 'Relation or source record was not found.');
    }
    if (sourceRecord.databaseId === relation.targetDatabaseId) {
      this.connect(relationId, targetRecordId, sourceRecordId);
    } else {
      this.connect(relationId, sourceRecordId, targetRecordId);
    }
  }

  unlinkRecords(relationId: string, sourceRecordId: string, targetRecordId: string): void {
    const relation = this.getRelation(relationId);
    const sourceRecord = this.#recordRepo.getRecord(sourceRecordId);
    if (!relation || !sourceRecord) {
      throw new WorkspaceDomainError('not-found', 'Relation or source record was not found.');
    }
    if (sourceRecord.databaseId === relation.targetDatabaseId) {
      this.disconnect(relationId, targetRecordId, sourceRecordId);
    } else {
      this.disconnect(relationId, sourceRecordId, targetRecordId);
    }
  }

  searchRelationTargets(
    relationId: string,
    query: string,
    limit?: number,
    fromRecordId?: string,
  ): readonly RelationTargetSummary[] {
    return this.searchTargets(relationId, query, limit, fromRecordId);
  }

  getRelatedRecords(recordId: string, relationId: string): readonly WorkspaceRecord[] {
    const rel = this.getRelation(relationId);
    if (!rel) return [];

    const record = this.#recordRepo.getRecord(recordId);
    if (!record) return [];
    const asSource = record.databaseId === rel.sourceDatabaseId;
    const targetMap = this.getEdgesForRecords(relationId, [recordId], asSource);
    const targetIds = targetMap.get(recordId) ?? [];
    return targetIds
      .map((targetId) => this.#recordRepo.getRecord(targetId))
      .filter((target): target is WorkspaceRecord => target !== null && !target.archivedAt);
  }
}
