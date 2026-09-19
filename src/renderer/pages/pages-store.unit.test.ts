// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { loadPersistentCustomPages, updatePersistentCustomPage } from './pages-store';

function workspace(contentJson: string) {
  const updateNode = vi.fn<(id: string, patch: { contentJson: string }) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
    getNavigation: () => Promise.resolve({ pages: [{ id: 'page' }] }),
    getNode: () => Promise.resolve({ id: 'page', title: 'Title', contentJson, createdAt: '', updatedAt: '' }), updateNode,
  } } });
  return updateNode;
}

it('preserves page and document extension metadata when editing a title', async () => {
  const source = { futureSetting: { enabled: true }, document: { version: 1, extension: 'kept', blocks: [{ id: 'text', type: 'text', data: { content: '**Formatted**' } }] } };
  const update = workspace(JSON.stringify(source));
  const [page] = await loadPersistentCustomPages();
  await updatePersistentCustomPage({ ...page!, title: 'Renamed' }, 0);
  const saved = JSON.parse(update.mock.calls[0]![1].contentJson) as typeof source;
  expect(saved.futureSetting).toEqual(source.futureSetting);
  expect(saved.document).toEqual(source.document);
});

it.each(['{invalid', '{"document":{"version":99,"blocks":[]}}'])('preserves an unreadable document during unrelated edits', async (source) => {
  const update = workspace(source);
  const [page] = await loadPersistentCustomPages();
  expect(page?.readOnlySource).toBe(source);
  await updatePersistentCustomPage({ ...page!, title: 'Renamed' }, 0);
  expect(update.mock.calls[0]![1].contentJson).toBe(source);
});
