// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceWorkflow, WorkspaceWorkflowDraft, WorkflowExecutionResult, WorkflowValidationReport } from '../../shared/workflow-contract';
import { QuickActionForm } from './quick-action-form';
import { QuickActionSettings } from './quick-action-settings';

afterEach(() => { cleanup(); window.localStorage.clear(); });
const action: WorkspaceWorkflow = { id: 'configured', name: 'Record attendance', enabled: true, createdAt: '', updatedAt: '', version: 1, kind: 'custom', positionKey: 'a0', steps: [], inputSchema: { fields: [{ key: 'count', label: 'Count', type: 'number', required: true }] } };
function api(actions: readonly WorkspaceWorkflow[] = []) {
  let rows: WorkspaceWorkflow[] = [...actions];
  const executeWorkflow = vi.fn<() => Promise<{ ok: true; value: Partial<WorkflowExecutionResult> }>>(() => Promise.resolve({ ok: true, value: { status: 'completed' } }));
  const workspace = {
    listWorkflows: vi.fn(() => Promise.resolve(rows)),
    inspectWorkflows: vi.fn<() => Promise<readonly WorkflowValidationReport[]>>(() => Promise.resolve([])),
    listWorkflowRuns: vi.fn(() => Promise.resolve([])),
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
  it('previews record changes without treating the preview as a completed run', async () => {
    const workspace = api([action]);
    workspace.executeWorkflow.mockResolvedValue({ ok: true, value: { status: 'rolled_back', previewEffects: [{ kind: 'created', recordId: 'preview-id', title: 'Preview task', databaseId: 'tasks' }], previewComputed: [{ name: 'total', value: 12 }] } });
    render(<QuickActionForm action={action} locale="en" onOpenSettings={vi.fn()} />);
    await userEvent.setup().type(await screen.findByLabelText('Count *'), '12');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Preview' }));
    expect(workspace.executeWorkflow).toHaveBeenCalledWith({ workflowId: action.id, inputs: { count: 12 }, testMode: true });
    expect(await screen.findByText('Create: Preview task')).toBeInTheDocument();
    expect(screen.getByText('Computed values')).toBeInTheDocument();
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(screen.queryByText(/Done · ready/)).not.toBeInTheDocument();
  });
  it('runs the action once per submission and confirms when it lands', async () => {
    const workspace = api([action]);
    let finish!: (value: { ok: true; value: Partial<WorkflowExecutionResult> }) => void;
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
  it('marks a saved action whose schema references no longer validate', async () => {
    const workspace = api([action]);
    workspace.inspectWorkflows.mockResolvedValue([{ workflowId: action.id, canRun: false, issues: [{ code: 'missing_property', location: 'Step 1', message: 'Step 1: Referenced property was deleted.', severity: 'error' }] }]);
    render(<QuickActionSettings locale="en" />);
    expect(await screen.findByText(/Needs repair: Step 1/)).toBeInTheDocument();
    expect(workspace.updateWorkflow).not.toHaveBeenCalled();
  });
  it('saves label, visibility, color and shortcut and reports a collision', async () => {
    const other = { ...action, id: 'other', name: 'Other action', positionKey: 'b0', shortcut: 'Digit1' };
    const workspace = api([action, other]); const user = userEvent.setup();
    render(<QuickActionSettings locale="en" />);
    await user.click(await screen.findByRole('button', { name: /Record attendance/ }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Record visit');
    await user.click(screen.getByLabelText('Enabled'));
    fireEvent.change(screen.getByLabelText('Action color'), { target: { value: '#123456' } });
    await user.click(screen.getByRole('combobox', { name: 'Action shortcut' }));
    await user.click(screen.getByRole('option', { name: 'Ctrl/⌘ Alt 1' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already used');
    expect(workspace.updateWorkflow).not.toHaveBeenCalled();
    await user.click(screen.getByRole('combobox', { name: 'Action shortcut' }));
    await user.click(screen.getByRole('option', { name: 'Ctrl/⌘ Alt 2' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(workspace.updateWorkflow).toHaveBeenCalledWith(action.id, expect.objectContaining({ name: 'Record visit', enabled: false, color: '#123456', shortcut: 'Digit2' }));
  });

  it('moves an action down and persists its new position', async () => {
    const workspace = api([action, { ...action, id: 'other', name: 'Other', positionKey: 'b0' }]);
    render(<QuickActionSettings locale="en" />);
    await screen.findAllByRole('button', { name: 'Move down' });
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Move down' })[0]!);
    expect(workspace.updateWorkflow.mock.calls[0]?.[0]).toBe(action.id);
    expect(typeof workspace.updateWorkflow.mock.calls[0]?.[1].positionKey).toBe('string');
  });
  it('opens recent runs for an action without editing its definition', async () => {
    const workspace = api([action]);
    render(<QuickActionSettings locale="en" />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Run history' }));
    expect(await screen.findByText('No runs yet.')).toBeInTheDocument();
    expect(workspace.listWorkflowRuns).toHaveBeenCalledWith(action.id);
    expect(workspace.updateWorkflow).not.toHaveBeenCalled();
  });
  it('keeps legacy formula conditions as formulas when edited', async () => {
    const legacy: WorkspaceWorkflow = { ...action, name: 'Legacy check', steps: [
      { id: 'check', type: 'VALIDATE', config: { condition: 'count > 0', errorMessage: 'Must be positive' } },
    ] };
    const workspace = api([legacy]);
    const user = userEvent.setup();
    render(<QuickActionSettings locale="en" />);
    await user.click(await screen.findByRole('button', { name: /Legacy check/ }));
    const condition = screen.getByRole('textbox', { name: 'Legacy condition expression' });
    await user.clear(condition);
    await user.type(condition, 'count > 10');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(workspace.updateWorkflow.mock.calls[0]?.[0]).toBe('configured');
    expect(workspace.updateWorkflow.mock.calls[0]?.[1].steps?.[0]?.config.condition).toBe('count > 10');
  });

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
