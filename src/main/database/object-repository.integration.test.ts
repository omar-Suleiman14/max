import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import type {
  ObjectKind,
  PropertyDraft,
  PropertyType,
} from '../../shared/object-contract';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function draft(
  name: string,
  type: PropertyType,
  objectKind: ObjectKind = 'item',
  overrides: Partial<PropertyDraft['rules']> = {},
): PropertyDraft {
  return {
    name,
    objectKind,
    rules: {
      choices: type === 'select' || type === 'status' ? ['Alpha', 'Beta'] : [],
      digitsOnly: false,
      required: false,
      unique: false,
      relationTarget: type === 'relation' ? 'person' : undefined,
      ...overrides,
    },
    type,
  };
}

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

/* ------------------------------------------------------------------ */
/*  Property definition lifecycle                                     */
/* ------------------------------------------------------------------ */

describe('property definitions', () => {
  it('creates every initial property type and returns correct metadata', () => {
    const db = service();
    const types: PropertyType[] = [
      'text', 'number', 'money', 'date', 'checkbox', 'select', 'status', 'relation',
    ];
    const created = types.map((type) => db.objects.createProperty(draft(`Prop ${type}`, type)));

    expect(created).toHaveLength(8);
    for (const [index, property] of created.entries()) {
      expect(property.type).toBe(types[index]);
      expect(property.position).toBe(index);
      expect(property.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(property.createdAt).toBeTruthy();
      expect(property.updatedAt).toBeTruthy();
    }
    db.close();
  });

  it('preserves position order when listing', () => {
    const db = service();
    db.objects.createProperty(draft('First', 'text'));
    db.objects.createProperty(draft('Second', 'number'));
    db.objects.createProperty(draft('Third', 'date'));
    const list = db.objects.listProperties('item');
    expect(list.map(({ name }) => name)).toEqual(['First', 'Second', 'Third']);
    db.close();
  });

  it('renames a property via update', () => {
    const db = service();
    const created = db.objects.createProperty(draft('Original', 'text'));
    const updated = db.objects.updateProperty(created.id, draft('Renamed', 'text'));
    expect(updated.name).toBe('Renamed');
    expect(updated.id).toBe(created.id);
    db.close();
  });

  it('archives a property and excludes it from listing', () => {
    const db = service();
    const property = db.objects.createProperty(draft('Temporary', 'text'));
    db.objects.archiveProperty(property.id);
    expect(db.objects.listProperties('item')).toHaveLength(0);
    const audit = db.objects.listAudit(property.id);
    expect(audit[0]?.action).toBe('archived');
    db.close();
  });

  it('keeps item and person properties separate', () => {
    const db = service();
    db.objects.createProperty(draft('Name', 'text', 'item'));
    db.objects.createProperty(draft('Name', 'text', 'person'));
    expect(db.objects.listProperties('item')).toHaveLength(1);
    expect(db.objects.listProperties('person')).toHaveLength(1);
    db.close();
  });

  it('rejects moving a property between item and person', () => {
    const db = service();
    const itemProp = db.objects.createProperty(draft('Shared', 'text', 'item'));
    expect(() =>
      db.objects.updateProperty(itemProp.id, draft('Shared', 'text', 'person')),
    ).toThrow('cannot move');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Property validation edge cases                                    */
/* ------------------------------------------------------------------ */

describe('property validation', () => {
  it('rejects empty names', () => {
    const db = service();
    expect(() => db.objects.createProperty(draft('', 'text'))).toThrow('1–80 characters');
    expect(() => db.objects.createProperty(draft('   ', 'text'))).toThrow('1–80 characters');
    db.close();
  });

  it('rejects names longer than 80 characters', () => {
    const db = service();
    expect(() => db.objects.createProperty(draft('x'.repeat(81), 'text'))).toThrow('1–80 characters');
    db.close();
  });

  it('rejects duplicate property names within the same kind', () => {
    const db = service();
    db.objects.createProperty(draft('Serial', 'text'));
    expect(() => db.objects.createProperty(draft('Serial', 'number'))).toThrow('unique');
    db.close();
  });

  it('allows reuse of an archived property name', () => {
    const db = service();
    const first = db.objects.createProperty(draft('Temp', 'text'));
    db.objects.archiveProperty(first.id);
    const second = db.objects.createProperty(draft('Temp', 'text'));
    expect(second.name).toBe('Temp');
    expect(second.id).not.toBe(first.id);
    db.close();
  });

  it('rejects select without choices', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty({
        ...draft('Status', 'select'),
        rules: { ...draft('Status', 'select').rules, choices: [] },
      }),
    ).toThrow('at least one');
    db.close();
  });

  it('rejects status without choices', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty({
        ...draft('State', 'status'),
        rules: { ...draft('State', 'status').rules, choices: [] },
      }),
    ).toThrow('at least one');
    db.close();
  });

  it('rejects relation without target', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty({
        ...draft('Link', 'relation'),
        rules: { ...draft('Link', 'relation').rules, relationTarget: undefined },
      }),
    ).toThrow('target');
    db.close();
  });

  it('rejects minimum greater than maximum for number', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty(draft('Price', 'number', 'item', { minimum: 100, maximum: 10 })),
    ).toThrow('Minimum cannot be greater');
    db.close();
  });

  it('rejects minimum length greater than maximum length for text', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty(draft('Code', 'text', 'item', { minimumLength: 20, maximumLength: 5 })),
    ).toThrow('Minimum length cannot be greater');
    db.close();
  });

  it('rejects non-finite minimum', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty(draft('Bad', 'number', 'item', { minimum: Infinity })),
    ).toThrow('finite');
    db.close();
  });

  it('rejects negative length limits', () => {
    const db = service();
    expect(() =>
      db.objects.createProperty(draft('Bad', 'text', 'item', { minimumLength: -1 })),
    ).toThrow('between 0 and 10,000');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Schema conflict: adding required property to populated schema     */
/* ------------------------------------------------------------------ */

describe('required-property schema conflicts', () => {
  it('rejects adding a required property when records exist', () => {
    const db = service();
    db.objects.createRecord({ label: 'Existing', objectKind: 'item', values: {} });
    expect(() =>
      db.objects.createProperty(draft('Must have', 'text', 'item', { required: true })),
    ).toThrow('required property cannot be added');
    db.close();
  });

  it('allows adding a required property to an empty schema', () => {
    const db = service();
    const property = db.objects.createProperty(draft('Must have', 'text', 'item', { required: true }));
    expect(property.rules.required).toBe(true);
    db.close();
  });

  it('rejects making an optional property required when records lack values', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Note', 'text'));
    db.objects.createRecord({ label: 'Item without note', objectKind: 'item', values: {} });
    expect(() =>
      db.objects.updateProperty(prop.id, draft('Note', 'text', 'item', { required: true })),
    ).toThrow('required');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Uniqueness enforcement                                            */
/* ------------------------------------------------------------------ */

describe('uniqueness', () => {
  it('prevents duplicate values on a unique property', () => {
    const db = service();
    const serial = db.objects.createProperty(draft('Serial', 'text', 'item', { unique: true }));
    db.objects.createRecord({ label: 'A', objectKind: 'item', values: { [serial.id]: 'ABC123' } });
    expect(() =>
      db.objects.createRecord({ label: 'B', objectKind: 'item', values: { [serial.id]: 'ABC123' } }),
    ).toThrow('unique');
    db.close();
  });

  it('enforces case-insensitive uniqueness', () => {
    const db = service();
    const serial = db.objects.createProperty(draft('Serial', 'text', 'item', { unique: true }));
    db.objects.createRecord({ label: 'A', objectKind: 'item', values: { [serial.id]: 'abc' } });
    expect(() =>
      db.objects.createRecord({ label: 'B', objectKind: 'item', values: { [serial.id]: 'ABC' } }),
    ).toThrow('unique');
    db.close();
  });

  it('allows updating a record while keeping the same unique value', () => {
    const db = service();
    const serial = db.objects.createProperty(draft('Serial', 'text', 'item', { unique: true }));
    const record = db.objects.createRecord({ label: 'A', objectKind: 'item', values: { [serial.id]: 'X1' } });
    const updated = db.objects.updateRecord(record.id, { label: 'A Updated', objectKind: 'item', values: { [serial.id]: 'X1' } });
    expect(updated.label).toBe('A Updated');
    db.close();
  });

  it('rejects making a property unique when existing data has duplicates', () => {
    const db = service();
    const note = db.objects.createProperty(draft('Tag', 'text'));
    db.objects.createRecord({ label: 'A', objectKind: 'item', values: { [note.id]: 'same' } });
    db.objects.createRecord({ label: 'B', objectKind: 'item', values: { [note.id]: 'same' } });
    expect(() =>
      db.objects.updateProperty(note.id, draft('Tag', 'text', 'item', { unique: true })),
    ).toThrow('conflict');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Record CRUD with optional and missing values                      */
/* ------------------------------------------------------------------ */

describe('record lifecycle', () => {
  it('persists explicit table row order', () => {
    const db = service();
    const alpha = db.objects.createRecord({ label: 'Alpha', objectKind: 'item', values: {} });
    const beta = db.objects.createRecord({ label: 'Beta', objectKind: 'item', values: {} });
    const gamma = db.objects.createRecord({ label: 'Gamma', objectKind: 'item', values: {} });

    db.objects.reorderRecords('item', [gamma.id, alpha.id, beta.id]);
    expect(db.objects.listRecords('item').map((record) => record.id)).toEqual([gamma.id, alpha.id, beta.id]);
    expect(() => db.objects.reorderRecords('item', [alpha.id, beta.id])).toThrow('every active record exactly once');
    db.close();
  });
  it('creates a record with no custom properties', () => {
    const db = service();
    const record = db.objects.createRecord({ label: 'Simple', objectKind: 'item', values: {} });
    expect(record.label).toBe('Simple');
    expect(record.values).toEqual({});
    db.close();
  });

  it('creates a record with optional fields missing', () => {
    const db = service();
    db.objects.createProperty(draft('Optional note', 'text'));
    const record = db.objects.createRecord({ label: 'No extras', objectKind: 'item', values: {} });
    expect(record.values).toEqual({});
    db.close();
  });

  it('rejects a record missing a required field', () => {
    const db = service();
    const required = db.objects.createProperty(draft('IMEI', 'text', 'item', { required: true }));
    expect(() =>
      db.objects.createRecord({ label: 'Phone', objectKind: 'item', values: {} }),
    ).toThrow('required');
    // Verify nothing leaked
    expect(db.objects.listRecords('item')).toHaveLength(0);
    void required; // suppress unused warning
    db.close();
  });

  it('rejects a record with an empty label', () => {
    const db = service();
    expect(() => db.objects.createRecord({ label: '', objectKind: 'item', values: {} })).toThrow();
    expect(() => db.objects.createRecord({ label: '   ', objectKind: 'item', values: {} })).toThrow();
    db.close();
  });

  it('rejects a record with a label longer than 120 characters', () => {
    const db = service();
    expect(() =>
      db.objects.createRecord({ label: 'x'.repeat(121), objectKind: 'item', values: {} }),
    ).toThrow();
    db.close();
  });

  it('updates a record preserving audit trail', () => {
    const db = service();
    const record = db.objects.createRecord({ label: 'V1', objectKind: 'item', values: {} });
    db.objects.updateRecord(record.id, { label: 'V2', objectKind: 'item', values: {} });
    const audit = db.objects.listAudit(record.id);
    expect(audit.map(({ action }) => action)).toEqual(['updated', 'created']);
    db.close();
  });

  it('archives a record and excludes it from listing', () => {
    const db = service();
    const record = db.objects.createRecord({ label: 'Gone', objectKind: 'item', values: {} });
    db.objects.archiveRecord(record.id);
    expect(db.objects.listRecords('item')).toHaveLength(0);
    expect(db.objects.listAudit(record.id)[0]?.action).toBe('archived');
    db.close();
  });

  it('rejects moving a record between item and person', () => {
    const db = service();
    const record = db.objects.createRecord({ label: 'Fixed', objectKind: 'item', values: {} });
    expect(() =>
      db.objects.updateRecord(record.id, { label: 'Fixed', objectKind: 'person', values: {} }),
    ).toThrow('cannot move');
    db.close();
  });

  it('rejects values for properties outside the active schema', () => {
    const db = service();
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { 'nonexistent-id': 'value' } }),
    ).toThrow('outside');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Value-level validation                                            */
/* ------------------------------------------------------------------ */

describe('value validation', () => {
  it('rejects non-digit text when digitsOnly is set', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Code', 'text', 'item', { digitsOnly: true }));
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { [prop.id]: '12A3' } }),
    ).toThrow('digits only');
    db.close();
  });

  it('accepts valid digits-only text', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Code', 'text', 'item', { digitsOnly: true }));
    const record = db.objects.createRecord({ label: 'Good', objectKind: 'item', values: { [prop.id]: '1234' } });
    expect(record.values[prop.id]).toBe('1234');
    db.close();
  });

  it('requires the configured exact number of digits', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('IMEI suffix', 'text', 'item', { exactDigits: 4 }));
    expect(() =>
      db.objects.createRecord({ label: 'Short', objectKind: 'item', values: { [prop.id]: '123' } }),
    ).toThrow('exactly 4 digits');
    expect(() =>
      db.objects.createRecord({ label: 'Letters', objectKind: 'item', values: { [prop.id]: '12A4' } }),
    ).toThrow('exactly 4 digits');
    const record = db.objects.createRecord({ label: 'Good', objectKind: 'item', values: { [prop.id]: '0123' } });
    expect(record.values[prop.id]).toBe('0123');
    db.close();
  });

  it('rejects text shorter than minimumLength', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Pin', 'text', 'item', { minimumLength: 4 }));
    expect(() =>
      db.objects.createRecord({ label: 'Short', objectKind: 'item', values: { [prop.id]: 'ab' } }),
    ).toThrow('at least 4');
    db.close();
  });

  it('rejects text longer than maximumLength', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Pin', 'text', 'item', { maximumLength: 4 }));
    expect(() =>
      db.objects.createRecord({ label: 'Long', objectKind: 'item', values: { [prop.id]: 'abcde' } }),
    ).toThrow('no more than 4');
    db.close();
  });

  it('rejects numbers below minimum', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Price', 'number', 'item', { minimum: 10 }));
    expect(() =>
      db.objects.createRecord({ label: 'Cheap', objectKind: 'item', values: { [prop.id]: 5 } }),
    ).toThrow('minimum is 10');
    db.close();
  });

  it('rejects numbers above maximum', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Price', 'number', 'item', { maximum: 1000 }));
    expect(() =>
      db.objects.createRecord({ label: 'Expensive', objectKind: 'item', values: { [prop.id]: 2000 } }),
    ).toThrow('maximum is 1000');
    db.close();
  });

  it('accepts boundary min/max numbers', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Score', 'number', 'item', { minimum: 0, maximum: 100 }));
    const atMin = db.objects.createRecord({ label: 'Min', objectKind: 'item', values: { [prop.id]: 0 } });
    const atMax = db.objects.createRecord({ label: 'Max', objectKind: 'item', values: { [prop.id]: 100 } });
    expect(atMin.values[prop.id]).toBe(0);
    expect(atMax.values[prop.id]).toBe(100);
    db.close();
  });

  it('rejects money with non-finite value', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Amount', 'money'));
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { [prop.id]: NaN } }),
    ).toThrow('valid number');
    db.close();
  });

  it('rejects invalid date formats', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Purchased', 'date'));
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { [prop.id]: '29-08-2026' } }),
    ).toThrow('valid date');
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { [prop.id]: '2026-02-30' } }),
    ).toThrow('valid date');
    db.close();
  });

  it('accepts a valid ISO date', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Purchased', 'date'));
    const record = db.objects.createRecord({ label: 'Good', objectKind: 'item', values: { [prop.id]: '2026-08-29' } });
    expect(record.values[prop.id]).toBe('2026-08-29');
    db.close();
  });

  it('rejects a non-boolean checkbox value', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Active', 'checkbox'));
    // Deliberately pass a string where a boolean is expected to test runtime validation.
    const badValues = { [prop.id]: 'yes' } as Record<string, string>;
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: badValues }),
    ).toThrow('checked or unchecked');
    db.close();
  });

  it('rejects a select value not in choices', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Color', 'select'));
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { [prop.id]: 'Gamma' } }),
    ).toThrow('allowed value');
    db.close();
  });

  it('rejects a status value not in choices', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('State', 'status'));
    expect(() =>
      db.objects.createRecord({ label: 'Bad', objectKind: 'item', values: { [prop.id]: 'Unknown' } }),
    ).toThrow('allowed value');
    db.close();
  });
});

describe('record template origin', () => {
  it('persists the exact template selected when a record is created and edited', () => {
    const db = service();
    const template = db.templates.createTemplate({
      defaults: {},
      fieldOrder: [],
      name: 'Used Phone',
      objectKind: 'item',
      progressive: [],
    });
    const record = db.objects.createRecord({
      label: 'Phone',
      objectKind: 'item',
      templateId: template.id,
      values: {},
    });
    expect(record.templateId).toBe(template.id);
    expect(db.objects.updateRecord(record.id, { ...record, label: 'Edited phone' }).templateId).toBe(template.id);
    expect(db.objects.listRecords('item')[0]?.templateId).toBe(template.id);
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Relations                                                         */
/* ------------------------------------------------------------------ */

describe('relations', () => {
  it('accepts a valid relation to an existing person', () => {
    const db = service();
    const person = db.objects.createRecord({ label: 'Customer', objectKind: 'person', values: {} });
    const rel = db.objects.createProperty(draft('Owner', 'relation'));
    const record = db.objects.createRecord({ label: 'Phone', objectKind: 'item', values: { [rel.id]: person.id } });
    expect(record.values[rel.id]).toBe(person.id);
    db.close();
  });

  it('rejects a relation to a non-existent record', () => {
    const db = service();
    const rel = db.objects.createProperty(draft('Owner', 'relation'));
    expect(() =>
      db.objects.createRecord({ label: 'Phone', objectKind: 'item', values: { [rel.id]: 'missing-id' } }),
    ).toThrow('not found');
    db.close();
  });

  it('rejects a relation to an archived record', () => {
    const db = service();
    const person = db.objects.createRecord({ label: 'Ex', objectKind: 'person', values: {} });
    db.objects.archiveRecord(person.id);
    const rel = db.objects.createProperty(draft('Owner', 'relation'));
    expect(() =>
      db.objects.createRecord({ label: 'Phone', objectKind: 'item', values: { [rel.id]: person.id } }),
    ).toThrow('not found');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Audit trail completeness                                          */
/* ------------------------------------------------------------------ */

describe('audit trail', () => {
  it('records create, update, and archive for properties', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Tracked', 'text'));
    db.objects.updateProperty(prop.id, draft('Tracked renamed', 'text'));
    db.objects.archiveProperty(prop.id);
    const audit = db.objects.listAudit(prop.id);
    expect(audit.map(({ action }) => action)).toEqual(['archived', 'updated', 'created']);
    db.close();
  });

  it('records create, update, and archive for records', () => {
    const db = service();
    const record = db.objects.createRecord({ label: 'Audited', objectKind: 'item', values: {} });
    db.objects.updateRecord(record.id, { label: 'Audited v2', objectKind: 'item', values: {} });
    db.objects.archiveRecord(record.id);
    const audit = db.objects.listAudit(record.id);
    expect(audit.map(({ action }) => action)).toEqual(['archived', 'updated', 'created']);
    db.close();
  });

  it('stores snapshots in audit entries', () => {
    const db = service();
    const record = db.objects.createRecord({ label: 'Snapped', objectKind: 'item', values: {} });
    const audit = db.objects.listAudit(record.id);
    const snapshot = audit[0]?.snapshot as { label?: string };
    expect(snapshot?.label).toBe('Snapped');
    db.close();
  });
});

/* ------------------------------------------------------------------ */
/*  Atomicity: failed operations must not leak partial state           */
/* ------------------------------------------------------------------ */

describe('atomicity', () => {
  it('does not leak a record on validation failure', () => {
    const db = service();
    const prop = db.objects.createProperty(draft('Required', 'text', 'item', { required: true }));
    try {
      db.objects.createRecord({ label: 'Leaky', objectKind: 'item', values: {} });
    } catch { /* expected */ }
    expect(db.objects.listRecords('item')).toHaveLength(0);
    void prop;
    db.close();
  });

  it('does not leak a property on uniqueness failure', () => {
    const db = service();
    db.objects.createProperty(draft('Unique', 'text'));
    try {
      db.objects.createProperty(draft('Unique', 'text'));
    } catch { /* expected */ }
    expect(db.objects.listProperties('item')).toHaveLength(1);
    db.close();
  });
});
