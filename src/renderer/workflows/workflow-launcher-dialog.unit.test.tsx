// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceWorkflow, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';
import { WorkflowLauncherDialog } from './workflow-launcher-dialog';
import { QuickActionSettings } from './quick-action-settings';

afterEach(cleanup);
const action: WorkspaceWorkflow = { id: 'configured', name: 'Record attendance', enabled: true, createdAt: '', updatedAt: '', version: 1, kind: 'custom', positionKey: 'a0', steps: [], inputSchema: { fields: [{ key: 'count', label: 'Count', type: 'number', required: true }] } };
function api(actions: readonly WorkspaceWorkflow[] = []) {
  const executeWorkflow = vi.fn(() => Promise.resolve({ ok: true, value: { status: 'completed' } }));
  const workspace = { listWorkflows: vi.fn(() => Promise.resolve(actions)), executeWorkflow, getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })), createWorkflow: vi.fn((draft: WorkspaceWorkflowDraft) => Promise.resolve({ ok: true, value: { ...action, ...draft } })) };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace } });
  return workspace;
}
describe('Workspace Quick Actions UI', () => {
  it('offers a direct configuration path in an empty workspace', async () => {
    api(); const configure = vi.fn(); const user = userEvent.setup();
    render(<WorkflowLauncherDialog locale="en" onClose={vi.fn()} onConfigure={configure} />);
    expect(await screen.findByText(/No quick actions yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage Quick Actions' }));
    expect(configure).toHaveBeenCalledOnce();
  });
  it('renders only configured enabled actions and guards duplicate submission', async () => {
    const workspace = api([action, { ...action, id: 'disabled', name: 'Hidden', enabled: false }]);
    let finish!: (value: { ok: boolean; value: { status: string } }) => void;
    workspace.executeWorkflow.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<WorkflowLauncherDialog locale="en" onClose={vi.fn()} onConfigure={vi.fn()} />);
    expect(await screen.findByRole('tab', { name: /Record attendance/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Hidden' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Sale' })).not.toBeInTheDocument();
    await user.type(await screen.findByLabelText('Count *'), '12');
    const button = screen.getByRole('button', { name: 'Run' });
    const form = button.closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(workspace.executeWorkflow).toHaveBeenCalledExactlyOnceWith({ workflowId: 'configured', inputs: { count: 12 } });
    await act(async () => { finish({ ok: true, value: { status: 'completed' } }); await Promise.resolve(); });
    expect(screen.getByText('Action completed')).toBeInTheDocument();
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
  });
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
