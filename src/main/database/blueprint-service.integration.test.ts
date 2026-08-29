import { describe, expect, it } from 'vitest';

import { phoneShopBlueprint } from '../../shared/starter-blueprints';
import { DatabaseService } from './database-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('BlueprintService', () => {
  it('validates a valid blueprint', () => {
    const db = service();
    const result = db.blueprints.validateBlueprint(phoneShopBlueprint);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    db.close();
  });

  it('detects blueprint validation issues', () => {
    const db = service();
    const invalidBp = {
      name: '',
      properties: {
        item: [
          { name: 'Model', rules: { choices: [], digitsOnly: false, required: true, unique: false }, type: 'invalid-type' },
          { name: 'Model', rules: { choices: [], digitsOnly: false, required: true, unique: false }, type: 'text' },
        ],
        person: 'not-an-array',
      },
      templates: [
        {
          defaults: 'not-object',
          fieldOrder: ['Unknown Field'],
          name: '',
          objectKind: 'invalid-kind',
        },
      ],
      version: 2,
    };

    const result = db.blueprints.validateBlueprint(invalidBp);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'version')).toBe(true);
    expect(result.issues.some((i) => i.field === 'name')).toBe(true);
    expect(result.issues.some((i) => i.field === 'properties.person')).toBe(true);
    expect(result.issues.some((i) => i.message.includes('Duplicate property name'))).toBe(true);
    expect(result.issues.some((i) => i.message.includes('invalid-type'))).toBe(true);
    expect(result.issues.some((i) => i.message.includes('invalid-kind'))).toBe(true);
    db.close();
  });

  it('imports the starter phone shop blueprint and sets up properties and templates', () => {
    const db = service();
    db.blueprints.importBlueprint(phoneShopBlueprint);

    const itemProps = db.objects.listProperties('item');
    expect(itemProps).toHaveLength(6);
    expect(itemProps.map((p) => p.name)).toEqual([
      'Model',
      'Brand',
      'Condition',
      'IMEI',
      'Cost Price',
      'Selling Price',
    ]);

    const personProps = db.objects.listProperties('person');
    expect(personProps).toHaveLength(3);
    expect(personProps.map((p) => p.name)).toEqual(['Phone Number', 'Type', 'Notes']);

    const itemTemplates = db.templates.listTemplates('item');
    expect(itemTemplates).toHaveLength(3);
    expect(itemTemplates.map((t) => t.name)).toEqual(['New Phone', 'Used Phone', 'Accessory / Case']);

    const personTemplates = db.templates.listTemplates('person');
    expect(personTemplates).toHaveLength(2);
    expect(personTemplates.map((t) => t.name)).toEqual(['Customer', 'Supplier']);

    const metadata = db.shopMetadata.getMetadata();
    expect(metadata.blueprintName).toBe('Mobile & Electronics Shop');
    db.close();
  });

  it('performs a complete export -> import roundtrip accurately', () => {
    const db1 = service();
    // 1. Setup DB1
    db1.shopMetadata.updateMetadata({ locale: 'ar', shopName: 'Custom Al-Amal Telecom' });
    const p1 = db1.objects.createProperty({
      name: 'Serial Number',
      objectKind: 'item',
      rules: { choices: [], digitsOnly: true, required: true, unique: true },
      type: 'text',
    });
    const p2 = db1.objects.createProperty({
      name: 'Warranty Months',
      objectKind: 'item',
      rules: { choices: [], digitsOnly: false, minimum: 0, required: false, unique: false },
      type: 'number',
    });
    db1.templates.createTemplate({
      defaults: { [p2.id]: 12 },
      fieldOrder: [p1.id, p2.id],
      name: 'Standard Warranty Item',
      objectKind: 'item',
      progressive: [p2.id],
    });

    // 2. Export from DB1
    const exported = db1.blueprints.exportBlueprint();
    expect(exported.name).toBe('Custom Al-Amal Telecom');
    expect(exported.properties.item).toHaveLength(2);
    expect(exported.templates).toHaveLength(1);
    expect(exported.templates[0]?.name).toBe('Standard Warranty Item');
    // Field order and defaults must be mapped to property names in export!
    expect(exported.templates[0]?.fieldOrder).toEqual(['Serial Number', 'Warranty Months']);
    expect(exported.templates[0]?.defaults).toEqual({ 'Warranty Months': 12 });
    expect(exported.templates[0]?.progressive).toEqual(['Warranty Months']);

    // 3. Import into DB2
    const db2 = service();
    db2.blueprints.importBlueprint(exported);

    const db2ItemProps = db2.objects.listProperties('item');
    expect(db2ItemProps).toHaveLength(2);
    expect(db2ItemProps[0]?.name).toBe('Serial Number');
    expect(db2ItemProps[0]?.rules.unique).toBe(true);

    const db2Templates = db2.templates.listTemplates('item');
    expect(db2Templates).toHaveLength(1);
    expect(db2Templates[0]?.name).toBe('Standard Warranty Item');

    // In DB2, template fieldOrder must point to DB2's property IDs
    const db2SerialProp = db2ItemProps.find((p) => p.name === 'Serial Number')!;
    const db2WarrantyProp = db2ItemProps.find((p) => p.name === 'Warranty Months')!;
    expect(db2Templates[0]?.fieldOrder).toEqual([db2SerialProp.id, db2WarrantyProp.id]);
    expect(db2Templates[0]?.defaults).toEqual({ [db2WarrantyProp.id]: 12 });

    // 4. Re-export from DB2 and compare
    const reExported = db2.blueprints.exportBlueprint();
    expect(reExported.properties).toEqual(exported.properties);
    expect(reExported.templates).toEqual(exported.templates);

    db1.close();
    db2.close();
  });
});
