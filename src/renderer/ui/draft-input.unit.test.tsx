// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { DraftInput } from './draft-input';

it('commits on Enter, Tab and click-away, cancels on Escape, and leaves arrow keys to the input', async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  render(<><DraftInput aria-label="Field" value="old" onCommit={commit} /><button type="button">Next</button></>);
  const input = screen.getByLabelText('Field');

  await user.click(input);
  await user.clear(input);
  await user.type(input, 'enter');
  await user.keyboard('{Enter}');
  expect(commit).toHaveBeenLastCalledWith('enter');

  await user.click(input);
  await user.clear(input);
  await user.type(input, 'cancelled');
  await user.keyboard('{Escape}');
  expect(input).toHaveValue('enter');
  expect(commit).toHaveBeenCalledTimes(1);

  await user.click(input);
  await user.clear(input);
  await user.type(input, 'tabbed');
  await user.tab();
  expect(commit).toHaveBeenLastCalledWith('tabbed');
  expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();

  await user.click(input);
  await user.keyboard('{ArrowLeft}{ArrowRight}');
  expect(commit).toHaveBeenCalledTimes(2);

  await user.clear(input);
  await user.type(input, 'outside');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(commit).toHaveBeenLastCalledWith('outside');
});
