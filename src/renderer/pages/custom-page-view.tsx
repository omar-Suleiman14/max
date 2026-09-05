import { useState } from 'react';

import type { CustomPage } from '../app/app-types';
import type { Locale } from '../app/i18n';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import { NotionBlockEditor, type NotionBlock } from '../ui/notion-block-editor';
import { PageIconRenderer } from '../ui/page-icon-renderer';

type CustomPageViewProps = Readonly<{
  isHome?: boolean;
  locale: Locale;
  onUpdatePage: (id: string, update: Partial<Omit<CustomPage, 'createdAt' | 'id'>>) => void;
  onWorkspaceChange?: () => void;
  page: CustomPage;
}>;

export function CustomPageView({
  isHome = false,
  locale,
  onUpdatePage,
  onWorkspaceChange,
  page,
}: CustomPageViewProps) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  function handleTitleChange(newTitle: string) {
    onUpdatePage(page.id, { title: newTitle });
  }

  function handleIconSelect(icon: string) {
    onUpdatePage(page.id, { icon });
    setIconPickerOpen(false);
  }

  function handleBlocksChange(blocks: readonly NotionBlock[]) {
    onUpdatePage(page.id, { blocks });
  }

  const defaultTitlePlaceholder = isHome
    ? locale === 'ar'
      ? 'نظرة عامة على المتجر'
      : 'Shop Overview & Home'
    : locale === 'ar'
      ? 'صفحة بدون عنوان'
      : 'Untitled';

  return (
    <div className="custom-page-view">
      {/* Page Top Banner / Icon + Title Row */}
      <div className="custom-page-header">
        <div className="custom-page-header__icon-wrap">
          <button
            aria-label={locale === 'ar' ? 'تغيير الرمز أو الأيقونة' : 'Change icon or emoji'}
            className="custom-page-icon-btn"
            onClick={() => setIconPickerOpen((open) => !open)}
            title={locale === 'ar' ? 'تغيير الرمز أو الأيقونة' : 'Change icon or emoji'}
            type="button"
          >
            <PageIconRenderer
              className="custom-page-icon-display"
              fallback={isHome ? 'lucide:Home' : 'lucide:FileText'}
              icon={page.icon}
              size={28}
            />
          </button>

          {/* Floating Notion Icon Popover */}
          {iconPickerOpen && (
            <IconPickerDialog
              currentIcon={page.icon}
              locale={locale}
              onClose={() => setIconPickerOpen(false)}
              onSelect={handleIconSelect}
            />
          )}
        </div>

        <div className="custom-page-header__title-row">
          <input
            className="custom-page-title-input"
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={defaultTitlePlaceholder}
            value={page.title}
          />

        </div>
      </div>

      {/* Notion Block Document Canvas */}
      <div className="custom-page-content">
        <NotionBlockEditor
          blocks={page.blocks}
          locale={locale}
          onChange={handleBlocksChange}
          onWorkspaceChange={onWorkspaceChange}
          parentPageId={page.id}
        />
      </div>
    </div>
  );
}
