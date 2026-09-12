// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceWorkflow, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';
import { QuickActionForm } from './quick-action-form';
import { QuickActionSettings } from './quick-action-settings';

afterEach(() => { cleanup(); window.localStorage.clear(); });
const action: WorkspaceWorkflow = { id: 'configured', name: 'Record attendance', enabled: true, createdAt: '', updatedAt: '', version: 1, kind: 'custom', positionKey: 'a0', steps: [], inputSchema: { fields: [{ key: 'count', label: 'Count', type: 'number', required: true }] } };
function api(actions: readonly WorkspaceWorkflow[] = []) {
  let rows: WorkspaceWorkflow[] = [...actions];
  const executeWorkflow = vi.fn(() => Promise.resolve({ ok: true, value: { status: 'completed' } }));
  const workspace = {
    listWorkflows: vi.fn(() => Promise.resolve(rows)),
    executeWorkflow,
    getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })),
    createWorkflow: vi.fn((draft: WorkspaceWorkflowDraft) => Promise.resolve({ ok: true, value: { ...action, ...draft } })),
    updateWorkflow: vi.fn((id: string, patch: Partial<WorkspaceWorkflowDraft>) => {
      rows = rows.map((row) => (row.id === id ? { ...row, ...patch } as WorkspaceWorkflow : row));
      return Promise.resolve({ ok: true, value: rows.find((row) => row.id === id)! });
    }),
  };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace } });
  return workspace;
}
describe('running one quick action', () => {
  it('runs the action once per submission and confirms when it lands', async () => {
    const workspace = api([action]);
    let finish!: (value: { ok: boolean; value: { status: string } }) => void;
    workspace.executeWorkflow.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<QuickActionForm action={action} locale="en" onOpenSettings={vi.fn()} />);

    await userEvent.setup().type(await screen.findByLabelText('Count *'), '12');
    const form = screen.getByRole('button', { name: 'Run' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);

    expect(workspace.executeWorkflow).toHaveBeenCalledExactlyOnceWith({ workflowId: 'configured', inputs: { count: 12 } });
    await act(async () => { finish({ ok: true, value: { status: 'completed' } }); await Promise.resolve(); });
    // The confirmation is a line, and the emptied form is still there to take
    // the next entry rather than a card standing between the two.
    expect(screen.getByText('Done · ready for the next one')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    // Reloaded from what was just run, which is what the next entry starts from.
    expect(screen.getByLabelText('Count *')).toHaveValue('12');
  });

  it('names the answers it is still waiting for instead of doing nothing', () => {
    const workspace = api([action]);
    render(<QuickActionForm action={action} locale="en" onOpenSettings={vi.fn()} />);

    fireEvent.submit(screen.getByRole('button', { name: 'Run' }).closest('form')!);

    expect(workspace.executeWorkflow).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Fill in first: Count');
  });

  it('will not run a switched-off action, and turns it on in place', async () => {
    const workspace = api();
    const blocked = { ...action, enabled: false };
    const onEnabled = vi.fn();
    const user = userEvent.setup();
    render(<QuickActionForm action={blocked} locale="en" onEnabled={onEnabled} onOpenSettings={vi.fn()} />);

    expect(screen.getByText('This action is switched off in settings.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Turn it on' }));
    expect(workspace.updateWorkflow).toHaveBeenCalledWith('configured', { enabled: true });
    expect(onEnabled).toHaveBeenCalledOnce();
  });
});

describe('Workspace Quick Actions settings', () => {
  it('configures calculations, conditions, messages and summaries without JSON', async () => {
    const workspace = api(); const user = userEvent.setup();
    render(<QuickActionSettings locale="en"/>);
    await user.click(await screen.findByRole('button', { name: '+ Quick action' }));
    await user.type(screen.getByLabelText('Name'), 'Live action');
    await user.click(screen.getByRole('button', { name: '+ Input' }));
    await user.type(screen.getByLabelText('Input name'), 'Calculated');
    await user.click(screen.getByText('Calculation & conditions'));
    await user.click(screen.getByLabelText('Calculate live'));
    await user.click(screen.getByLabelText('Visible when'));
    await user.click(screen.getByText('Messages & preview'));
    await user.click(screen.getByRole('button', { name: '+ Conditional message' }));
    await user.type(screen.getByLabelText('Message'), 'Review the value');
    await user.click(screen.getByRole('button', { name: '+ Preview value' }));
    await user.type(screen.getByLabelText('Summary label'), 'Preview');
    await user.type(screen.getByLabelText('Input name'), ' value');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const draft = workspace.createWorkflow.mock.calls[0]![0];
    expect(draft.inputSchema.fields[0]?.derived?.allowOverride).toBe(true);
    expect(draft.inputSchema.fields[0]?.visibleWhen).toEqual({ source: 'literal', value: true });
    expect(draft.inputSchema.rules?.[0]?.message).toBe('Review the value');
    expect(draft.inputSchema.summary?.[0]?.label).toBe('Preview');
    // Roughly twenty typed interactions; slower CI runners need more than the 5s default.
  }, 30_000);
  it('creates workspace definitions through settings without a JSON editor', async () => {
    const workspace = api(); const user = userEvent.setup();
    render(<QuickActionSettings locale="en" />);
    await user.click(await screen.findByRole('button', { name: '+ Quick action' }));
    await user.type(screen.getByLabelText('Name'), 'Count entries');
    await user.click(screen.getByRole('button', { name: '+ Input' }));
    await user.type(screen.getByLabelText('Input name'), 'Count');
    await user.click(screen.getByRole('combobox', { name: 'Input type' }));
    await user.click(screen.getByRole('option', { name: 'Number' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(workspace.createWorkflow).toHaveBeenCalledWith(expect.objectContaining({ name: 'Count entries', inputSchema: { fields: [expect.objectContaining({ label: 'Count', type: 'number' })] } }));
    expect(screen.queryByText('Input schema (JSON)')).not.toBeInTheDocument();
  });
});
