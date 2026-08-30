import type { CustomPage } from '../app/app-types';
import type { NotionBlock } from '../ui/notion-block-editor';

const CUSTOM_PAGES_KEY = 'max:custom_pages';

export const defaultHomeBlocks: readonly NotionBlock[] = [
  {
    content: 'Shop Dashboard & Overview',
    id: 'block_welcome_h1',
    type: 'h1',
  },
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
  saveCustomPages(current.filter((p) => p.id !== id));
}

// Home page block storage
const HOME_PAGE_BLOCKS_KEY = 'max:home_page_blocks';
const HOME_PAGE_META_KEY = 'max:home_page_meta';

export function loadHomePage(): CustomPage {
  let blocks = defaultHomeBlocks;
  let title = '';
  let icon = 'lucide:Home';

  try {
    const rawBlocks = window.localStorage.getItem(HOME_PAGE_BLOCKS_KEY);
    if (rawBlocks) {
      const parsed = JSON.parse(rawBlocks) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        blocks = parsed as readonly NotionBlock[];
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
