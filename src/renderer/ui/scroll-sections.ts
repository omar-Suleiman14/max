import type { Locale } from '../app/i18n';

export type SectionMarker = {
  element: HTMLElement;
  preview: string;
  title: string;
};

/**
 * Discovers the actual content sections within the page container.
 * Dynamically counts headings, embedded database views, and top-level sections
 * so the indicator rail accurately reflects the page structure and section count.
 */
export function findContentSections(root: HTMLElement, locale: Locale): SectionMarker[] {
  // 1. The page editor: its top-level blocks, not those nested in columns.
  const editor = root.querySelector<HTMLElement>('.max-block-editor');
  if (editor) {
    const kindOf = (row: HTMLElement) => row.querySelector<HTMLElement>(':scope > .bn-block > .bn-block-content')?.dataset.contentType ?? '';
    const rows = [...editor.querySelectorAll<HTMLElement>('.bn-block-outer')]
      .filter((row) => row.parentElement?.parentElement?.classList.contains('bn-editor') && row.closest('.max-block-editor') === editor)
      .filter((row) => !row.closest('[role="dialog"]'));
    const sectionRows = rows.filter((row) => ['heading', 'database', 'callout'].includes(kindOf(row)));
    // A page without headings, views or callouts is outlined line by line.
    const targets = sectionRows.length > 0 ? sectionRows : rows.filter((row) => kindOf(row) !== 'divider');

    return targets.map((el) => {
      const isDb = kindOf(el) === 'database';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
      const label = el.dataset.scrollLabel || (isDb ? el.querySelector('h1, h2, h3')?.textContent?.trim() : text) || '';
      return {
        element: el,
        preview: isDb
          ? (locale === 'ar' ? 'الانتقال إلى قاعدة بيانات هذه الصفحة' : "Jump to this page's database")
          : text.slice(0, 180),
        title: label.slice(0, 80) || (isDb ? (locale === 'ar' ? 'قاعدة بيانات' : 'Database') : (locale === 'ar' ? 'قسم' : 'Section')),
      };
    });
  }

  // 2. Settings Page Sections
  const settingsSections = [...root.querySelectorAll<HTMLElement>('.settings-scroll-section')]
    .filter((el) => !el.closest('[role="dialog"]'));
  if (settingsSections.length > 0) {
    return settingsSections.map((el) => {
      const internalHeading = el.querySelector<HTMLElement>('h2, h3, strong');
      const prevSibling = el.previousElementSibling;
      const externalHeading = prevSibling?.tagName.match(/^H[1-6]$/i) ? prevSibling : null;
      const heading = internalHeading || externalHeading;
      const label = (el.dataset.scrollLabel || heading?.textContent || '').trim().replace(/\s+/g, ' ');
      return {
        element: el,
        preview: (heading?.textContent ?? el.textContent ?? '').trim().slice(0, 180),
        title: label.slice(0, 80) || (locale === 'ar' ? 'قسم' : 'Section'),
      };
    });
  }

  // 3. General Workspaces & Database Views (Tables, Drawer cards, Reports, Headings)
  const candidateNodes = [...root.querySelectorAll<HTMLElement>(
    'section[class*="-section"], ' +
    'section.object-workspace, ' +
    '.active-drawer-card, ' +
    '.database-page-header, ' +
    '.database-page-content, ' +
    'h1:not([role="dialog"] *), ' +
    'h2:not([role="dialog"] *), ' +
    'h3:not([role="dialog"] *)'
  )].filter((el) => !el.classList.contains('sr-only') && !el.closest('[role="dialog"]'));

  // Deduplicate: avoid including both a parent section and its internal heading
  const uniqueElements: HTMLElement[] = [];
  for (const node of candidateNodes) {
    if (uniqueElements.some((parent) => parent.contains(node))) continue;
    uniqueElements.push(node);
  }

  return uniqueElements.map((el) => {
    const heading = el.matches('h1, h2, h3') ? el : el.querySelector<HTMLElement>('h1, h2, h3, strong');
    const label = (el.dataset.scrollLabel || heading?.textContent || '').trim().replace(/\s+/g, ' ');
    return {
      element: el,
      preview: (el.textContent ?? '').trim().slice(0, 180),
      title: label.slice(0, 80) || (locale === 'ar' ? 'قسم' : 'Section'),
    };
  });
}
