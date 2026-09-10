import type { CustomPage } from '../app/app-types';
import type { NotionBlock } from '../ui/notion-block-editor';
import type { WorkspaceNode } from '../../shared/workspace-contract';

const CUSTOM_PAGES_KEY = 'max:custom_pages';
const LEGACY_TRASHED_PAGES_KEY = 'max:trashed_pages';

function fromWorkspacePage(page: WorkspaceNode): CustomPage {
  let layout: { blocks?: readonly NotionBlock[]; favorite?: boolean; wiki?: boolean; properties?: CustomPage['properties'] } = {};
  try {
    const parsed = JSON.parse(page.contentJson) as unknown;
    layout = Array.isArray(parsed) ? { blocks: parsed as readonly NotionBlock[] } : parsed as typeof layout;
  } catch {
    // A damaged layout remains recoverable as an empty page.
  }
  return {
    blocks: Array.isArray(layout.blocks) ? layout.blocks : [],
    properties: Array.isArray(layout.properties) ? layout.properties : [],
    createdAt: page.createdAt,
    favorite: layout.favorite,
    icon: page.icon ?? 'lucide:FileText',
    id: page.id,
    parentNodeId: page.parentNodeId,
    positionKey: page.positionKey,
    title: page.title,
    updatedAt: page.updatedAt,
    wiki: layout.wiki,
  };
}

function toWorkspacePatch(page: CustomPage) {
  return {
    contentJson: JSON.stringify({ blocks: page.blocks, properties: page.properties ?? [], favorite: page.favorite ?? false, wiki: page.wiki ?? false }),
    icon: page.icon,
    parentNodeId: page.parentNodeId,
    positionKey: page.positionKey,
    title: page.title.trim() || 'Untitled',
  };
}

export async function loadPersistentCustomPages(): Promise<readonly CustomPage[]> {
  const navigation = await window.maxApi.workspace.getNavigation();
  const nodes = await Promise.all(
    // Workspaces created before the home page was removed still carry a 'home'
    // node; it is excluded so it never reappears in the sidebar.
    navigation.pages.filter((page) => page.id !== 'home').map((page) => window.maxApi.workspace.getNode(page.id)),
  );
  return nodes.filter((node): node is WorkspaceNode => node !== null).map(fromWorkspacePage);
}

export async function createPersistentCustomPage(
  title = 'Untitled',
  icon = 'lucide:FileText',
  position = 0,
  parentNodeId?: string | null,
): Promise<CustomPage | undefined> {
  const blocks: readonly NotionBlock[] = [{ content: '', id: `block_${crypto.randomUUID()}`, type: 'text' }];
  const result = await window.maxApi.workspace.createNode({
    contentJson: JSON.stringify({ blocks, favorite: false, wiki: false }),
    icon,
    kind: 'page',
    parentNodeId,
    positionKey: `p${String(position).padStart(8, '0')}`,
    title: title.trim() || 'Untitled',
  });
  return result.ok ? fromWorkspacePage(result.value) : undefined;
}

export async function updatePersistentCustomPage(page: CustomPage, position: number): Promise<void> {
  const result = await window.maxApi.workspace.updateNode(page.id, {
    ...toWorkspacePatch(page),
    positionKey: `p${String(position).padStart(8, '0')}`,
  });
  if (result.ok) window.dispatchEvent(new Event('max:page-content-changed'));
}

export async function archivePersistentCustomPage(page: CustomPage): Promise<void> {
  await window.maxApi.workspace.archiveNode(page.id);
}

export async function loadTrashedPages(): Promise<readonly (CustomPage | WorkspaceNode)[]> {
  const navigation = await window.maxApi.workspace.getNavigation(true);

  const trashedPages = navigation.pages.filter((page) => page.archivedAt && page.id !== 'home');
  const trashedDatabases = navigation.databases.filter((db) => db.archivedAt);

  const pageNodes = await Promise.all(trashedPages.map((page) => window.maxApi.workspace.getNode(page.id)));
  const databaseNodes = await Promise.all(trashedDatabases.map((db) => window.maxApi.workspace.getNode(db.id)));

  const customPages = pageNodes.filter((node): node is WorkspaceNode => node !== null).map(fromWorkspacePage);

  return [...customPages, ...databaseNodes.filter((node): node is WorkspaceNode => node !== null && node.kind === 'database')];
}

export async function restoreTrashedPage(id: string): Promise<boolean> {
  const restored = await window.maxApi.workspace.restoreNode(id);
  if (!restored.ok) return false;
  window.dispatchEvent(new Event('max:pages-restored'));
  return true;
}

export async function emptyPageTrash(): Promise<void> {
  // Workspace pages retain auditable history. Archived pages are intentionally
  // kept until a dedicated audited permanent-delete operation exists.
}

export function loadCustomPages(): readonly CustomPage[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as readonly CustomPage[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveCustomPages(pages: readonly CustomPage[]): void {
  try {
    window.localStorage.setItem(CUSTOM_PAGES_KEY, JSON.stringify(pages));
  } catch {
    // ignore
  }
}

export function createCustomPage(title = '', icon = 'lucide:FileText'): CustomPage {
  const newPage: CustomPage = {
    blocks: [
      {
        content: '',
        id: 'block_' + Math.random().toString(36).substring(2, 9),
        type: 'text',
      },
    ],
    createdAt: new Date().toISOString(),
    icon,
    id: 'page_' + Math.random().toString(36).substring(2, 9),
    title,
    updatedAt: new Date().toISOString(),
  };

  const current = loadCustomPages();
  saveCustomPages([...current, newPage]);
  return newPage;
}

export function duplicateCustomPage(page: CustomPage): CustomPage {
  const copy: CustomPage = {
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      id: 'block_' + Math.random().toString(36).substring(2, 9),
    })),
    createdAt: new Date().toISOString(),
    id: 'page_' + Math.random().toString(36).substring(2, 9),
    title: page.title ? `${page.title} copy` : '',
    updatedAt: new Date().toISOString(),
  };
  saveCustomPages([...loadCustomPages(), copy]);
  return copy;
}

export function updateCustomPage(id: string, update: Partial<Omit<CustomPage, 'id' | 'createdAt'>>): CustomPage | undefined {
  const current = loadCustomPages();
  let updatedPage: CustomPage | undefined;
  const next = current.map((p) => {
    if (p.id === id) {
      updatedPage = {
        ...p,
        ...update,
        updatedAt: new Date().toISOString(),
      };
      return updatedPage;
    }
    return p;
  });

  if (updatedPage) {
    saveCustomPages(next);
  }
  return updatedPage;
}

export function deleteCustomPage(id: string): void {
  const current = loadCustomPages();
  const deleted = current.find((page) => page.id === id);
  if (deleted) {
    try {
      const raw = window.localStorage.getItem(LEGACY_TRASHED_PAGES_KEY);
      const trash = raw ? JSON.parse(raw) as readonly CustomPage[] : [];
      window.localStorage.setItem(LEGACY_TRASHED_PAGES_KEY, JSON.stringify([...trash, deleted]));
    } catch {
      // The active workspace still remains usable if local recovery storage is unavailable.
    }
  }
  saveCustomPages(current.filter((p) => p.id !== id));
}

