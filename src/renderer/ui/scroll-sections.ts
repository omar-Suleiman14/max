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
  // 1. Notion Block Editor Canvas
  const canvas = root.querySelector('.notion-editor-canvas');
  if (canvas) {
    // Collect heading blocks, embedded database views, and top-level callouts
    const sectionBlocks = [...canvas.querySelectorAll<HTMLElement>(
      ':scope > .notion-block-row[data-scroll-kind="h1"], ' +
      ':scope > .notion-block-row[data-scroll-kind="h2"], ' +
      ':scope > .notion-block-row[data-scroll-kind="h3"], ' +
      ':scope > .notion-block-row[data-scroll-kind="database-view"], ' +
      ':scope > .notion-block-row[data-scroll-kind="callout"]'
    )].filter((el) => !el.closest('[role="dialog"]') && !el.classList.contains('sr-only'));

    // If the page has structured headings/views, use them; otherwise use all visible content blocks
    const targets = sectionBlocks.length > 0
      ? sectionBlocks
      : [...canvas.querySelectorAll<HTMLElement>(':scope > .notion-block-row')]
          .filter((el) => el.dataset.scrollKind !== 'divider' && !el.closest('[role="dialog"]'));

    return targets.map((el) => {
      const heading = el.querySelector<HTMLElement>('h1, h2, h3, [contenteditable="true"]');
      const label = (el.dataset.scrollLabel || heading?.textContent || el.textContent || '').trim().replace(/\s+/g, ' ');
      const isDb = el.dataset.scrollKind === 'database-view';
      return {
        element: el,
        preview: isDb
          ? (locale === 'ar' ? 'الانتقال إلى قاعدة بيانات هذه الصفحة' : "Jump to this page's database")
          : (el.textContent ?? '').trim().slice(0, 180),
        title: label.slice(0, 80) || (locale === 'ar' ? 'قسم' : 'Section'),
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
