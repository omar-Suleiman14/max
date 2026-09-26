// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceWorkflow, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';
import { QuickActionForm } from './quick-action-form';
import { QuickActionSettings } from './quick-action-settings';
import { draftFromJson, draftToJson, stepTypes } from './workflow-draft';

afterEach(() => { cleanup(); localStorage.clear(); });

const legacy: WorkspaceWorkflow = {
  createdAt: '', enabled: true, id: 'legacy', inputSchema: { fields: [{ key: 'x', label: 'X', type: 'number' }] }, kind: 'custom', name: 'Legacy action', positionKey: 'a0',
  steps: [
    { config: { expression: 'x * 2', outputVariable: 'y' }, id: 's1', type: 'COMPUTE' },
    { config: { condition: 'y > 0', errorMessage: 'Must be positive' }, id: 's2', type: 'VALIDATE' },
    { config: { doubled: '$y' }, id: 's3', type: 'RETURN_RESULT' },
  ],
  updatedAt: '', version: 1,
};

function api(actions: readonly WorkspaceWorkflow[] = []) {
  const workspace = {
    createWorkflow: vi.fn((draft: WorkspaceWorkflowDraft) => Promise.resolve({ ok: true, value: draft })),
    executeWorkflow: vi.fn(() => Promise.resolve({ ok: true, value: { result: { Total: 22 }, status: 'completed' } })),
    getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })),
    listWorkflows: vi.fn(() => Promise.resolve(actions)),
    updateWorkflow: vi.fn((_id: string, draft: WorkspaceWorkflowDraft) => Promise.resolve({ ok: true, value: draft })),
  };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace } });
  return workspace;
}

async function newAction(locale: 'ar' | 'en' = 'en') {
  const user = userEvent.setup();
  render(<QuickActionSettings locale={locale} />);
  await user.click(await screen.findByRole('button', { name: locale === 'ar' ? '+ إجراء سريع' : '+ Quick action' }));
  return user;
}

describe('the workflow editor', () => {
  it('offers every engine step type in the palette', async () => {
    api();
    const user = await newAction();
    await user.click(screen.getByRole('button', { name: '+ Step' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Find record', 'Calculate value', 'Create record', 'Update record', 'For each row', 'Sum rows', 'Check a condition', 'Show a result']);
    expect(stepTypes).toHaveLength(8);
  });

  it('authors a check and named results without JSON and saves them in the engine shape', async () => {
    const workspace = api();
    const user = await newAction();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Checked');
    await user.click(screen.getByRole('button', { name: '+ Step' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation' }));
    await user.click(screen.getByRole('option', { name: 'Check a condition' }));
    await user.type(screen.getByRole('textbox', { name: /Message when it fails/ }), 'Too many');
    await user.click(screen.getByRole('button', { name: '+ Step' }));
    const operations = screen.getAllByRole('combobox', { name: 'Operation' });
    await user.click(operations[1]!);
    await user.click(screen.getByRole('option', { name: 'Show a result' }));
    await user.click(screen.getByRole('button', { name: '+ Result shown after running' }));
    await user.type(screen.getByRole('textbox', { name: 'Result name' }), 'Total');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(workspace.createWorkflow).toHaveBeenCalled());
    const [saved] = workspace.createWorkflow.mock.calls[0]!;
    expect(saved.steps.map((step) => [step.type, step.config])).toEqual([
      ['VALIDATE', { condition: { source: 'literal', value: true }, errorMessage: 'Too many' }],
      ['RETURN_RESULT', { outputs: [{ label: 'Total', value: { source: 'literal', value: '' } }] }],
    ]);
  });

  it('keeps a raw JSON view that round-trips with the editor', async () => {
    api();
    const user = await newAction();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Before');
    await user.click(screen.getByRole('button', { name: 'Edit as JSON' }));
    const json = screen.getByRole('textbox', { name: 'Action definition as JSON' });
    expect(JSON.parse((json as HTMLTextAreaElement).value)).toEqual({ enabled: true, icon: '', inputSchema: { fields: [] }, name: 'Before', steps: [] });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(json, { target: { value: '{ not json' } });
    await user.click(screen.getByRole('button', { name: 'Apply and return to the editor' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This is not valid JSON.');
    fireEvent.change(json, { target: { value: JSON.stringify({ inputSchema: { fields: [] }, name: 'After', steps: [{ config: { outputs: [] }, type: 'RETURN_RESULT' }] }) } });
    await user.click(screen.getByRole('button', { name: 'Apply and return to the editor' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('After');
    expect(screen.getByRole('combobox', { name: 'Operation' })).toHaveTextContent('Show a result');
  });

  it('converts drafts to and from JSON without loss, and rejects unknown step types', () => {
    const base: WorkspaceWorkflowDraft = { enabled: true, icon: 'lucide:Zap', inputSchema: { fields: [], rules: [], summary: [] }, name: 'A', steps: legacy.steps };
    expect(draftFromJson(draftToJson(base), base, false)).toEqual(base);
    expect(draftFromJson(JSON.stringify({ ...base, steps: [{ config: {}, type: 'TELEPORT' }] }), base, false)).toBe('Every step needs a known type and a config object.');
  });

  it('opens a Max 1.x action and saves it back unchanged', async () => {
    const workspace = api([legacy]);
    const user = userEvent.setup();
    render(<QuickActionSettings locale="en" />);
    await user.click(await screen.findByRole('button', { name: /Legacy action/ }));
    expect(screen.getAllByRole('combobox', { name: 'Operation' }).map((select) => select.textContent)).toEqual(['Calculate value', 'Check a condition', 'Show a result']);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(workspace.updateWorkflow).toHaveBeenCalled());
    expect((workspace.updateWorkflow.mock.calls[0]![1]).steps).toEqual(legacy.steps);
  });

  it('reads right to left in Arabic, is keyboard operable and has no detectable accessibility violations', async () => {
    api();
    const user = await newAction('ar');
    await user.click(screen.getByRole('button', { name: '+ خطوة' }));
    const operation = screen.getByRole('combobox', { name: 'العملية' });
    operation.focus();
    await user.keyboard('{Enter}');
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'التحقق من شرط' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    // Rendered on its own, outside the app's landmarks, so 'region' does not apply.
    expect((await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })).violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('running an action with named results', () => {
  it('shows what the action returned after it runs', async () => {
    const workspace = api();
    const action: WorkspaceWorkflow = { ...legacy, id: 'named', inputSchema: { fields: [] }, steps: [{ config: { outputs: [{ label: 'Total', value: { key: 't', source: 'variable' } }] }, id: 'r', type: 'RETURN_RESULT' }] };
    render(<QuickActionForm action={action} locale="en" onOpenSettings={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(workspace.executeWorkflow).toHaveBeenCalled());
    const result = await screen.findByRole('definition');
    expect(result).toHaveTextContent('22');
    expect(screen.getByRole('term')).toHaveTextContent('Total');
  });
});
