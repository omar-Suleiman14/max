import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

const opened: DatabaseService[] = [];
const workspace = () => {
  const db = new DatabaseService(':memory:');
  db.initialize();
  opened.push(db);
  return db;
};
afterEach(() => opened.splice(0).forEach((db) => db.close()));

describe('records in a database with required properties', () => {
  it('can be created and edited without every requirement answered', () => {
    const db = workspace();
    const phones = db.databases.createDatabase({ title: 'Phones' });
    const imei = db.properties.createProperty({ databaseId: phones.id, name: 'IMEI', type: 'text', required: true });
    const cost = db.properties.createProperty({ databaseId: phones.id, name: 'Cost', type: 'number', required: true });

    // Refusing this insert is what trapped the owner: the only place to supply
    // IMEI is the record, and the record could not exist without it.
    const record = db.records.createRecord({ databaseId: phones.id, title: 'Nokia 3310', properties: {} });
    expect(record.properties[imei.id]).toBeUndefined();
    expect(db.records.getRecord(record.id)?.title).toBe('Nokia 3310');

    // Filling one requirement in afterwards works, and leaves the other alone.
    const filled = db.records.updateRecord(record.id, { properties: { [imei.id]: '355 123 456 789 012' } });
    expect(filled.properties[imei.id]).toBe('355 123 456 789 012');
    expect(filled.properties[cost.id]).toBeUndefined();

    // Clearing a required value again is allowed for the same reason: a write
    // that refuses halfway leaves the person with no way forward.
    expect(db.records.updateRecord(record.id, { properties: { [imei.id]: '' } }).properties[imei.id]).toBeFalsy();
  });

  it('still applies a default value when the property declares one', () => {
    const db = workspace();
    const phones = db.databases.createDatabase({ title: 'Phones' });
    const condition = db.properties.createProperty({
      databaseId: phones.id,
      defaultValueJson: JSON.stringify('New'),
      name: 'Condition',
      required: true,
      type: 'text',
    });

    const record = db.records.createRecord({ databaseId: phones.id, title: 'Charger', properties: {} });
    expect(record.properties[condition.id]).toBe('New');
  });
});
