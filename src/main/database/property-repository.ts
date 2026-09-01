import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  PropertyDraft,
  PropertyOption,
  PropertyOptionDraft,
  PropertyPatch,
  StatusGroup,
  StatusGroupDraft,
  WorkspaceProperty,
} from '../../shared/property-contract';

type PropertyRow = Readonly<{
  archived_at: string | null;
  config_json: string;
  created_at: string;
  database_id: string;
  default_value_json: string | null;
  id: string;
  name: string;
  position_key: string;
  required: number;
  type: WorkspaceProperty['type'];
  unique_value: number;
  updated_at: string;
}>;

type OptionRow = Readonly<{
  archived_at: string | null;
  id: string;
  label: string;
  position_key: string;
  property_id: string;
  status_group_id: string | null;
  style_json: string;
}>;

type StatusGroupRow = Readonly<{
  category: StatusGroup['category'];
  id: string;
  label: string;
  position_key: string;
  property_id: string;
}>;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class PropertyRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  createProperty(draft: PropertyDraft): WorkspaceProperty {
    const name = draft.name.trim();
    if (!name || name.length > 120) {
      throw new WorkspaceDomainError('invalid-input', 'Property name must be 1–120 characters.');
    }

    const id = draft.id ?? randomUUID();
    const now = new Date().toISOString();
    const positionKey = draft.positionKey ?? this.#nextPositionKey(draft.databaseId);
    const required = draft.required ? 1 : 0;
    const uniqueValue = draft.uniqueValue ? 1 : 0;
    const configJson = JSON.stringify(draft.config ?? {});
    const defaultValueJson = draft.defaultValueJson ?? null;

    if (draft.type === 'title') {
      const existingTitle = this.#database
        .prepare("SELECT id FROM workspace_properties WHERE database_id = ? AND type = 'title' AND archived_at IS NULL")
        .get(draft.databaseId);
      if (existingTitle) {
        throw new WorkspaceDomainError('constraint-violation', 'Database already has an active Title property.');
      }
    }

    this.#database
      .prepare(`
        INSERT INTO workspace_properties (
          id, database_id, name, type, required, unique_value, default_value_json, config_json, position_key, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(id, draft.databaseId, name, draft.type, required, uniqueValue, defaultValueJson, configJson, positionKey, now, now);

    const statusGroups: StatusGroup[] = [];
    if (draft.statusGroups && draft.statusGroups.length > 0) {
      for (const groupDraft of draft.statusGroups) {
        const group = this.createStatusGroup(id, groupDraft);
        statusGroups.push(group);
      }
    }

    const options: PropertyOption[] = [];
    if (draft.options && draft.options.length > 0) {
      for (const optDraft of draft.options) {
        const opt = this.createOption(id, optDraft);
        options.push(opt);
      }
    }

    return {
      archivedAt: null,
      config: parseJson(configJson, {}),
      createdAt: now,
      databaseId: draft.databaseId,
      defaultValueJson,
      id,
      name,
      options: options.length > 0 ? options : undefined,
      positionKey,
      required: Boolean(required),
      statusGroups: statusGroups.length > 0 ? statusGroups : undefined,
      type: draft.type,
      uniqueValue: Boolean(uniqueValue),
      updatedAt: now,
    };
  }

  getProperty(id: string): WorkspaceProperty | null {
    const row = this.#database
      .prepare('SELECT * FROM workspace_properties WHERE id = ?')
      .get(id) as PropertyRow | undefined;

    if (!row) return null;
    return this.#hydrateProperty(row);
  }

  listProperties(databaseId: string, includeArchived = false): readonly WorkspaceProperty[] {
    const sql = includeArchived
      ? 'SELECT * FROM workspace_properties WHERE database_id = ? ORDER BY position_key ASC'
      : 'SELECT * FROM workspace_properties WHERE database_id = ? AND archived_at IS NULL ORDER BY position_key ASC';

    const rows = this.#database.prepare(sql).all(databaseId) as PropertyRow[];
    return rows.map((row) => this.#hydrateProperty(row));
  }

  updateProperty(id: string, patch: PropertyPatch): WorkspaceProperty {
    const current = this.getProperty(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Property not found: ${id}`);
    }

    const name = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name || name.length > 120) {
      throw new WorkspaceDomainError('invalid-input', 'Property name must be 1–120 characters.');
    }

    const required = patch.required !== undefined ? (patch.required ? 1 : 0) : (current.required ? 1 : 0);
    const uniqueValue = patch.uniqueValue !== undefined ? (patch.uniqueValue ? 1 : 0) : (current.uniqueValue ? 1 : 0);
    const positionKey = patch.positionKey !== undefined ? patch.positionKey : current.positionKey;
    const configJson = patch.config !== undefined ? JSON.stringify(patch.config) : JSON.stringify(current.config);
    const defaultValueJson = patch.defaultValueJson !== undefined ? patch.defaultValueJson : current.defaultValueJson;
    const now = new Date().toISOString();

    this.#database
      .prepare(`
        UPDATE workspace_properties
        SET name = ?, required = ?, unique_value = ?, default_value_json = ?, config_json = ?, position_key = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(name, required, uniqueValue, defaultValueJson ?? null, configJson, positionKey, now, id);

    return this.getProperty(id)!;
  }

  archiveProperty(id: string): void {
    const current = this.getProperty(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Property not found: ${id}`);
    }
    if (current.type === 'title') {
      throw new WorkspaceDomainError('cannot-archive-title', 'Cannot archive the mandatory Title property of a database.');
    }

    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_properties SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }

  reorderProperty(id: string, targetPositionKey: string): void {
    const current = this.getProperty(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Property not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_properties SET position_key = ?, updated_at = ? WHERE id = ?')
      .run(targetPositionKey, now, id);
  }

  createOption(propertyId: string, draft: PropertyOptionDraft): PropertyOption {
    const label = draft.label.trim();
    if (!label) {
      throw new WorkspaceDomainError('invalid-input', 'Option label must not be empty.');
    }

    const id = draft.id ?? randomUUID();
    const positionKey = draft.positionKey ?? this.#nextOptionPositionKey(propertyId);
    const styleJson = JSON.stringify(draft.style ?? {});

    this.#database
      .prepare(`
        INSERT INTO workspace_property_options (id, property_id, status_group_id, label, style_json, position_key, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(id, propertyId, draft.statusGroupId ?? null, label, styleJson, positionKey);

    return {
      archivedAt: null,
      id,
      label,
      positionKey,
      propertyId,
      statusGroupId: draft.statusGroupId ?? null,
      style: parseJson(styleJson, {}),
    };
  }

  updateOption(optionId: string, patch: Partial<PropertyOptionDraft>): PropertyOption {
    const row = this.#database
      .prepare('SELECT * FROM workspace_property_options WHERE id = ?')
      .get(optionId) as OptionRow | undefined;

    if (!row) {
      throw new WorkspaceDomainError('not-found', `Property option not found: ${optionId}`);
    }

    const label = patch.label !== undefined ? patch.label.trim() : row.label;
    if (!label) {
      throw new WorkspaceDomainError('invalid-input', 'Option label must not be empty.');
    }

    const statusGroupId = patch.statusGroupId !== undefined ? patch.statusGroupId : row.status_group_id;
    const styleJson = patch.style !== undefined ? JSON.stringify(patch.style) : row.style_json;
    const positionKey = patch.positionKey !== undefined ? patch.positionKey : row.position_key;

    this.#database
      .prepare(`
        UPDATE workspace_property_options
        SET label = ?, status_group_id = ?, style_json = ?, position_key = ?
        WHERE id = ?
      `)
      .run(label, statusGroupId ?? null, styleJson, positionKey, optionId);

    return {
      archivedAt: row.archived_at,
      id: optionId,
      label,
      positionKey,
      propertyId: row.property_id,
      statusGroupId,
      style: parseJson(styleJson, {}),
    };
  }

  archiveOption(optionId: string): void {
    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_property_options SET archived_at = ? WHERE id = ?')
      .run(now, optionId);
  }

  createStatusGroup(propertyId: string, draft: StatusGroupDraft): StatusGroup {
    const label = draft.label.trim();
    if (!label) {
      throw new WorkspaceDomainError('invalid-input', 'Status group label must not be empty.');
    }

    const id = draft.id ?? randomUUID();
    const positionKey = draft.positionKey ?? generateOrderKey();

    this.#database
      .prepare(`
        INSERT INTO workspace_status_groups (id, property_id, category, label, position_key)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(id, propertyId, draft.category, label, positionKey);

    return {
      category: draft.category,
      id,
      label,
      positionKey,
      propertyId,
    };
  }

  #hydrateProperty(row: PropertyRow): WorkspaceProperty {
    const optionRows = this.#database
      .prepare('SELECT * FROM workspace_property_options WHERE property_id = ? AND archived_at IS NULL ORDER BY position_key ASC')
      .all(row.id) as OptionRow[];

    const groupRows = this.#database
      .prepare('SELECT * FROM workspace_status_groups WHERE property_id = ? ORDER BY position_key ASC')
      .all(row.id) as StatusGroupRow[];

    const options: PropertyOption[] = optionRows.map((opt) => ({
      archivedAt: opt.archived_at,
      id: opt.id,
      label: opt.label,
      positionKey: opt.position_key,
      propertyId: opt.property_id,
      statusGroupId: opt.status_group_id,
      style: parseJson(opt.style_json, {}),
    }));

    const statusGroups: StatusGroup[] = groupRows.map((g) => ({
      category: g.category,
      id: g.id,
      label: g.label,
      positionKey: g.position_key,
      propertyId: g.property_id,
    }));

    return {
      archivedAt: row.archived_at,
      config: parseJson(row.config_json, {}),
      createdAt: row.created_at,
      databaseId: row.database_id,
      defaultValueJson: row.default_value_json,
      id: row.id,
      name: row.name,
      options: options.length > 0 ? options : undefined,
      positionKey: row.position_key,
      required: Boolean(row.required),
      statusGroups: statusGroups.length > 0 ? statusGroups : undefined,
      type: row.type,
      uniqueValue: Boolean(row.unique_value),
      updatedAt: row.updated_at,
    };
  }

  #nextPositionKey(databaseId: string): string {
    const lastRow = this.#database
      .prepare('SELECT position_key FROM workspace_properties WHERE database_id = ? AND archived_at IS NULL ORDER BY position_key DESC LIMIT 1')
      .get(databaseId) as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }

  #nextOptionPositionKey(propertyId: string): string {
    const lastRow = this.#database
      .prepare('SELECT position_key FROM workspace_property_options WHERE property_id = ? AND archived_at IS NULL ORDER BY position_key DESC LIMIT 1')
      .get(propertyId) as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }
}
