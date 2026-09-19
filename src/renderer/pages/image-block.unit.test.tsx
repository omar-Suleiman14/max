// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageBlock } from './image-block';
import type { NotionBlock } from '../ui/notion-block-editor';

afterEach(cleanup);
function Harness() {
  const [block, setBlock] = useState<NotionBlock>({ id: 'image', type: 'image', content: '' });
  return <ImageBlock block={block} locale="en" onChange={patch => setBlock(previous => ({ ...previous, ...patch }))} />;
}

it('stores a linked image locally before rendering it', async () => {
  const downloadImage = vi.fn(() => Promise.resolve({ ok: true, value: { url: `max://asset/${'a'.repeat(64)}.png` } }));
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { assets: { downloadImage } } });
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Insert from link' }));
  await user.type(screen.getByRole('textbox', { name: 'Image URL' }), 'https://example.test/photo.png');
  await user.click(screen.getByRole('button', { name: 'Save image' }));
  expect(downloadImage).toHaveBeenCalledWith('https://example.test/photo.png');
  expect(await screen.findByRole('img')).toHaveAttribute('src', `/__max/asset/${'a'.repeat(64)}.png`);
  expect(screen.queryByRole('textbox', { name: 'Image URL' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replace' })).toBeVisible();
});

it('shows upload progress and replaces the placeholder after success', async () => {
  const importImage = vi.fn(() => Promise.resolve({ ok: true, value: { url: `max://asset/${'b'.repeat(64)}.png` } }));
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { assets: { importImage } } });
  const { container } = render(<Harness />);
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(4)) });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  expect(screen.getByRole('status')).toHaveTextContent('Saving image');
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('alt', 'photo.png'));
  expect(screen.queryByText('Drop an image here or choose a file')).not.toBeInTheDocument();
});
