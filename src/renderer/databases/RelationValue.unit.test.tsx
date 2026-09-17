// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import type { WorkspaceProperty } from '../../shared/property-contract';
import { RelationValue } from './RelationValue';

const property: WorkspaceProperty = {
  archivedAt: null,
  config: { relationId: 'rel-1' },
  createdAt: '',
  databaseId: 'db-1',
  id: 'related',
  name: 'Related',
  positionKey: 'a0',
  required: false,
  type: 'relation',
  uniqueValue: false,
  updatedAt: '',
};

it('navigates relation targets with arrows, stores the selected record ID, and restores trigger focus on Escape', async () => {
  const getRelatedRecords = vi.fn().mockResolvedValue([]);
  const linkRecords = vi.fn().mockResolvedValue({ ok: true, value: null });
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: { workspace: {
      getRelatedRecords,
      linkRecords,
      searchRelationTargets: vi.fn().mockResolvedValue([
        { databaseId: 'db-2', databaseTitle: 'People', id: 'target-1', sequence: 1, title: 'Ada' },
        { databaseId: 'db-2', databaseTitle: 'People', id: 'target-2', sequence: 2, title: 'Grace' },
      ]),
      unlinkRecords: vi.fn().mockResolvedValue({ ok: true, value: null }),
    } },
  });
  render(<RelationValue property={property} recordId="record-1" />);
  const user = userEvent.setup();
  const trigger = await screen.findByRole('button', { name: 'Link page: Related' });
  await user.click(trigger);
  const search = await screen.findByPlaceholderText('Search pages to link…');
  await waitFor(() => expect(screen.getByRole('button', { name: /Grace/ })).toBeInTheDocument());
  await user.click(search);
  await user.keyboard('{ArrowDown}{Enter}');
  await waitFor(() => expect(linkRecords).toHaveBeenCalledWith('rel-1', 'record-1', 'target-2'));
  await user.keyboard('{Escape}');
  await waitFor(() => expect(trigger).toHaveFocus());
});
