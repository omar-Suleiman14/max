// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceProperty } from '../../shared/property-contract';
import { propertySaveError } from '../ui/property-editing-copy';
import { PropertyEditor } from './PropertyEditor';

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
    getNavigation: vi.fn().mockResolvedValue({ databases: [], pages: [] }),
  } } });
});

it('uses the shared validation wording, closes with Escape, and passes an axe check', async () => {
  const close = vi.fn();
  const user = userEvent.setup();
  const { container } = render(<><button type="button">Anchor</button><PropertyEditor databaseId="db-1" isOpen locale="en" onClose={close} onSave={vi.fn().mockResolvedValue(null)} schema={null} /></>);
  const name = await screen.findByPlaceholderText('Property name');
  await user.type(name, 'Broken property');
  await user.click(screen.getByRole('button', { name: 'Create Property' }));
  expect(await screen.findByText(propertySaveError('en'))).toBeInTheDocument();
  const result = await axe.run(container.ownerDocument.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations).toEqual([]);
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalled();
});

it('warns which actions depend on a property before archiving it', async () => {
  const onArchive = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const workflowsUsingProperty = vi.fn().mockResolvedValue([{ id: 'workflow-1', name: 'Set priority' }]);
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
    getNavigation: vi.fn().mockResolvedValue({ databases: [], pages: [] }),
    workflowsUsingProperty,
  } } });
  const property = { id: 'priority', databaseId: 'tasks', name: 'Priority', type: 'number', config: {}, required: false, uniqueValue: false } as WorkspaceProperty;
  render(<PropertyEditor databaseId="tasks" isOpen locale="en" onArchive={onArchive} onClose={onClose} onSave={vi.fn()} property={property} schema={null} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Archive property' }));
  expect(workflowsUsingProperty).toHaveBeenCalledWith(property.id);
  expect(await screen.findByText('Set priority')).toBeInTheDocument();
  expect(onArchive).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm archive' }));
  expect(onArchive).toHaveBeenCalledWith(property.id);
  expect(onClose).toHaveBeenCalledOnce();
});
