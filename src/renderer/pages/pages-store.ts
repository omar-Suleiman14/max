import type { CustomPage } from '../app/app-types';
import type { NotionBlock } from '../ui/notion-block-editor';
import type { CustomPage as DatabaseCustomPage } from '../../shared/views-search-contract';

const CUSTOM_PAGES_KEY = 'max:custom_pages';
const LEGACY_TRASHED_PAGES_KEY = 'max:trashed_pages';

function fromDatabasePage(page: DatabaseCustomPage): CustomPage {
  let layout: { blocks?: readonly NotionBlock[]; favorite?: boolean; wiki?: boolean } = {};
  try {
    layout = JSON.parse(page.layoutJson) as typeof layout;
  } catch {
    // A damaged layout remains recoverable as an empty page.
  }
  return {
    blocks: Array.isArray(layout.blocks) ? layout.blocks : [],
    createdAt: page.createdAt,
    favorite: layout.favorite,
    icon: page.icon ?? 'lucide:FileText',
    id: page.id,
    title: page.name,
    updatedAt: page.updatedAt,
    wiki: layout.wiki,
  };
}

function toDatabaseDraft(page: CustomPage, position: number) {
  return {
    icon: page.icon,
    layoutJson: JSON.stringify({ blocks: page.blocks, favorite: page.favorite ?? false, wiki: page.wiki ?? false }),
    name: page.title.trim() || 'Untitled',
    position,
  };
}

export async function loadPersistentCustomPages(): Promise<readonly CustomPage[]> {
  return (await window.maxApi.pages.list()).map(fromDatabasePage);
}

export async function createPersistentCustomPage(title = 'Untitled', icon = 'lucide:FileText', position = 0): Promise<CustomPage | undefined> {
  const blocks: readonly NotionBlock[] = [{ content: '', id: `block_${crypto.randomUUID()}`, type: 'text' }];
  const result = await window.maxApi.pages.create({
    icon,
    layoutJson: JSON.stringify({ blocks, favorite: false, wiki: false }),
    name: title.trim() || 'Untitled',
    position,
  });
  return result.ok ? fromDatabasePage(result.value) : undefined;
}

export async function updatePersistentCustomPage(page: CustomPage, position: number): Promise<void> {
  await window.maxApi.pages.update(page.id, toDatabaseDraft(page, position));
}

export async function archivePersistentCustomPage(page: CustomPage): Promise<void> {
  await window.maxApi.pages.archive(page.id);
}

export async function loadTrashedPages(): Promise<readonly CustomPage[]> {
  return (await window.maxApi.pages.listArchived()).map(fromDatabasePage);
}

export async function restoreTrashedPage(id: string): Promise<CustomPage | undefined> {
  const restored = await window.maxApi.pages.restore(id);
  return restored.ok ? fromDatabasePage(restored.value) : undefined;
}

export async function emptyPageTrash(): Promise<void> {
  await window.maxApi.pages.emptyTrash();
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
}
