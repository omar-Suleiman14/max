// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { FocusedOverlay } from './focused-overlay';

afterEach(cleanup);

function Nested() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return <><button onClick={() => setOuter(true)}>Open</button>{outer && <FocusedOverlay labelId="outer" onClose={() => setOuter(false)}>
    <h2 id="outer">Outer</h2><button data-autofocus="true" onClick={() => setInner(true)}>Open inner</button><button>Last</button>
    {inner && <FocusedOverlay labelId="inner" onClose={() => setInner(false)}><h2 id="inner">Inner</h2><button data-autofocus="true">Inner action</button></FocusedOverlay>}
  </FocusedOverlay>}</>;
}

it('closes only the innermost dialog and restores focus in order', async () => {
  const user = userEvent.setup();
  render(<Nested />);
  await user.click(screen.getByText('Open'));
  expect(screen.getByText('Open inner')).toHaveFocus();
  await user.click(screen.getByText('Open inner'));
  expect(screen.getByText('Inner action')).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
  expect(screen.getByText('Open inner')).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.getByText('Open')).toHaveFocus();
});

it('contains forward and backward tab navigation', async () => {
  const user = userEvent.setup();
  render(<Nested />);
  await user.click(screen.getByText('Open'));
  await user.tab({ shift: true });
  expect(screen.getByText('Last')).toHaveFocus();
  await user.tab();
  expect(screen.getByText('Open inner')).toHaveFocus();
});
