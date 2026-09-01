import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  WorkspaceProperty,
  WorkspaceRecord,
  WorkspaceRecordDraft,
  WorkspaceRecordPatch,
} from '../../shared/property-contract';
import type { WorkspaceRepository } from './workspace-repository';
import type { PropertyRepository } from './property-repository';
import { parseStoredJson, valueToText } from './value-utils';
import type { WorkspaceSearchService } from './workspace-search-service';

type RecordRow = Readonly<{
  archived_at: string | null;
  content_json: string;
  created_at: string;
  database_id: string;
  icon: string | null;
  id: string;
  parent_node_id: string | null;
  position_key: string;
  revision: number;
  sequence: number;
  template_id: string | null;
  title: string;
  updated_at: string;
}>;

type ValueRow = Readonly<{
  boolean_value: number | null;
  date_end: string | null;
  date_has_time: number;
  date_start: string | null;
  json_value: string | null;
  money_minor_value: number | null;
  number_value: number | null;
  option_id: string | null;
  property_id: string;
  record_id: string;
  text_value: string | null;
}>;

export class RecordRepository {
  readonly #database: DatabaseSync;
  readonly #workspaceRepo: WorkspaceRepository;
  readonly #propertyRepo: PropertyRepository;
  readonly #search?: WorkspaceSearchService;

  constructor(
    database: DatabaseSync,
    workspaceRepo: WorkspaceRepository,
    propertyRepo: PropertyRepository,
    search?: WorkspaceSearchService,
  ) {
    this.#database = database;
    this.#workspaceRepo = workspaceRepo;
    this.#propertyRepo = propertyRepo;
    this.#search = search;
  }

  createRecord(draft: WorkspaceRecordDraft): WorkspaceRecord {
    const template = draft.templateId
      ? this.#database.prepare(`
          SELECT database_id, icon, defaults_json, content_json
          FROM workspace_record_templates WHERE id = ? AND archived_at IS NULL
        `).get(draft.templateId) as { content_json: string; database_id: string; defaults_json: string; icon: string | null } | undefined
      : undefined;
    if (draft.templateId && (!template || template.database_id !== draft.databaseId)) {
      throw new WorkspaceDomainError('invalid-input', 'The selected record template does not belong to this database.');
    }
    const id = draft.id ?? randomUUID();
    const title = draft.title.trim() || 'Untitled';
    const now = new Date().toISOString();
    const positionKey = draft.positionKey ?? this.#nextRecordPositionKey(draft.databaseId);

    // 1. Get next sequence for this database
    const seqRow = this.#database
      .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM workspace_records WHERE database_id = ?')
      .get(draft.databaseId) as { next_seq: number };
    const sequence = seqRow.next_seq;

    // 2. Create Workspace Node
    this.#workspaceRepo.createNode({
      contentJson: draft.contentJson ?? template?.content_json ?? '[]',
      icon: draft.icon ?? template?.icon,
      id,
      kind: 'record',
      parentNodeId: draft.databaseId,
      positionKey,
      title,
    });

    // 3. Insert workspace_record
    this.#database
      .prepare(`
        INSERT INTO workspace_records (id, database_id, sequence, position_key, template_id, created_at, updated_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(id, draft.databaseId, sequence, positionKey, draft.templateId ?? null, now, now);

    // 4. Save properties
    const templateDefaults = template
      ? parseStoredJson<Readonly<Record<string, unknown>>>(template.defaults_json, {})
      : {};
    const properties = { ...templateDefaults, ...(draft.properties ?? {}) };
    this.#savePropertyValues(id, draft.databaseId, properties);

    return this.#refreshSearch(id);
  }

  getRecord(id: string): WorkspaceRecord | null {
    const row = this.#database
      .prepare(`
        SELECT r.*, n.title, n.icon, n.content_json, n.parent_node_id, n.revision
        FROM workspace_records r
        JOIN workspace_nodes n ON n.id = r.id
        WHERE r.id = ?
      `)
      .get(id) as RecordRow | undefined;

    if (!row) return null;

    const propertyDefs = this.#propertyRepo.listProperties(row.database_id);
    const propMap = this.batchLoadProperties([id], propertyDefs).get(id) ?? {};

    return {
      archivedAt: row.archived_at,
      contentJson: row.content_json,
      createdAt: row.created_at,
      databaseId: row.database_id,
      icon: row.icon,
      id: row.id,
      positionKey: row.position_key,
      properties: propMap,
      revision: row.revision,
      sequence: row.sequence,
      templateId: row.template_id,
      title: row.title,
      updatedAt: row.updated_at,
    };
  }

  listRecords(databaseId: string, includeArchived = false): readonly WorkspaceRecord[] {
    const sql = includeArchived
      ? `
        SELECT r.*, n.title, n.icon, n.content_json, n.parent_node_id, n.revision
        FROM workspace_records r
        JOIN workspace_nodes n ON n.id = r.id
        WHERE r.database_id = ?
        ORDER BY r.position_key ASC
      `
      : `
        SELECT r.*, n.title, n.icon, n.content_json, n.parent_node_id, n.revision
        FROM workspace_records r
        JOIN workspace_nodes n ON n.id = r.id
        WHERE r.database_id = ? AND r.archived_at IS NULL
        ORDER BY r.position_key ASC
      `;

    const rows = this.#database.prepare(sql).all(databaseId) as RecordRow[];
    if (rows.length === 0) return [];

    const recordIds = rows.map((r) => r.id);
    const propertyDefs = this.#propertyRepo.listProperties(databaseId);
    const propertyData = this.batchLoadProperties(recordIds, propertyDefs);

    return rows.map((row) => ({
      archivedAt: row.archived_at,
      contentJson: row.content_json,
      createdAt: row.created_at,
      databaseId: row.database_id,
      icon: row.icon,
      id: row.id,
      positionKey: row.position_key,
      properties: propertyData.get(row.id) ?? {},
      revision: row.revision,
      sequence: row.sequence,
      templateId: row.template_id,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  }

  updateRecord(id: string, patch: WorkspaceRecordPatch): WorkspaceRecord {
    const current = this.getRecord(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Record not found: ${id}`);
    }

    if (patch.title !== undefined || patch.icon !== undefined || patch.positionKey !== undefined) {
      this.#workspaceRepo.updateNode(id, {
        icon: patch.icon,
        positionKey: patch.positionKey,
        title: patch.title,
      });
    }

    const now = new Date().toISOString();
    const positionKey = patch.positionKey !== undefined ? patch.positionKey : current.positionKey;
    const templateId = patch.templateId !== undefined ? patch.templateId : current.templateId;

    this.#database
      .prepare('UPDATE workspace_records SET position_key = ?, template_id = ?, updated_at = ? WHERE id = ?')
      .run(positionKey, templateId ?? null, now, id);

    if (patch.properties) {
      this.#savePropertyValues(id, current.databaseId, patch.properties, false);
    }

    return this.#refreshSearch(id);
  }

  updateProperty(recordId: string, propertyId: string, value: unknown): WorkspaceRecord {
    const record = this.getRecord(recordId);
    if (!record) {
      throw new WorkspaceDomainError('not-found', `Record not found: ${recordId}`);
    }

    const property = this.#propertyRepo.getProperty(propertyId);
    if (!property) {
      throw new WorkspaceDomainError('not-found', `Property not found: ${propertyId}`);
    }

    if (property.type === 'title') {
      const titleStr = valueToText(value).trim();
      this.#workspaceRepo.updateNode(recordId, { title: titleStr || 'Untitled' });
      return this.#refreshSearch(recordId);
    }

    this.#saveSinglePropertyValue(recordId, property, value);

    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_records SET updated_at = ? WHERE id = ?')
      .run(now, recordId);

    return this.#refreshSearch(recordId);
  }

  archiveRecord(id: string): void {
    const current = this.getRecord(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Record not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.#database.prepare('UPDATE workspace_records SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.#workspaceRepo.archiveNode(id);
  }

  restoreRecord(id: string): void {
    const current = this.getRecord(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Record not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.#database.prepare('UPDATE workspace_records SET archived_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
    this.#workspaceRepo.restoreNode(id);
    this.#refreshSearch(id);
  }

  batchCreateRecords(drafts: readonly WorkspaceRecordDraft[]): readonly WorkspaceRecord[] {
    return drafts.map((d) => this.createRecord(d));
  }

  #refreshSearch(id: string): WorkspaceRecord {
    const record = this.getRecord(id)!;
    if (this.#search) {
      const databaseTitle = this.#workspaceRepo.getNode(record.databaseId)?.title ?? '';
      this.#search.indexRecord(record, this.#propertyRepo.listProperties(record.databaseId), databaseTitle);
    }
    return record;
  }

  batchLoadProperties(
    recordIds: readonly string[],
    propertyDefs: readonly WorkspaceProperty[],
  ): Map<string, Record<string, unknown>> {
    const result = new Map<string, Record<string, unknown>>();
    if (recordIds.length === 0) return result;

    for (const recordId of recordIds) {
      result.set(recordId, {});
    }

    const propById = new Map<string, WorkspaceProperty>();
    for (const p of propertyDefs) {
      propById.set(p.id, p);
    }

    // Chunk record IDs for SQLite limits if necessary
    const chunkSize = 500;
    for (let i = 0; i < recordIds.length; i += chunkSize) {
      const chunk = recordIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      // 1. Load scalar values
      const valRows = this.#database
        .prepare(`SELECT * FROM workspace_property_values WHERE record_id IN (${placeholders})`)
        .all(...chunk) as ValueRow[];

      for (const row of valRows) {
        const recordProps = result.get(row.record_id);
        if (!recordProps) continue;

        const prop = propById.get(row.property_id);
        if (!prop) continue;

        let val: unknown = null;
        switch (prop.type) {
          case 'number':
            val = row.number_value;
            break;
          case 'money':
            val = row.money_minor_value !== null ? row.money_minor_value / 100 : null;
            break;
          case 'checkbox':
            val = row.boolean_value !== null ? Boolean(row.boolean_value) : false;
            break;
          case 'date':
            val = row.date_start ? { hasTime: Boolean(row.date_has_time), start: row.date_start } : null;
            break;
          case 'select':
          case 'status':
            val = row.option_id;
            break;
          case 'text':
          case 'url':
          case 'email':
          case 'phone':
            val = row.text_value;
            break;
          default:
            val = row.json_value ? JSON.parse(row.json_value) : row.text_value;
        }

        recordProps[row.property_id] = val;
      }

      // 2. Load multi-select values
      const multiRows = this.#database
        .prepare(`
          SELECT record_id, property_id, option_id
          FROM workspace_multi_select_values
          WHERE record_id IN (${placeholders})
          ORDER BY position_key ASC
        `)
        .all(...chunk) as { option_id: string; property_id: string; record_id: string }[];

      for (const row of multiRows) {
        const recordProps = result.get(row.record_id);
        if (!recordProps) continue;

        if (!Array.isArray(recordProps[row.property_id])) {
          recordProps[row.property_id] = [];
        }
        (recordProps[row.property_id] as string[]).push(row.option_id);
      }
    }

    return result;
  }

  #savePropertyValues(
    recordId: string,
    databaseId: string,
    properties: Readonly<Record<string, unknown>>,
    overwriteAll = true,
  ): void {
    const propertyDefs = this.#propertyRepo.listProperties(databaseId);
    const propertyIds = new Set(propertyDefs.map((property) => property.id));
    for (const propertyId of Object.keys(properties)) {
      if (!propertyIds.has(propertyId)) {
        throw new WorkspaceDomainError('invalid-input', `Property ${propertyId} does not belong to database ${databaseId}.`, propertyId);
      }
    }

    for (const prop of propertyDefs) {
      if (prop.type === 'title') continue;

      if (properties[prop.id] !== undefined) {
        this.#saveSinglePropertyValue(recordId, prop, properties[prop.id]);
      } else if (overwriteAll && prop.defaultValueJson) {
        const defaultVal = parseStoredJson<unknown>(prop.defaultValueJson, null);
        this.#saveSinglePropertyValue(recordId, prop, defaultVal);
      } else if (overwriteAll && prop.required && !['formula', 'relation', 'rollup'].includes(prop.type)) {
        throw new WorkspaceDomainError('constraint-violation', `${prop.name} is required.`, prop.id);
      }
    }
  }

  #saveSinglePropertyValue(recordId: string, property: WorkspaceProperty, value: unknown): void {
    const now = new Date().toISOString();

    if (['relation', 'rollup', 'formula', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by'].includes(property.type)) {
      if (value !== undefined && value !== null && value !== '') {
        throw new WorkspaceDomainError(
          'constraint-violation',
          `${property.name} is derived or managed through its dedicated API and cannot be stored directly.`,
          property.id,
        );
      }
      return;
    }

    if (property.required && (value === undefined || value === null || value === '')) {
      throw new WorkspaceDomainError('constraint-violation', `${property.name} is required.`);
    }

    if (property.type === 'multi_select') {
      this.#database
        .prepare('DELETE FROM workspace_multi_select_values WHERE record_id = ? AND property_id = ?')
        .run(recordId, property.id);

      if (Array.isArray(value)) {
        for (const [idx, optId] of value.entries()) {
          if (typeof optId === 'string' && optId.trim()) {
            const option = this.#database.prepare(
              'SELECT 1 FROM workspace_property_options WHERE id = ? AND property_id = ? AND archived_at IS NULL',
            ).get(optId.trim(), property.id);
            if (!option) throw new WorkspaceDomainError('invalid-input', `Invalid option for ${property.name}.`, property.id);
            const pos = generateOrderKey(idx > 0 ? String(idx - 1) : null, null);
            this.#database
              .prepare(`
                INSERT INTO workspace_multi_select_values (record_id, property_id, option_id, position_key)
                VALUES (?, ?, ?, ?)
              `)
              .run(recordId, property.id, optId.trim(), pos);
          }
        }
      }
      return;
    }

    let textVal: string | null = null;
    let numVal: number | null = null;
    let moneyMinor: number | null = null;
    let boolVal: number | null = null;
    let dateStart: string | null = null;
    let dateEnd: string | null = null;
    let dateHasTime = 0;
    let optionId: string | null = null;
    let jsonVal: string | null = null;

    if (value !== undefined && value !== null && value !== '') {
      switch (property.type) {
        case 'number':
          numVal = typeof value === 'number' ? value : Number(value);
          if (!Number.isFinite(numVal)) numVal = null;
          break;
        case 'money': {
          const mNum = typeof value === 'number' ? value : Number(value);
          if (Number.isFinite(mNum)) {
            moneyMinor = Math.round(mNum * 100);
          }
          break;
        }
        case 'checkbox':
          boolVal = value ? 1 : 0;
          break;
        case 'date':
          if (typeof value === 'string') {
            dateStart = value;
          } else if (typeof value === 'object' && value !== null) {
            const dObj = value as { end?: string; hasTime?: boolean; start?: string };
            dateStart = dObj.start ?? null;
            dateEnd = dObj.end ?? null;
            dateHasTime = dObj.hasTime ? 1 : 0;
          }
          break;
        case 'select':
        case 'status':
          optionId = typeof value === 'string' ? value : null;
          if (optionId) {
            const option = this.#database.prepare(
              'SELECT 1 FROM workspace_property_options WHERE id = ? AND property_id = ? AND archived_at IS NULL',
            ).get(optionId, property.id);
            if (!option) throw new WorkspaceDomainError('invalid-input', `Invalid option for ${property.name}.`, property.id);
          }
          break;
        case 'text':
        case 'url':
        case 'email':
        case 'phone':
        case 'auto_id':
          textVal = valueToText(value);
          break;
        default:
          if (typeof value === 'object') {
            jsonVal = JSON.stringify(value);
          } else {
            textVal = valueToText(value);
          }
      }
    }

    // Enforce unique property values if enabled
    if (property.uniqueValue && (textVal !== null || numVal !== null || moneyMinor !== null)) {
      const existing = this.#database
        .prepare(`
          SELECT record_id FROM workspace_property_values
          WHERE property_id = ? AND record_id != ? AND (
            (text_value = ? AND ? IS NOT NULL) OR
            (number_value = ? AND ? IS NOT NULL) OR
            (money_minor_value = ? AND ? IS NOT NULL)
          )
        `)
        .get(
          property.id,
          recordId,
          textVal,
          textVal,
          numVal,
          numVal,
          moneyMinor,
          moneyMinor,
        );

      if (existing) {
        throw new WorkspaceDomainError('duplicate-value', `${property.name} must be unique.`);
      }
    }

    this.#database
      .prepare(`
        INSERT INTO workspace_property_values (
          record_id, property_id, text_value, number_value, money_minor_value, boolean_value,
          date_start, date_end, date_has_time, option_id, json_value, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(record_id, property_id) DO UPDATE SET
          text_value = excluded.text_value,
          number_value = excluded.number_value,
          money_minor_value = excluded.money_minor_value,
          boolean_value = excluded.boolean_value,
          date_start = excluded.date_start,
          date_end = excluded.date_end,
          date_has_time = excluded.date_has_time,
          option_id = excluded.option_id,
          json_value = excluded.json_value,
          updated_at = excluded.updated_at
      `)
      .run(
        recordId,
        property.id,
        textVal,
        numVal,
        moneyMinor,
        boolVal,
        dateStart,
        dateEnd,
        dateHasTime,
        optionId,
        jsonVal,
        now,
      );
  }

  #nextRecordPositionKey(databaseId: string): string {
    const lastRow = this.#database
      .prepare('SELECT position_key FROM workspace_records WHERE database_id = ? AND archived_at IS NULL ORDER BY position_key DESC LIMIT 1')
      .get(databaseId) as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }
}
