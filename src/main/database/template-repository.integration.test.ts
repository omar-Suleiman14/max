import { describe, expect, it } from 'vitest';

import type { TemplateDraft } from '../../shared/template-contract';
import { DatabaseService } from './database-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

function templateDraft(
  name: string,
  objectKind: 'item' | 'person' = 'item',
  overrides: Partial<TemplateDraft> = {},
): TemplateDraft {
  return {
    defaults: {},
    fieldOrder: ['prop-1', 'prop-2'],
    name,
    objectKind,
    progressive: ['prop-2'],
    ...overrides,
  };
}

describe('TemplateRepository', () => {
  it('creates and lists templates in position order', () => {
    const db = service();
    const t1 = db.templates.createTemplate(templateDraft('New Phone', 'item'));
    const t2 = db.templates.createTemplate(templateDraft('Used Phone', 'item'));
    const t3 = db.templates.createTemplate(templateDraft('Customer', 'person'));

    const itemTemplates = db.templates.listTemplates('item');
    expect(itemTemplates).toHaveLength(2);
    expect(itemTemplates[0]?.id).toBe(t1.id);
    expect(itemTemplates[0]?.name).toBe('New Phone');
    expect(itemTemplates[0]?.position).toBe(0);
    expect(itemTemplates[1]?.id).toBe(t2.id);
    expect(itemTemplates[1]?.name).toBe('Used Phone');
    expect(itemTemplates[1]?.position).toBe(1);

    const personTemplates = db.templates.listTemplates('person');
    expect(personTemplates).toHaveLength(1);
    expect(personTemplates[0]?.id).toBe(t3.id);
    expect(personTemplates[0]?.name).toBe('Customer');
    db.close();
  });

  it('updates template fields, defaults, and progressive settings', () => {
    const db = service();
    const created = db.templates.createTemplate(templateDraft('Standard', 'item'));
    const updated = db.templates.updateTemplate(created.id, {
      defaults: { price: 100 },
      fieldOrder: ['b', 'a'],
      name: 'Standard V2',
      objectKind: 'item',
      progressive: ['b'],
    });

    expect(updated.name).toBe('Standard V2');
    expect(updated.defaults).toEqual({ price: 100 });
    expect(updated.fieldOrder).toEqual(['b', 'a']);
    expect(updated.progressive).toEqual(['b']);
    db.close();
  });

  it('archives template and excludes it from listing while preserving audit', () => {
    const db = service();
    const created = db.templates.createTemplate(templateDraft('To Archive', 'item'));
    db.templates.archiveTemplate(created.id);

    expect(db.templates.listTemplates('item')).toHaveLength(0);
    const audit = db.objects.listAudit(created.id);
    expect(audit[0]?.action).toBe('archived');
    expect(audit[1]?.action).toBe('created');
    db.close();
  });

  it('rejects duplicate active template names for same object kind', () => {
    const db = service();
    db.templates.createTemplate(templateDraft('Duplicate', 'item'));
    expect(() => db.templates.createTemplate(templateDraft('Duplicate', 'item'))).toThrow('unique');
    // Allowed for different kind
    const personT = db.templates.createTemplate(templateDraft('Duplicate', 'person'));
    expect(personT.name).toBe('Duplicate');
    db.close();
  });

  it('allows reusing archived template name', () => {
    const db = service();
    const t1 = db.templates.createTemplate(templateDraft('Reused', 'item'));
    db.templates.archiveTemplate(t1.id);
    const t2 = db.templates.createTemplate(templateDraft('Reused', 'item'));
    expect(t2.name).toBe('Reused');
    expect(t2.id).not.toBe(t1.id);
    db.close();
  });

  it('validates template names and constraints', () => {
    const db = service();
    expect(() => db.templates.createTemplate(templateDraft('', 'item'))).toThrow('1–80');
    expect(() => db.templates.createTemplate(templateDraft('a'.repeat(81), 'item'))).toThrow('1–80');

    const created = db.templates.createTemplate(templateDraft('Kind Move', 'item'));
    expect(() => db.templates.updateTemplate(created.id, templateDraft('Kind Move', 'person'))).toThrow(
      'cannot move',
    );
    db.close();
  });
});
