// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Test-only in-process IPC adapter; no main-process module is imported by production UI.
import { DatabaseService } from '../src/main/database/database-service';
import { reactiveFixture } from '../src/main/database/workflow-reactive.fixture';
import { ReactiveActionForm } from '../src/renderer/workflows/reactive-action-form';
import type { WorkflowExecutionInput } from '../src/shared/workflow-contract';
import type { WorkspaceRecordDraft } from '../src/shared/property-contract';
import type { DatabaseQueryParams } from '../src/shared/query-contract';
const opened: DatabaseService[] = [];
afterEach(() => { cleanup(); opened.splice(0).forEach(db => db.close()); });
function setup() {
  const db = new DatabaseService(':memory:'); db.initialize(); opened.push(db); const f = reactiveFixture(db);
  const wrap = <T,>(fn: () => T) => { try { return Promise.resolve({ ok: true, value: fn() }); } catch (e) { return Promise.resolve({ ok: false, error: { message: String(e) } }); } };
  const api = {
    evaluateWorkflow: vi.fn((input: WorkflowExecutionInput) => wrap(() => db.workflows.evaluateForm(input))),
    executeWorkflow: vi.fn((input: WorkflowExecutionInput) => wrap(() => db.workflows.execute(input))),
    queryDatabase: vi.fn((input: DatabaseQueryParams) => Promise.resolve(db.databaseQuery.query(input))),
    getDatabaseSchema: vi.fn((id: string) => Promise.resolve(db.databases.getSchema(id))),
    createRecord: vi.fn((draft: WorkspaceRecordDraft) => wrap(() => db.unitOfWork.run(() => db.records.createRecord(draft)))),
  };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: api } });
  const completed = vi.fn(); render(<ReactiveActionForm workflow={f.workflow} locale="en" onCompleted={completed} onBusy={vi.fn()}/>);
  return { db, f, api, completed, user: userEvent.setup() };
}
/** Optional inputs start collapsed, so reveal them before asserting on them. */
async function revealOptionalFields(user: ReturnType<typeof userEvent.setup>) {
  for (const toggle of screen.queryAllByRole('button', { name: /optional field/, expanded: false })) await user.click(toggle);
}

describe('Live Quick Action form', () => {
  it('shows filtered details, recalculates, preserves/reset overrides, conditions and confirms warnings once', async () => {
    const { user, completed, api } = setup();
    await waitFor(() => expect(api.evaluateWorkflow).toHaveBeenCalled());
    await revealOptionalFields(user);
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(await screen.findByRole('option', { name: 'Alpha · 20' }));
    // Numeric fields are text inputs so an Arabic keyboard can reach them, so
    // their values read back as strings. See shared/digits.ts.
    await waitFor(() => expect(screen.getByLabelText('Calculated')).toHaveValue('10'));
    expect(screen.queryByRole('combobox', { name: 'Another source' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Calculated'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '8' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled());
    expect(screen.getByLabelText('Calculated')).toHaveValue('7');
    // The reset appears once the evaluation confirms the value was overridden,
    // so it is waited for rather than assumed present on the same tick.
    await user.click(await screen.findByRole('button', { name: 'Reset calculated value' }));
    await waitFor(() => expect(screen.getByLabelText('Calculated')).toHaveValue('16'));
    fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '30' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Another source' })).toBeInTheDocument());
    expect(screen.getByLabelText('Note')).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Another source' })); await user.click(await screen.findByRole('option', { name: 'Beta' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled());
    expect(screen.getByLabelText('Preview')).toHaveTextContent('-10');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(api.executeWorkflow).not.toHaveBeenCalled();
    // A press made while the preview is still in flight is held, not dropped,
    // so the warnings can arrive a tick after the click.
    expect(await screen.findByRole('group', { name: 'Confirm warnings' })).toHaveTextContent('Amount exceeds available.');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    const submitted = api.executeWorkflow.mock.calls[0]![0]; expect(submitted.inputs.calculated).toBe(60); expect(submitted.confirmedWarnings).toEqual(['warning']);
  });
  it('creates a normal record inline with required properties and selects it; blocks negative input', async () => {
    const { user, api, db, f } = setup();
    await user.click(await screen.findByRole('button', { name: '+ Add new' }));
    const create = screen.getByRole('group', { name: 'New record' });
    await user.type(within(create).getByLabelText('New record name'), 'Gamma');
    await waitFor(() => expect(within(create).getByLabelText('Rate *')).toBeInTheDocument());
    // An unanswered required property is marked, not refused: the record has to
    // exist before anyone has anywhere to type the value in.
    expect(within(create).getByLabelText('Rate *').closest('label')).toHaveAttribute('data-required-unmet', 'true');
    await user.type(within(create).getByLabelText('Rate *'), '4'); await user.click(within(create).getByLabelText('Enabled'));
    expect(within(create).getByLabelText('Rate *').closest('label')).not.toHaveAttribute('data-required-unmet');
    expect(db.databaseQuery.query({ databaseId: f.a.id }).records).toHaveLength(3);
    await user.click(within(create).getByRole('button', { name: 'Create and select' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'New record' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Gamma'));
    await revealOptionalFields(user);
    // The calculated value arrives from an evaluate round trip, so it can land a
    // tick after the selection does on a slower machine.
    await waitFor(() => expect(screen.getByLabelText('Calculated')).toHaveValue('20'));
    fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '-1' } });
    expect(await screen.findByText('Amount cannot be negative.')).toBeInTheDocument();
    // Run still answers. A dead button and a refused run look the same, and the
    // refusal is the thing worth saying out loud.
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(api.executeWorkflow).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Amount cannot be negative.');
  });
});
