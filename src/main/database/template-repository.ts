import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ObjectKind, PropertyValue } from '../../shared/object-contract';
import type { TemplateDefinition, TemplateDraft } from '../../shared/template-contract';
import { ObjectDomainError } from './object-repository';

type TemplateRow = Readonly<{
  created_at: string;
  defaults_json: string;
  field_order_json: string;
  id: string;
  name: string;
  object_kind: ObjectKind;
  position: number;
  progressive_json: string;
  updated_at: string;
}>;

function rowToTemplate(row: TemplateRow): TemplateDefinition {
  return {
    createdAt: row.created_at,
    defaults: JSON.parse(row.defaults_json) as Record<string, PropertyValue>,
    fieldOrder: JSON.parse(row.field_order_json) as string[],
    id: row.id,
    name: row.name,
    objectKind: row.object_kind,
    position: row.position,
    progressive: JSON.parse(row.progressive_json) as string[],
    updatedAt: row.updated_at,
  };
}

export class TemplateRepository {
  constructor(private readonly database: DatabaseSync) {}

  listTemplates(objectKind: ObjectKind): readonly TemplateDefinition[] {
    const rows = this.database
      .prepare(`
        SELECT id, object_kind, name, field_order_json, defaults_json, progressive_json, position, created_at, updated_at
        FROM shop_templates
        WHERE object_kind = ? AND archived_at IS NULL
        ORDER BY position, id
      `)
      .all(objectKind) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  getTemplate(id: string): TemplateDefinition {
    const row = this.database
      .prepare(`
        SELECT id, object_kind, name, field_order_json, defaults_json, progressive_json, position, created_at, updated_at
        FROM shop_templates
        WHERE id = ? AND archived_at IS NULL
      `)
      .get(id) as TemplateRow | undefined;
    if (!row) {
      throw new ObjectDomainError('not-found', 'Template not found.');
    }
    return rowToTemplate(row);
  }

  createTemplate(input: TemplateDraft): TemplateDefinition {
    const draft = this.#validateDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const positionRow = this.database
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM shop_templates WHERE object_kind = ?')
      .get(draft.objectKind) as { position: number };

    return this.#transaction(() => {
      try {
        this.database
          .prepare(`
            INSERT INTO shop_templates
              (id, object_kind, name, field_order_json, defaults_json, progressive_json, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            id,
            draft.objectKind,
            draft.name,
            JSON.stringify(draft.fieldOrder),
            JSON.stringify(draft.defaults),
            JSON.stringify(draft.progressive),
            positionRow.position,
            now,
            now,
          );
      } catch (error) {
        if (/shop_templates(?:_active_name|\.object_kind|\.name)/.test(String(error))) {
          throw new ObjectDomainError('unique', 'Template names must be unique within this schema.');
        }
        throw error;
      }

      const template = this.getTemplate(id);
      this.#writeAudit(id, 'created', template, now);
      return template;
    });
  }

  updateTemplate(id: string, input: TemplateDraft): TemplateDefinition {
    const previous = this.getTemplate(id);
    const draft = this.#validateDraft(input);
    if (draft.objectKind !== previous.objectKind) {
      throw new ObjectDomainError('schema-conflict', 'A template cannot move between Item and Person schemas.');
    }

    const now = new Date().toISOString();
    return this.#transaction(() => {
      try {
        this.database
          .prepare(`
            UPDATE shop_templates
            SET name = ?, field_order_json = ?, defaults_json = ?, progressive_json = ?, updated_at = ?
            WHERE id = ? AND archived_at IS NULL
          `)
          .run(
            draft.name,
            JSON.stringify(draft.fieldOrder),
            JSON.stringify(draft.defaults),
            JSON.stringify(draft.progressive),
            now,
            id,
          );
      } catch (error) {
        if (/shop_templates(?:_active_name|\.object_kind|\.name)/.test(String(error))) {
          throw new ObjectDomainError('unique', 'Template names must be unique within this schema.');
        }
        throw error;
      }

      const template = this.getTemplate(id);
      this.#writeAudit(id, 'updated', template, now);
      return template;
    });
  }

  archiveTemplate(id: string): void {
    const template = this.getTemplate(id);
    const now = new Date().toISOString();
    this.#transaction(() => {
      this.database
        .prepare('UPDATE shop_templates SET archived_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id);
      this.#writeAudit(id, 'archived', template, now);
    });
  }

  #validateDraft(draft: TemplateDraft): TemplateDraft {
    const name = draft.name.trim();
    if (name.length < 1 || name.length > 80) {
      throw new ObjectDomainError('invalid-input', 'Template name must contain 1–80 characters.');
    }

    const fieldOrder = [...new Set(draft.fieldOrder.map((f) => f.trim()).filter(Boolean))];
    const progressive = [...new Set(draft.progressive.map((f) => f.trim()).filter(Boolean))];
    const defaults: Record<string, PropertyValue> = {};

    for (const [key, value] of Object.entries(draft.defaults)) {
      const trimmedKey = key.trim();
      if (trimmedKey && value !== undefined && value !== '') {
        defaults[trimmedKey] = value;
      }
    }

    return {
      defaults,
      fieldOrder,
      name,
      objectKind: draft.objectKind,
      progressive,
    };
  }

  #writeAudit(entityId: string, action: 'archived' | 'created' | 'updated', snapshot: unknown, now: string): void {
    this.database
      .prepare(`
        INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
        VALUES ('template', ?, ?, 'local-user', ?, ?)
      `)
      .run(entityId, action, JSON.stringify(snapshot), now);
  }

  #transaction<T>(work: () => T): T {
    const isNested = this.database.isTransaction;
    if (!isNested) {
      this.database.exec('BEGIN IMMEDIATE;');
    }
    try {
      const result = work();
      if (!isNested) {
        this.database.exec('COMMIT;');
      }
      return result;
    } catch (error) {
      if (!isNested && this.database.isTransaction) {
        this.database.exec('ROLLBACK;');
      }
      throw error;
    }
  }
}
