import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import type { WorkspaceRecordTemplate } from '../../shared/property-contract';
import { WorkspaceDomainError } from '../../shared/workspace-contract';

type RecordTemplateRow = Readonly<{
  content_json: string;
  created_at: string;
  database_id: string;
  defaults_json: string;
  icon: string | null;
  id: string;
  name: string;
  position_key: string;
  updated_at: string;
}>;

function fromRow(row: RecordTemplateRow): WorkspaceRecordTemplate {
  return {
    contentJson: row.content_json,
    createdAt: row.created_at,
    databaseId: row.database_id,
    defaults: JSON.parse(row.defaults_json) as Readonly<Record<string, unknown>>,
    icon: row.icon,
    id: row.id,
    name: row.name,
    positionKey: row.position_key,
    updatedAt: row.updated_at,
  };
}

export class RecordTemplateRepository {
  constructor(private readonly database: DatabaseSync) {}

  list(databaseId: string): readonly WorkspaceRecordTemplate[] {
    return (this.database.prepare(`
      SELECT id, database_id, name, icon, defaults_json, content_json, position_key, created_at, updated_at
      FROM workspace_record_templates
      WHERE database_id = ? AND archived_at IS NULL
      ORDER BY position_key, name COLLATE NOCASE
    `).all(databaseId) as RecordTemplateRow[]).map(fromRow);
  }

  get(id: string): WorkspaceRecordTemplate | null {
    const row = this.database.prepare(`
      SELECT id, database_id, name, icon, defaults_json, content_json, position_key, created_at, updated_at
      FROM workspace_record_templates WHERE id = ? AND archived_at IS NULL
    `).get(id) as RecordTemplateRow | undefined;
    return row ? fromRow(row) : null;
  }

  create(input: Readonly<{
    contentJson?: string;
    databaseId: string;
    defaults?: Readonly<Record<string, unknown>>;
    icon?: string;
    id?: string;
    name: string;
  }>): WorkspaceRecordTemplate {
    const id = input.id ?? randomUUID();
    const name = input.name.trim();
    if (!name) throw new WorkspaceDomainError('invalid-input', 'Record template name is required.');
    const now = new Date().toISOString();
    const last = this.database.prepare(`
      SELECT position_key FROM workspace_record_templates
      WHERE database_id = ? AND archived_at IS NULL ORDER BY position_key DESC LIMIT 1
    `).get(input.databaseId) as { position_key: string } | undefined;
    const positionKey = generateOrderKey(last?.position_key ?? null, null);
    this.database.prepare(`
      INSERT INTO workspace_record_templates
        (id, database_id, name, icon, defaults_json, content_json, position_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.databaseId, name, input.icon ?? null, JSON.stringify(input.defaults ?? {}), input.contentJson ?? '[]', positionKey, now, now);
    return this.get(id)!;
  }
}
