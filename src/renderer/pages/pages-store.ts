import type { CustomPage } from '../app/app-types';
import type { NotionBlock } from '../ui/notion-block-editor';
import type { WorkspaceNode } from '../../shared/workspace-contract';

const CUSTOM_PAGES_KEY = 'max:custom_pages';
const LEGACY_TRASHED_PAGES_KEY = 'max:trashed_pages';

function fromWorkspacePage(page: WorkspaceNode): CustomPage {
  let layout: { blocks?: readonly NotionBlock[]; favorite?: boolean; wiki?: boolean } = {};
  try {
    const parsed = JSON.parse(page.contentJson) as unknown;
    layout = Array.isArray(parsed) ? { blocks: parsed as readonly NotionBlock[] } : parsed as typeof layout;
  } catch {
    // A damaged layout remains recoverable as an empty page.
  }
  return {
    blocks: Array.isArray(layout.blocks) ? layout.blocks : [],
    createdAt: page.createdAt,
    favorite: layout.favorite,
    icon: page.icon ?? 'lucide:FileText',
    id: page.id,
    title: page.title,
    updatedAt: page.updatedAt,
    wiki: layout.wiki,
  };
}

function toWorkspacePatch(page: CustomPage) {
  return {
    contentJson: JSON.stringify({ blocks: page.blocks, favorite: page.favorite ?? false, wiki: page.wiki ?? false }),
    icon: page.icon,
    title: page.title.trim() || 'Untitled',
  };
}

export async function loadPersistentCustomPages(): Promise<readonly CustomPage[]> {
  const navigation = await window.maxApi.workspace.getNavigation();
  const nodes = await Promise.all(
    navigation.pages.filter((page) => page.id !== 'home').map((page) => window.maxApi.workspace.getNode(page.id)),
  );
  return nodes.filter((node): node is WorkspaceNode => node !== null).map(fromWorkspacePage);
}

export async function createPersistentCustomPage(title = 'Untitled', icon = 'lucide:FileText', position = 0): Promise<CustomPage | undefined> {
  const blocks: readonly NotionBlock[] = [{ content: '', id: `block_${crypto.randomUUID()}`, type: 'text' }];
  const result = await window.maxApi.workspace.createNode({
    contentJson: JSON.stringify({ blocks, favorite: false, wiki: false }),
    icon,
    kind: 'page',
    positionKey: `p${String(position).padStart(8, '0')}`,
    title: title.trim() || 'Untitled',
  });
  return result.ok ? fromWorkspacePage(result.value) : undefined;
}

export async function updatePersistentCustomPage(page: CustomPage, position: number): Promise<void> {
  void position;
  await window.maxApi.workspace.updateNode(page.id, toWorkspacePatch(page));
}

export async function archivePersistentCustomPage(page: CustomPage): Promise<void> {
  await window.maxApi.workspace.archiveNode(page.id);
}

export async function loadTrashedPages(): Promise<readonly CustomPage[]> {
  const navigation = await window.maxApi.workspace.getNavigation(true);
  const nodes = await Promise.all(
    navigation.pages.filter((page) => page.archivedAt && page.id !== 'home').map((page) => window.maxApi.workspace.getNode(page.id)),
  );
  return nodes.filter((node): node is WorkspaceNode => node !== null).map(fromWorkspacePage);
}

export async function restoreTrashedPage(id: string): Promise<CustomPage | undefined> {
  const restored = await window.maxApi.workspace.restoreNode(id);
  return restored.ok ? fromWorkspacePage(restored.value) : undefined;
}

export async function emptyPageTrash(): Promise<void> {
  // Workspace pages retain auditable history. Archived pages are intentionally
  // kept until a dedicated audited permanent-delete operation exists.
}

export async function loadPersistentHomePage(locale: 'ar' | 'en' = 'en'): Promise<CustomPage> {
  const existing = await window.maxApi.workspace.getNode('home');
  if (existing) return fromWorkspacePage(existing);

  const local = loadHomePage(locale);
  const created = await window.maxApi.workspace.createNode({
    contentJson: JSON.stringify({ blocks: local.blocks, favorite: false, wiki: false }),
    icon: local.icon,
    id: 'home',
    kind: 'page',
    positionKey: 'p00000000',
    title: local.title,
  });
  return created.ok ? fromWorkspacePage(created.value) : local;
}

export const defaultHomeBlocks: readonly NotionBlock[] = [
  {
    content: 'Welcome to Max. You can type **/** anywhere to insert headings, notes, bullet lists, or embed live interactive database tables directly into this page.',
    id: 'block_welcome_callout',
    type: 'callout',
  },
  {
    content: '',
    id: 'block_divider_1',
    type: 'divider',
  },
  {
    content: 'Quick Notes & Priorities',
    id: 'block_notes_h2',
    type: 'h2',
  },
  {
    content: 'Track daily cash reconciliation before closing drawer.',
    id: 'block_note_1',
    type: 'bullet',
  },
  {
    content: 'Review low stock items and contact suppliers for reorders.',
    id: 'block_note_2',
    type: 'bullet',
  },
  {
    content: '',
    id: 'block_divider_2',
    type: 'divider',
  },
  {
    content: 'items',
    id: 'block_db_items',
    type: 'database-view',
  },
];

const defaultHomeBlocksArabic: readonly NotionBlock[] = [
  { content: 'هذه مساحتك اليومية في ماكس. أضف ملاحظاتك أو أدرج جدولًا مباشرًا باستخدام الأمر /.', id: 'block_welcome_callout', type: 'callout' },
  { content: '', id: 'block_divider_1', type: 'divider' },
  { content: 'أولويات اليوم', id: 'block_notes_h2', type: 'h2' },
  { content: 'راجِع رصيد الخزينة قبل الإغلاق.', id: 'block_note_1', type: 'bullet' },
  { content: 'تابِع الأصناف قليلة المخزون وطلبات الموردين.', id: 'block_note_2', type: 'bullet' },
  { content: '', id: 'block_divider_2', type: 'divider' },
  { content: 'items', id: 'block_db_items', type: 'database-view' },
];

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

// Home page block storage
const HOME_PAGE_BLOCKS_KEY = 'max:home_page_blocks';
const HOME_PAGE_META_KEY = 'max:home_page_meta';

export function loadHomePage(locale: 'ar' | 'en' = 'en'): CustomPage {
  let blocks = locale === 'ar' ? defaultHomeBlocksArabic : defaultHomeBlocks;
  let title = locale === 'ar' ? 'الرئيسية' : 'Home';
  let icon = 'lucide:Home';

  try {
    const rawBlocks = window.localStorage.getItem(HOME_PAGE_BLOCKS_KEY);
    if (rawBlocks) {
      const parsed = JSON.parse(rawBlocks) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        blocks = (parsed as readonly NotionBlock[]).filter((block) => block.id !== 'block_welcome_h1');
      }
    }

    const rawMeta = window.localStorage.getItem(HOME_PAGE_META_KEY);
    if (rawMeta) {
      const parsedMeta = JSON.parse(rawMeta) as { icon?: string; title?: string };
      if (typeof parsedMeta.title === 'string') title = parsedMeta.title;
      if (typeof parsedMeta.icon === 'string') icon = parsedMeta.icon;
    }
  } catch {
    // fallback
  }

  return {
    blocks,
    createdAt: '',
    icon,
    id: 'home',
    title,
    updatedAt: '',
  };
}

export function saveHomePage(page: Pick<CustomPage, 'blocks' | 'icon' | 'title'>): void {
  try {
    window.localStorage.setItem(HOME_PAGE_BLOCKS_KEY, JSON.stringify(page.blocks));
    window.localStorage.setItem(
      HOME_PAGE_META_KEY,
      JSON.stringify({ icon: page.icon, title: page.title }),
    );
  } catch {
    // ignore
  }
  void window.maxApi.workspace.updateNode('home', {
    contentJson: JSON.stringify({ blocks: page.blocks, favorite: false, wiki: false }),
    icon: page.icon,
    title: page.title.trim() || 'Home',
  });
}
