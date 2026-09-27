// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { QuickActionSettings } from './quick-action-settings';
import { draftFromJson } from './workflow-draft';
afterEach(cleanup);
it('Astra: JSON must reject a null config before returning to the editor', () => {
 const draft = { name: 'A', inputSchema: { fields: [] }, steps: [{ type: 'VALIDATE', config: null }] };
 expect(typeof draftFromJson(JSON.stringify(draft), { name: '', inputSchema: { fields: [] }, steps: [] }, false)).toBe('string');
});
it('Astra: cancelling JSON for action A must not overwrite action B', async () => {
 const actions = ['A', 'B'].map(name => ({ id: name, name, enabled: true, inputSchema: { fields: [] }, steps: [], kind: 'custom', positionKey: name }));
 const updateWorkflow = vi.fn(() => Promise.resolve({ ok: true }));
 Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { listWorkflows: vi.fn(() => Promise.resolve(actions)), getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })), updateWorkflow } } });
 render(<QuickActionSettings locale="en" />);
 const user = userEvent.setup();
 await user.click(await screen.findByRole('button', { name: /^A/ }));
 await user.click(screen.getByRole('button', { name: 'Edit as JSON' }));
 await user.click(screen.getByRole('button', { name: 'Cancel' }));
 await user.click(await screen.findByRole('button', { name: /^B/ }));
 const apply = screen.queryByRole('button', { name: 'Apply and return to the editor' });
 if (apply) await user.click(apply);
 await user.click(screen.getByRole('button', { name: 'Save' }));
 await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
 expect(updateWorkflow.mock.calls[0]).toEqual(['B', expect.objectContaining({ name: 'B' })]);
});
