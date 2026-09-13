import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DatabaseService } from './database-service';
import { parseWorkspaceTemplateV2 } from '../ipc/workspace-input-parsers';

it('runs an Other sale from the shipped blueprint', () => {
  const db = new DatabaseService(':memory:'); db.initialize();
  try {
    db.workspaceTemplates.importBlueprintV2(parseWorkspaceTemplateV2(JSON.parse(readFileSync('phone-shop-blueprint.json', 'utf8'))));
    const action = db.workflows.listWorkflows().find(w => w.name === 'Sale')!;
    const productDb = action.inputSchema.fields.find(f => f.key === 'items')!.fields!.find(f => f.key === 'product')!.databaseId!;
    const other = db.records.listRecords(productDb).find(r => r.title === 'Other')!;
    const accountDb = action.inputSchema.fields.find(f => f.key === 'payment_account')!.databaseId!;
    const cash = db.records.listRecords(accountDb).find(r => /cash/i.test(r.title))!;
    const opening = db.workflows.listWorkflows().find(w => w.name === 'Open Business Day')!;
    const openRequest = { workflowId: opening.id, inputs: { balances: [{ account: cash.id, opening_balance: 0 }] } };
    const openPreview = db.workflows.evaluateForm(openRequest);
    db.workflows.execute({ ...openRequest, evaluationToken: openPreview.token });
    const request = { workflowId: action.id, inputs: { items: [{ product: other.id, description: 'Miscellaneous sale', quantity: 1, unit_price: 10 }], payment_status: 'full', payment_account: cash.id } };
    const preview = db.workflows.evaluateForm(request);
    expect(preview.messages.filter(m => m.severity === 'BLOCK')).toEqual([]);
    expect(db.workflows.execute({ ...request, evaluationToken: preview.token, confirmedWarnings: preview.messages.filter(m => m.severity === 'WARNING').map(m => m.id) }).status).toBe('completed');
  } finally { db.close(); }
});
