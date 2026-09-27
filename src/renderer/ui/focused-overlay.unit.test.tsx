// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, expect, it } from 'vitest';
import { FocusedOverlay } from './focused-overlay';
import { useOverlayLayer } from './overlay-stack';

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

function Picker({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useOverlayLayer(root, { onClose });
  return createPortal(<div aria-label="Picker" ref={root} role="dialog">Picker content</div>, document.body);
}

function DialogWithPicker() {
  const [outer, setOuter] = useState(true);
  const [picker, setPicker] = useState(false);
  return outer && <FocusedOverlay labelId="outer" onClose={() => setOuter(false)}>
    <h2 id="outer">Outer</h2><button onClick={() => setPicker(true)}>Open picker</button>
    {picker && <Picker onClose={() => setPicker(false)} />}
  </FocusedOverlay>;
}

it('dismisses only the picker when its parent backdrop is pressed', async () => {
  const user = userEvent.setup();
  render(<DialogWithPicker />);
  await user.click(screen.getByText('Open picker'));
  expect(screen.getByRole('dialog', { name: 'Picker' })).toBeInTheDocument();
  const backdrop = screen.getByRole('dialog', { name: 'Outer' }).parentElement!;
  await user.pointer({ keys: '[MouseLeft]', target: backdrop });
  expect(screen.queryByRole('dialog', { name: 'Picker' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
  await user.pointer({ keys: '[MouseLeft]', target: backdrop });
  expect(screen.queryByRole('dialog', { name: 'Outer' })).not.toBeInTheDocument();
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
