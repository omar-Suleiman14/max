import type { DatabaseSync } from 'node:sqlite';

import { WorkspaceDomainError } from '../../shared/workspace-contract';

export type DependencyRecord = Readonly<{
  dependencyType: string;
  id: number;
  metadata: Readonly<Record<string, unknown>>;
  sourceId: string;
  sourceKind: string;
  targetId: string;
  targetKind: string;
}>;

type DependencyRow = Readonly<{
  created_at: string;
  dependency_type: string;
  id: number;
  metadata_json: string;
  source_id: string;
  source_kind: string;
  target_id: string;
  target_kind: string;
}>;

export class DependencyService {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  registerDependencies(
    sourceKind: string,
    sourceId: string,
    dependencies: readonly { metadata?: Record<string, unknown>; targetId: string; targetKind: string; type: string }[],
  ): void {
    this.removeDependenciesForSource(sourceKind, sourceId);

    const now = new Date().toISOString();
    const insert = this.#database.prepare(`
      INSERT INTO workspace_dependencies (source_kind, source_id, target_kind, target_id, dependency_type, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const dep of dependencies) {
      const metaJson = JSON.stringify(dep.metadata ?? {});
      insert.run(sourceKind, sourceId, dep.targetKind, dep.targetId, dep.type, metaJson, now);
    }
  }

  listDependencies(targetKind: string, targetId: string): readonly DependencyRecord[] {
    const rows = this.#database
      .prepare('SELECT * FROM workspace_dependencies WHERE target_kind = ? AND target_id = ?')
      .all(targetKind, targetId) as DependencyRow[];

    return rows.map((r) => ({
      dependencyType: r.dependency_type,
      id: r.id,
      metadata: JSON.parse(r.metadata_json || '{}'),
      sourceId: r.source_id,
      sourceKind: r.source_kind,
      targetId: r.target_id,
      targetKind: r.target_kind,
    }));
  }

  removeDependenciesForSource(sourceKind: string, sourceId: string): void {
    this.#database
      .prepare('DELETE FROM workspace_dependencies WHERE source_kind = ? AND source_id = ?')
      .run(sourceKind, sourceId);
  }

  assertCanDelete(targetKind: string, targetId: string, entityLabel?: string): void {
    const deps = this.listDependencies(targetKind, targetId);
    if (deps.length > 0) {
      const depDescriptions = deps.map((d) => {
        const name = (d.metadata.name as string) || d.sourceId;
        return `${name} (${d.dependencyType} in ${d.sourceKind})`;
      });
      const name = entityLabel || targetId;
      throw new WorkspaceDomainError(
        'dependency-conflict',
        `Cannot delete "${name}" because it is currently used by: ${depDescriptions.join(', ')}.`,
        targetId,
      );
    }
  }
}
