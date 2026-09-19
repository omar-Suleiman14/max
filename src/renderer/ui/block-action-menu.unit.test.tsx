// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { BlockActionMenu } from './block-action-menu';

afterEach(cleanup);
function setup(locale = 'en') {
  const onChange = vi.fn(); const onClose = vi.fn();
  render(<BlockActionMenu block={{ id: 'one', type: 'text', content: '**Keep me**' }} locale={locale}
    textColours={[{ id: 'red', label: 'Red text', labelAr: 'أحمر' }]} backgroundColours={[{ id: 'blue_bg', label: 'Blue background', labelAr: 'خلفية زرقاء' }]}
    onChange={onChange} onClose={onClose} onDuplicate={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} first last />);
  return { onChange, onClose, user: userEvent.setup() };
}

it('keeps colours in their own submenu and applies the selected colour', async () => {
  const { user, onChange, onClose } = setup();
  expect(screen.queryByText('Red text')).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Colour' }));
  expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitemradio', { name: 'Blue background' }));
  expect(onChange).toHaveBeenCalledWith({ backgroundColor: 'blue_bg' });
  expect(onClose).toHaveBeenCalledOnce();
});

it('Escape leaves the submenu first and restores its trigger', async () => {
  const { user, onClose } = setup();
  await user.click(screen.getByRole('menuitem', { name: 'Turn into' }));
  expect(screen.getByRole('menuitemradio', { name: 'Text' })).toHaveAttribute('aria-checked', 'true');
  await user.keyboard('{Escape}');
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('menuitem', { name: 'Turn into' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
});

it('converts only the type, preserving content and other fields', async () => {
  const { user, onChange } = setup();
  await user.keyboard('{ArrowRight}');
  await user.click(screen.getByRole('menuitemradio', { name: 'Heading 2' }));
  expect(onChange).toHaveBeenCalledWith({ type: 'h2' });
});

it('mirrors submenu arrow navigation in Arabic', async () => {
  const { user, onClose } = setup('ar');
  await user.keyboard('{ArrowLeft}');
  expect(screen.getByRole('menu', { name: 'تحويل إلى' })).toHaveAttribute('dir', 'rtl');
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('menuitem', { name: 'تحويل إلى' })).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
});
