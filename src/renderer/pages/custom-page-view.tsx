import { useWorkspaceDisplay } from './workspace-display-preferences';
import { useRef, useState } from 'react';
import { PageConnections } from './page-connections';

import type { CustomPage } from '../app/app-types';
import type { Locale } from '../app/i18n';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import type { NotionBlock } from '../editor/page-blocks';
import { MaxBlockEditor } from '../editor/max-block-editor';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { AddCoverButton, PageCover } from './page-cover';
import { PageProperties } from './page-properties';
import '../databases/database.css';


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
  const [connectionsEnabled] = useWorkspaceDisplay('connections');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement>(null);

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
      ? 'نظرة عامة على مساحة العمل'
      : 'Workspace overview'
    : locale === 'ar'
      ? 'صفحة بدون عنوان'
      : 'Untitled';

  return (
    <div className="custom-page-view" data-database-page={page.blocks.some((block) => block.type === 'database-view' && !!block.databaseId)}>
      {page.cover && (
        <PageCover
          cover={page.cover}
          locale={locale}
          onChange={(cover) => onUpdatePage(page.id, { cover })}
        />
      )}

      {/* Page Top Banner / Icon + Title Row */}
      <div className="custom-page-header" data-has-cover={page.cover ? 'true' : undefined}>
        {!page.cover && <AddCoverButton locale={locale} onChange={(cover) => onUpdatePage(page.id, { cover })} />}
        <div className="custom-page-header__icon-wrap">
          <button
            ref={iconButtonRef}
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
              size={page.cover ? 64 : 40}
            />
          </button>

          {iconPickerOpen && (
            <IconPickerDialog
              anchor={iconButtonRef.current}
              currentIcon={page.icon}
              locale={locale}
              onClose={() => setIconPickerOpen(false)}
              onSelect={handleIconSelect}
            />
          )}
        </div>

        <div className="custom-page-header__title-row">
          <textarea
            rows={1}
            aria-label={locale === 'ar' ? 'عنوان الصفحة' : 'Page title'}
            ref={(element) => { if (element) { element.style.height = '0px'; element.style.height = `${element.scrollHeight}px`; } }}
            className="custom-page-title-input"
            onChange={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const firstInput = e.currentTarget.closest('.custom-page-view')?.querySelector('.max-block-editor [contenteditable="true"]');
                if (firstInput instanceof HTMLElement) {
                  firstInput.focus();
                }
              }
            }}
            placeholder={defaultTitlePlaceholder}
            value={page.title}
          />

        </div>
      </div>

      {/* Notion Block Document Canvas */}
      <PageProperties createdAt={page.createdAt} properties={page.properties} locale={locale} onChange={(properties) => onUpdatePage(page.id, { properties })} updatedAt={page.updatedAt} />
      <div
        className="custom-page-content"
        onClick={(e) => {
          // Clicking the empty space around/below the editor focuses the last block
          if (e.target === e.currentTarget) {
            const canvas = e.currentTarget.querySelector('.max-block-editor');
            if (canvas instanceof HTMLElement) canvas.click();
          }
        }}
      >
        {page.readOnlySource !== undefined ? <p role="alert">{locale === 'ar' ? 'تعذر فتح محتوى هذه الصفحة بأمان. تم الاحتفاظ بالمحتوى الأصلي دون تغيير.' : 'This page content cannot be opened safely. Its original content has been preserved unchanged.'}</p> : <MaxBlockEditor
              blocks={page.blocks}
              locale={locale}
              onChange={handleBlocksChange}
              onWorkspaceChange={onWorkspaceChange}
              parentPageId={page.id}
            />}
      </div>
      {connectionsEnabled && <PageConnections pageId={page.id} locale={locale} />}
    </div>
  );
}
