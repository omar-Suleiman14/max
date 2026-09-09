// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { PropertyOptionDraft, WorkspaceProperty } from '../../shared/property-contract';
import { OptionValue } from './OptionValue';
import { FilterBuilder } from './FilterBuilder';
import { SortBuilder } from './SortBuilder';

afterEach(cleanup);
const property: WorkspaceProperty = { id: 'category', databaseId: 'entries', name: 'Category', type: 'multi_select', required: false, uniqueValue: false, config: {}, positionKey: 'a0', createdAt: '', updatedAt: '', archivedAt: null, options: [{ id: 'one', propertyId: 'category', label: 'Research', positionKey: 'a0', style: {} }] };
it('selects multiple options by ID and removes a selection without deleting its definition', async () => {
  const user = userEvent.setup(), change = vi.fn();
  render(<OptionValue property={property} value={['one']} multiple onChange={change} />);
  await user.click(screen.getByRole('button', { name: 'Category' }));
  expect(screen.getByRole('option', { name: 'Research' })).toHaveAttribute('aria-selected', 'true');
  await user.click(screen.getByRole('button', { name: 'Remove selection' }));
  expect(change).toHaveBeenCalledWith([]);
  expect(screen.getByRole('option', { name: 'Research' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Category' })).toHaveFocus();
});
it('creates, colors and renames an option through the normal property API', async () => {
  const user = userEvent.setup(), change = vi.fn();
  const updateProperty = vi.fn((_id: string, patch: { options: readonly PropertyOptionDraft[] }) => Promise.resolve({ ok: true, value: { ...property, options: patch.options.map((o, i) => ({ ...o, id: o.id ?? 'created', propertyId: property.id, positionKey: `a${i}` })) } }));
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { updateProperty } } });
  render(<OptionValue property={property} value={[]} multiple onChange={change} />);
  await user.click(screen.getByRole('button', { name: 'Category' }));
  await user.type(screen.getByRole('textbox', { name: 'Search options' }), 'Planning');
  await user.click(screen.getByRole('button', { name: /Create/ }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(['created']));
  await user.click(screen.getByRole('button', { name: 'Edit Planning' }));
  await user.click(screen.getByRole('button', { name: 'blue' }));
  // Asymmetric matchers intentionally return any.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  await waitFor(() => expect(updateProperty).toHaveBeenLastCalledWith('category', expect.objectContaining({ options: expect.arrayContaining([expect.objectContaining({ id: 'created', style: { color: 'var(--option-blue-text)', background: 'var(--option-blue-bg)' } })]) })));
  await user.click(await screen.findByRole('button', { name: 'Edit Planning' }));
  await user.clear(screen.getByRole('textbox', { name: 'Option name' }));
  await user.type(screen.getByRole('textbox', { name: 'Option name' }), 'Drafting');
  await user.click(screen.getByRole('button', { name: 'Save name' }));
  expect(await screen.findByRole('option', { name: 'Drafting' })).toBeInTheDocument();
});
it('starts filters and sorts with searchable property choices and saves their IDs', async () => {
  const user = userEvent.setup(), apply = vi.fn();
  const title = { ...property, id: 'title', name: 'Title', type: 'title' as const };
  const { unmount } = render(<FilterBuilder isOpen filterAst={null} properties={[title, property]} onClose={vi.fn()} onApply={apply} />);
  await user.type(screen.getByRole('textbox', { name: 'Filter by…' }), 'Tit');
  await user.click(screen.getByRole('button', { name: 'Title' }));
  await user.click(screen.getByRole('button', { name: /Apply/ }));
  expect(JSON.stringify(apply.mock.calls)).toContain('title');
  unmount();
  render(<SortBuilder isOpen sorts={[]} properties={[title, property]} onClose={vi.fn()} onApply={apply} />);
  await user.type(screen.getByRole('textbox', { name: 'Sort by…' }), 'Cat');
  await user.click(screen.getByRole('button', { name: 'Category' }));
  await user.click(screen.getByRole('button', { name: /Apply/ }));
  expect(apply).toHaveBeenLastCalledWith([{ propertyId: 'category', direction: 'asc' }]);
});
