// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconPickerDialog } from './icon-picker-dialog';

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('picking a page or property icon', () => {
  it('saves a page icon with its selected colour and offers shuffle', async () => {
    const onSelect = vi.fn();
    render(<IconPickerDialog locale="en" onClose={vi.fn()} onSelect={onSelect} />);

    await userEvent.setup().click(screen.getByTitle('Store'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('lucide:Store#5b8cff');
    expect(screen.getByLabelText('5b8cff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
  });

  it('places itself against the button that opened it', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ bottom: 120, height: 24, left: 300, right: 340, top: 96, width: 40, x: 300, y: 96, toJSON: () => ({}) });

    const { container } = render(<IconPickerDialog anchor={anchor} locale="en" onClose={vi.fn()} onSelect={vi.fn()} />);

    // Rendered into the document rather than the caller, so no positioned
    // ancestor can drag it over the panel it was opened from.
    expect(container).toBeEmptyDOMElement();
    const popover = screen.getByRole('dialog', { name: 'Select icon' });
    expect(popover).toHaveStyle({ left: '300px', top: '126px' });
    anchor.remove();
  });

  it('narrows the grid to what was searched', async () => {
    render(<IconPickerDialog locale="en" onClose={vi.fn()} onSelect={vi.fn()} />);

    await userEvent.setup().type(screen.getByLabelText('Search icons'), 'receipt');

    expect(screen.getByTitle('Receipt')).toBeInTheDocument();
    expect(screen.queryByTitle('Store')).not.toBeInTheDocument();
  });
});
