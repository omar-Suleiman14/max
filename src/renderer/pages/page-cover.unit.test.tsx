// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PageCover } from './page-cover';
import { exportWorkspaceImage } from './export-image';

vi.mock('./export-image', () => ({ exportWorkspaceImage: vi.fn(() => Promise.resolve(true)) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const cover = { kind: 'image' as const, value: `max://asset/${'a'.repeat(64)}.png`, position: 50 };

it('keeps change, reposition and download available and exports the original image', async () => {
  render(<PageCover cover={cover} locale="en" onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Change' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reposition' })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Download' }));
  expect(exportWorkspaceImage).toHaveBeenCalledWith(cover.value);
});

it('moves the cropped image by the pointer distance and persists only on Save', async () => {
  vi.stubGlobal('Image', class { naturalWidth = 1000; naturalHeight = 1000; onload?: () => void; set src(_value: string) { this.onload?.(); } });
  vi.stubGlobal('PointerEvent', MouseEvent);
  const onChange = vi.fn();
  render(<PageCover cover={cover} locale="en" onChange={onChange} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reposition' }));
  const image = screen.getByRole('img');
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 200 } as DOMRect);
  Object.defineProperty(image, 'setPointerCapture', { value: vi.fn() });
  fireEvent.pointerDown(image, { button: 0, clientY: 100 });
  fireEvent.pointerMove(window, { clientY: 180 });
  fireEvent.pointerUp(window);
  expect(screen.getByRole('slider')).toHaveValue('40');
  expect(onChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save position' }));
  expect(onChange).toHaveBeenCalledWith({ ...cover, position: 40 });
});

it('cancels a keyboard-adjusted crop without writing it', async () => {
  const onChange = vi.fn();
  render(<PageCover cover={cover} locale="en" onChange={onChange} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reposition' }));
  fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } });
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('img')).toHaveStyle({ backgroundPosition: 'center 50%' });
});
