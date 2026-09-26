// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { WorkflowRunSummary, WorkspaceWorkflow } from '../../shared/workflow-contract';
import { WorkflowRunHistory } from './workflow-run-history';

afterEach(cleanup);
const workflow: WorkspaceWorkflow = {
  id: 'wf', name: 'Check stock', enabled: true, createdAt: '', updatedAt: '', version: 1,
  kind: 'custom', positionKey: 'a', inputSchema: { fields: [] },
  steps: [{ id: 'check', type: 'VALIDATE', config: {} }],
};
const run = (status: WorkflowRunSummary['status'], message?: string): WorkflowRunSummary => ({
  id: status, workflowId: 'wf', workflowVersion: 1, status,
  startedAt: '2026-09-27T10:00:00.000Z', completedAt: '2026-09-27T10:00:01.000Z',
  ...(status === 'failed' ? { stepNumber: 1 } : {}), ...(message ? { message } : {}),
});

it('explains failed, rolled-back, and completed runs without exposing inputs', async () => {
  const listWorkflowRuns = vi.fn().mockResolvedValue([run('failed', 'Stock is unavailable'), run('rolled_back'), run('completed')]);
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { listWorkflowRuns } } });
  const { container } = render(<WorkflowRunHistory workflow={workflow} locale="en" />);
  expect(await screen.findByText('Stock is unavailable')).toBeInTheDocument();
  expect(screen.getByText('Step 1 · Check a condition')).toBeInTheDocument();
  expect(screen.getByText('Failed; changes rolled back', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Preview rolled back', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Changes were saved. Check the result before running again.')).toBeInTheDocument();
  expect(container.textContent).not.toContain('inputJson');
  expect(listWorkflowRuns).toHaveBeenCalledWith('wf');
  expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
});

it('uses Arabic for run state and recovery text', async () => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { listWorkflowRuns: vi.fn().mockResolvedValue([run('failed')]) } } });
  render(<div dir="rtl"><WorkflowRunHistory workflow={workflow} locale="ar" /></div>);
  expect(await screen.findByText('لم تُحفظ أي تغييرات. راجع الإجراء والمدخلات قبل إعادة المحاولة.')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'سجل تنفيذ الإجراء' })).toBeInTheDocument();
});
