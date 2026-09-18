// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { propertySaveError } from '../ui/property-editing-copy';
import { PropertyEditor } from './PropertyEditor';

beforeEach(() => {
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: { workspace: { getNavigation: vi.fn().mockResolvedValue({ databases: [], pages: [] }) } },
  });
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
