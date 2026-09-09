import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  AuditEntry,
  ConfigurableRecord,
  ConfigurableRecordDraft,
  ObjectErrorCode,
  ObjectKind,
  PropertyDefinition,
  PropertyDraft,
  PropertyRules,
  PropertyValue,
  SemanticRole,
} from '../../shared/object-contract';

type PropertyRow = Readonly<{
  created_at: string;
  id: string;
  name: string;
  object_kind: ObjectKind;
  position: number;
  property_type: PropertyDefinition['type'];
  rules_json: string;
  semantic_role: SemanticRole | null;
  updated_at: string;
}>;

type RecordRow = Readonly<{
  created_at: string;
  current_quantity: number | null;
  id: string;
  label: string;
  object_kind: ObjectKind;
  position: number;
  template_id: string | null;
  updated_at: string;
}>;

export class ObjectDomainError extends Error {
  constructor(
    readonly code: ObjectErrorCode,
    message: string,
    readonly propertyId?: string,
  ) {
    super(message);
    this.name = 'ObjectDomainError';
  }
}

function requiredError(property: PropertyDefinition): ObjectDomainError {
  return new ObjectDomainError('required', `${property.name} is required.`, property.id);
}

function invalidPropertyError(property: PropertyDefinition, detail: string): ObjectDomainError {
  return new ObjectDomainError('invalid-input', `${property.name}: ${detail}`, property.id);
}

function normalizeRules(draft: PropertyDraft): PropertyRules {
  const choices = [...new Set(draft.rules.choices.map((choice) => choice.trim()).filter(Boolean))];
  const rules: PropertyRules = {
    choices: draft.type === 'select' || draft.type === 'status' ? choices : [],
    digitsOnly: draft.type === 'text' && draft.rules.digitsOnly,
    required: draft.rules.required,
    unique: draft.rules.unique,
    ...(draft.type === 'number'
      ? { maximum: draft.rules.maximum, minimum: draft.rules.minimum }
      : {}),
    ...(draft.type === 'text'
      ? {
          exactDigits: draft.rules.exactDigits,
          maximumLength: draft.rules.maximumLength,
          minimumLength: draft.rules.minimumLength,
        }
      : {}),
    ...(draft.type === 'relation' ? { relationTarget: draft.rules.relationTarget } : {}),
  };

  return rules;
}

function validatePropertyDraft(draft: PropertyDraft): PropertyDraft {
  const name = draft.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new ObjectDomainError('invalid-input', 'Property names must contain 1–80 characters.');
  }

  const rules = normalizeRules(draft);
  if ((draft.type === 'select' || draft.type === 'status') && rules.choices.length === 0) {
    throw new ObjectDomainError('invalid-input', 'Select and status properties need at least one allowed choice.');
  }
  if (draft.type === 'relation' && !rules.relationTarget) {
    throw new ObjectDomainError('invalid-input', 'Relation properties need an Item or Person target.');
  }
  if (draft.semanticRole) {
    if (draft.objectKind !== 'item') {
      throw new ObjectDomainError('invalid-input', 'Semantic roles are available only for item properties.');
    }
    const compatible = draft.semanticRole === 'DISPLAY_NAME'
      ? ['text', 'select', 'status'].includes(draft.type)
      : draft.semanticRole === 'PRICE'
        ? ['number'].includes(draft.type)
        : draft.type === 'number';
    if (!compatible) {
      throw new ObjectDomainError('invalid-input', `${draft.semanticRole} is not compatible with ${draft.type}.`);
    }
  }
  if (rules.minimum !== undefined && (!Number.isFinite(rules.minimum))) {
    throw new ObjectDomainError('invalid-input', 'Minimum must be a finite number.');
  }
  if (rules.maximum !== undefined && (!Number.isFinite(rules.maximum))) {
    throw new ObjectDomainError('invalid-input', 'Maximum must be a finite number.');
  }
  if (rules.minimum !== undefined && rules.maximum !== undefined && rules.minimum > rules.maximum) {
    throw new ObjectDomainError('invalid-input', 'Minimum cannot be greater than maximum.');
  }
  for (const length of [rules.minimumLength, rules.maximumLength]) {
    if (length !== undefined && (!Number.isInteger(length) || length < 0 || length > 10_000)) {
      throw new ObjectDomainError('invalid-input', 'Length limits must be whole numbers between 0 and 10,000.');
    }
  }
  if (rules.exactDigits !== undefined && (!Number.isInteger(rules.exactDigits) || rules.exactDigits < 1 || rules.exactDigits > 10_000)) {
    throw new ObjectDomainError('invalid-input', 'Number of digits must be a whole number between 1 and 10,000.');
  }
  if (
    rules.minimumLength !== undefined &&
    rules.maximumLength !== undefined &&
    rules.minimumLength > rules.maximumLength
  ) {
    throw new ObjectDomainError('invalid-input', 'Minimum length cannot be greater than maximum length.');
  }

  return { ...draft, name, rules, semanticRole: draft.semanticRole };
}

function rowToProperty(row: PropertyRow): PropertyDefinition {
  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    objectKind: row.object_kind,
    position: row.position,
    rules: JSON.parse(row.rules_json) as PropertyRules,
    semanticRole: row.semantic_role ?? undefined,
    type: row.property_type,
    updatedAt: row.updated_at,
  };
}

function canonicalValue(value: PropertyValue): string {
  if (typeof value === 'string') return value.normalize('NFKC').trim().toLocaleLowerCase('und');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export class ObjectRepository {
  constructor(private readonly database: DatabaseSync) {}

  listProperties(objectKind: ObjectKind): readonly PropertyDefinition[] {
    return (this.database
      .prepare(`
        SELECT id, object_kind, name, property_type, rules_json, semantic_role, position, created_at, updated_at
        FROM object_properties
        WHERE object_kind = ? AND archived_at IS NULL
        ORDER BY position, id
      `)
      .all(objectKind) as PropertyRow[]).map(rowToProperty);
  }

  createProperty(input: PropertyDraft): PropertyDefinition {
    const draft = validatePropertyDraft(input);
    if (draft.rules.required) {
      const existing = this.database
        .prepare('SELECT id FROM object_records WHERE object_kind = ? AND archived_at IS NULL LIMIT 1')
        .get(draft.objectKind);
      if (existing) {
        throw new ObjectDomainError(
          'schema-conflict',
          'A required property cannot be added while existing records would have no value.',
        );
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const positionRow = this.database
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM object_properties WHERE object_kind = ?')
      .get(draft.objectKind) as { position: number };

    return this.#transaction(() => {
      try {
        this.database
          .prepare(`
            INSERT INTO object_properties
              (id, object_kind, name, property_type, rules_json, semantic_role, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(id, draft.objectKind, draft.name, draft.type, JSON.stringify(draft.rules), draft.semanticRole ?? null, positionRow.position, now, now);
      } catch (error) {
        if (/semantic_role/.test(String(error))) {
          throw new ObjectDomainError('schema-conflict', `Only one active ${draft.semanticRole} property is allowed.`);
        }
        if (/object_properties(?:_active_name|\.object_kind|\.name)/.test(String(error))) {
          throw new ObjectDomainError('unique', 'Property names must be unique within this schema.');
        }
        throw error;
      }
      const property = this.#getProperty(id);
      this.#writeAudit('property', id, 'created', property, now);
      return property;
    });
  }

  updateProperty(id: string, input: PropertyDraft): PropertyDefinition {
    const previous = this.#getProperty(id);
    const draft = validatePropertyDraft(input);
    if (draft.objectKind !== previous.objectKind) {
      throw new ObjectDomainError('schema-conflict', 'A property cannot move between Item and Person schemas.');
    }

    const existingRecords = this.listRecords(previous.objectKind);
    const normalizedByRecord = new Map<string, string>();
    const seenUniqueValues = new Set<string>();
    const candidate: PropertyDefinition = { ...previous, ...draft, updatedAt: new Date().toISOString() };

    for (const record of existingRecords) {
      const value = record.values[id];
      const normalized = this.#validateValue(candidate, value);
      if (normalized !== null) {
        if (seenUniqueValues.has(normalized)) {
          throw new ObjectDomainError('schema-conflict', 'Existing values conflict with the new uniqueness rule.', id);
        }
        seenUniqueValues.add(normalized);
        normalizedByRecord.set(record.id, normalized);
      }
    }

    const now = new Date().toISOString();
    return this.#transaction(() => {
      try {
        this.database
          .prepare(`
            UPDATE object_properties
            SET name = ?, property_type = ?, rules_json = ?, semantic_role = ?, updated_at = ?
            WHERE id = ? AND archived_at IS NULL
          `)
          .run(draft.name, draft.type, JSON.stringify(draft.rules), draft.semanticRole ?? null, now, id);
      } catch (error) {
        if (/semantic_role/.test(String(error))) {
          throw new ObjectDomainError('schema-conflict', `Only one active ${draft.semanticRole} property is allowed.`);
        }
        if (/object_properties(?:_active_name|\.object_kind|\.name)/.test(String(error))) {
          throw new ObjectDomainError('unique', 'Property names must be unique within this schema.');
        }
        throw error;
      }

      const updateValue = this.database.prepare(`
        UPDATE object_property_values SET normalized_value = ?, updated_at = ?
        WHERE record_id = ? AND property_id = ? AND active = 1
      `);
      for (const record of existingRecords) {
        if (record.values[id] !== undefined) {
          updateValue.run(normalizedByRecord.get(record.id) ?? null, now, record.id, id);
        }
      }

      if (draft.semanticRole === 'QUANTITY') {
        for (const record of existingRecords) {
          const value = record.values[id];
          if (typeof value === 'number') {
            this.#setInventoryQuantity(record.id, value, record.currentQuantity, now, 'opening');
          }
        }
      }

      const property = this.#getProperty(id);
      this.#writeAudit('property', id, 'updated', property, now);
      return property;
    });
  }

  archiveProperty(id: string): void {
    const property = this.#getProperty(id);
    const now = new Date().toISOString();
    this.#transaction(() => {
      this.database.prepare('UPDATE object_properties SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      this.database.prepare('UPDATE object_property_values SET active = 0, updated_at = ? WHERE property_id = ?').run(now, id);
      if (property.semanticRole === 'QUANTITY') {
        this.database.prepare("UPDATE object_records SET current_quantity = NULL, updated_at = ? WHERE object_kind = 'item' AND archived_at IS NULL").run(now);
      }
      this.#writeAudit('property', id, 'archived', property, now);
    });
  }

  listRecords(objectKind: ObjectKind): readonly ConfigurableRecord[] {
    const records = this.database
      .prepare(`
        SELECT id, object_kind, label, template_id, current_quantity, position, created_at, updated_at
        FROM object_records
        WHERE object_kind = ? AND archived_at IS NULL
        ORDER BY position, label COLLATE NOCASE, id
      `)
      .all(objectKind) as RecordRow[];
    if (records.length === 0) return [];

    const values = this.database
      .prepare(`
        SELECT values_table.record_id, values_table.property_id, values_table.value_json
        FROM object_property_values AS values_table
        JOIN object_records AS records ON records.id = values_table.record_id
        JOIN object_properties AS properties ON properties.id = values_table.property_id
        WHERE records.object_kind = ?
          AND records.archived_at IS NULL
          AND properties.archived_at IS NULL
          AND values_table.active = 1
      `)
      .all(objectKind) as { property_id: string; record_id: string; value_json: string }[];
    const valuesByRecord = new Map<string, Record<string, PropertyValue>>();
    for (const value of values) {
      const recordValues = valuesByRecord.get(value.record_id) ?? {};
      recordValues[value.property_id] = JSON.parse(value.value_json) as PropertyValue;
      valuesByRecord.set(value.record_id, recordValues);
    }

    return records.map((record) => ({
      createdAt: record.created_at,
      currentQuantity: record.current_quantity ?? undefined,
      id: record.id,
      label: record.label,
      objectKind: record.object_kind,
      position: record.position,
      templateId: record.template_id ?? undefined,
      updatedAt: record.updated_at,
      values: valuesByRecord.get(record.id) ?? {},
    }));
  }

  createRecord(input: ConfigurableRecordDraft): ConfigurableRecord {
    const draft = this.#validateRecordDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const position = (this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM object_records WHERE object_kind = ? AND archived_at IS NULL').get(draft.objectKind) as { position: number }).position;
    return this.#transaction(() => {
      this.database
        .prepare('INSERT INTO object_records (id, object_kind, label, template_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, draft.objectKind, draft.label, draft.templateId ?? null, position, now, now);
      this.#writeValues(id, draft, now);
      this.#syncInventoryFromDraft(id, draft, undefined, now);
      const record = this.#getRecord(id);
      this.#writeAudit('record', id, 'created', record, now);
      return record;
    });
  }

  updateRecord(id: string, input: ConfigurableRecordDraft): ConfigurableRecord {
    const previous = this.#getRecord(id);
    const draft = this.#validateRecordDraft(input, id);
    if (draft.objectKind !== previous.objectKind) {
      throw new ObjectDomainError('schema-conflict', 'A record cannot move between Item and Person.');
    }

    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.database.prepare('UPDATE object_records SET label = ?, template_id = ?, updated_at = ? WHERE id = ?').run(draft.label, draft.templateId ?? null, now, id);
      this.database.prepare('UPDATE object_property_values SET active = 0, updated_at = ? WHERE record_id = ?').run(now, id);
      this.#writeValues(id, draft, now);
      this.#syncInventoryFromDraft(id, draft, previous.currentQuantity, now);
      const record = this.#getRecord(id);
      this.#writeAudit('record', id, 'updated', record, now);
      return record;
    });
  }

  archiveRecord(id: string): void {
    const record = this.#getRecord(id);
    const now = new Date().toISOString();
    this.#transaction(() => {
      this.database.prepare('UPDATE object_records SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      this.database.prepare('UPDATE object_property_values SET active = 0, updated_at = ? WHERE record_id = ?').run(now, id);
      this.#writeAudit('record', id, 'archived', record, now);
    });
  }

  reorderRecords(objectKind: ObjectKind, orderedIds: readonly string[]): void {
    const current = this.listRecords(objectKind);
    if (orderedIds.length !== current.length || new Set(orderedIds).size !== orderedIds.length) {
      throw new ObjectDomainError('invalid-input', 'Record order must include every active record exactly once.');
    }
    const currentIds = new Set(current.map((record) => record.id));
    if (orderedIds.some((id) => !currentIds.has(id))) {
      throw new ObjectDomainError('invalid-input', 'Record order contains an unknown record.');
    }
    const now = new Date().toISOString();
    this.#transaction(() => {
      const update = this.database.prepare('UPDATE object_records SET position = ?, updated_at = ? WHERE id = ? AND object_kind = ? AND archived_at IS NULL');
      orderedIds.forEach((id, position) => update.run(position, now, id, objectKind));
      orderedIds.forEach((id) => this.#writeAudit('record', id, 'updated', this.#getRecord(id), now));
    });
  }

  listAudit(entityId: string): readonly AuditEntry[] {
    return (this.database
      .prepare(`
        SELECT id, action, actor, snapshot_json, created_at
        FROM object_audit_log WHERE entity_id = ? ORDER BY id DESC
      `)
      .all(entityId) as {
      action: AuditEntry['action'];
      actor: AuditEntry['actor'];
      created_at: string;
      id: number;
      snapshot_json: string;
    }[]).map((entry) => ({
      action: entry.action,
      actor: entry.actor,
      createdAt: entry.created_at,
      id: entry.id,
      snapshot: JSON.parse(entry.snapshot_json) as unknown,
    }));
  }

  #getProperty(id: string): PropertyDefinition {
    const row = this.database
      .prepare(`
        SELECT id, object_kind, name, property_type, rules_json, semantic_role, position, created_at, updated_at
        FROM object_properties WHERE id = ? AND archived_at IS NULL
      `)
      .get(id) as PropertyRow | undefined;
    if (!row) throw new ObjectDomainError('not-found', 'Property not found.');
    return rowToProperty(row);
  }

  #getRecord(id: string): ConfigurableRecord {
    const row = this.database
      .prepare(`
        SELECT id, object_kind, label, template_id, current_quantity, position, created_at, updated_at
        FROM object_records WHERE id = ? AND archived_at IS NULL
      `)
      .get(id) as RecordRow | undefined;
    if (!row) throw new ObjectDomainError('not-found', 'Record not found.');
    const values = this.database
      .prepare('SELECT property_id, value_json FROM object_property_values WHERE record_id = ? AND active = 1')
      .all(id) as { property_id: string; value_json: string }[];
    return {
      createdAt: row.created_at,
      currentQuantity: row.current_quantity ?? undefined,
      id: row.id,
      label: row.label,
      objectKind: row.object_kind,
      position: row.position,
      templateId: row.template_id ?? undefined,
      updatedAt: row.updated_at,
      values: Object.fromEntries(values.map((value) => [value.property_id, JSON.parse(value.value_json) as PropertyValue])),
    };
  }

  #validateRecordDraft(input: ConfigurableRecordDraft, excludingRecordId?: string): ConfigurableRecordDraft {
    const label = input.label.trim();
    if (label.length < 1 || label.length > 120) {
      throw new ObjectDomainError('invalid-input', 'A display name between 1 and 120 characters is required.');
    }

    if (input.templateId !== undefined) {
      const template = this.database
        .prepare('SELECT id FROM shop_templates WHERE id = ? AND object_kind = ?')
        .get(input.templateId, input.objectKind);
      if (!template) throw new ObjectDomainError('invalid-input', 'The selected template does not belong to this record type.');
    }

    const properties = this.listProperties(input.objectKind);
    const propertiesById = new Map(properties.map((property) => [property.id, property]));
    for (const propertyId of Object.keys(input.values)) {
      if (!propertiesById.has(propertyId)) {
        throw new ObjectDomainError('invalid-input', 'The record contains a property outside its active schema.', propertyId);
      }
    }

    const values: Record<string, PropertyValue> = {};
    for (const property of properties) {
      const candidate = input.values[property.id];
      const value = typeof candidate === 'string' && candidate.trim() === '' ? undefined : candidate;
      const normalized = this.#validateValue(property, value);
      if (value !== undefined) {
        if (normalized !== null) this.#assertUniqueAvailable(property, normalized, excludingRecordId);
        values[property.id] = value;
      }
    }
    return { label, objectKind: input.objectKind, templateId: input.templateId, values };
  }

  #validateValue(property: PropertyDefinition, value: PropertyValue | undefined): string | null {
    if (value === undefined) {
      if (property.rules.required) throw requiredError(property);
      return null;
    }

    switch (property.type) {
      case 'text': {
        if (typeof value !== 'string') throw invalidPropertyError(property, 'enter text.');
        if (property.rules.exactDigits !== undefined && (!/^\d+$/.test(value) || value.length !== property.rules.exactDigits)) {
          throw invalidPropertyError(property, `use exactly ${property.rules.exactDigits} digits.`);
        }
        if (property.rules.digitsOnly && !/^\d+$/.test(value)) {
          throw invalidPropertyError(property, 'use digits only.');
        }
        if (property.rules.minimumLength !== undefined && value.length < property.rules.minimumLength) {
          throw invalidPropertyError(property, `use at least ${property.rules.minimumLength} characters.`);
        }
        if (property.rules.maximumLength !== undefined && value.length > property.rules.maximumLength) {
          throw invalidPropertyError(property, `use no more than ${property.rules.maximumLength} characters.`);
        }
        break;
      }
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidPropertyError(property, 'enter a valid number.');
        if (property.rules.minimum !== undefined && value < property.rules.minimum) {
          throw invalidPropertyError(property, `the minimum is ${property.rules.minimum}.`);
        }
        if (property.rules.maximum !== undefined && value > property.rules.maximum) {
          throw invalidPropertyError(property, `the maximum is ${property.rules.maximum}.`);
        }
        if (property.semanticRole === 'QUANTITY' && (!Number.isInteger(value) || value < 0)) {
          throw invalidPropertyError(property, 'enter a non-negative whole quantity.');
        }
        if (property.semanticRole === 'PRICE' && value < 0) {
          throw invalidPropertyError(property, 'enter a non-negative price.');
        }
        break;
      }
      case 'date':
        if (typeof value !== 'string' || !isValidDate(value)) throw invalidPropertyError(property, 'enter a valid date.');
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') throw invalidPropertyError(property, 'choose checked or unchecked.');
        break;
      case 'select':
      case 'status':
        if (typeof value !== 'string' || !property.rules.choices.includes(value)) {
          throw invalidPropertyError(property, 'choose an allowed value.');
        }
        break;
      case 'relation': {
        if (typeof value !== 'string') throw invalidPropertyError(property, 'choose a related record.');
        const target = this.database
          .prepare('SELECT id FROM object_records WHERE id = ? AND object_kind = ? AND archived_at IS NULL')
          .get(value, property.rules.relationTarget ?? null);
        if (!target) throw new ObjectDomainError('relation-not-found', `${property.name}: related record not found.`, property.id);
        break;
      }
    }

    return property.rules.unique ? canonicalValue(value) : null;
  }

  #assertUniqueAvailable(property: PropertyDefinition, normalized: string, excludingRecordId?: string): void {
    const conflict = this.database
      .prepare(`
        SELECT record_id FROM object_property_values
        WHERE property_id = ? AND normalized_value = ? AND active = 1 AND record_id != COALESCE(?, '')
        LIMIT 1
      `)
      .get(property.id, normalized, excludingRecordId ?? null);
    if (conflict) throw new ObjectDomainError('unique', `${property.name} must be unique.`, property.id);
  }

  #writeValues(recordId: string, draft: ConfigurableRecordDraft, now: string): void {
    const propertiesById = new Map(this.listProperties(draft.objectKind).map((property) => [property.id, property]));
    const upsert = this.database.prepare(`
      INSERT INTO object_property_values
        (record_id, property_id, value_json, normalized_value, active, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT (record_id, property_id) DO UPDATE SET
        value_json = excluded.value_json,
        normalized_value = excluded.normalized_value,
        active = 1,
        updated_at = excluded.updated_at
    `);
    for (const [propertyId, value] of Object.entries(draft.values)) {
      const property = propertiesById.get(propertyId);
      if (!property) throw new ObjectDomainError('invalid-input', 'Unknown property.', propertyId);
      upsert.run(recordId, propertyId, JSON.stringify(value), property.rules.unique ? canonicalValue(value) : null, now);
    }
  }

  #syncInventoryFromDraft(
    recordId: string,
    draft: ConfigurableRecordDraft,
    previousQuantity: number | undefined,
    now: string,
  ): void {
    if (draft.objectKind !== 'item') return;
    const quantityProperty = this.listProperties('item').find((property) => property.semanticRole === 'QUANTITY');
    if (!quantityProperty) return;
    const quantity = draft.values[quantityProperty.id];
    if (typeof quantity !== 'number') {
      this.database.prepare('UPDATE object_records SET current_quantity = NULL WHERE id = ?').run(recordId);
      return;
    }
    this.#setInventoryQuantity(recordId, quantity, previousQuantity, now, previousQuantity === undefined ? 'opening' : 'adjustment');
  }

  #setInventoryQuantity(
    recordId: string,
    quantity: number,
    previousQuantity: number | undefined,
    now: string,
    reason: 'adjustment' | 'opening',
  ): void {
    const normalized = Math.round(quantity);
    this.database.prepare('UPDATE object_records SET current_quantity = ? WHERE id = ?').run(normalized, recordId);
    const delta = normalized - (previousQuantity ?? 0);
    if (delta !== 0) {
      this.database
        .prepare('INSERT INTO inventory_movements (item_id, operation_id, quantity_delta, reason, created_at) VALUES (?, NULL, ?, ?, ?)')
        .run(recordId, delta, reason, now);
    }
  }

  #writeAudit(
    entityType: 'property' | 'record',
    entityId: string,
    action: AuditEntry['action'],
    snapshot: unknown,
    now: string,
  ): void {
    this.database
      .prepare(`
        INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
        VALUES (?, ?, ?, 'local-user', ?, ?)
      `)
      .run(entityType, entityId, action, JSON.stringify(snapshot), now);
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
