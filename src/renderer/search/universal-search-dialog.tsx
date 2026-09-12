import {
  Ban,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  FileText,
  Layout,
  Package,
  Receipt,
  Search,
  Settings2,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { SearchResult, SearchResultKind } from '../../shared/views-search-contract';
import type { WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { localeDigit, shortcutDigit } from '../app/keyboard';
import { FocusedOverlay } from '../ui/focused-overlay';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { searchCopy } from './search-i18n';

const QuickActionForm = lazy(() => import('../workflows/quick-action-form').then((module) => ({ default: module.QuickActionForm })));

export type SearchPopupMode = 'actions' | 'search';

type UniversalSearchDialogProps = Readonly<{
  locale: Locale;
  mode: SearchPopupMode;
  onClose: () => void;
  onModeChange: (mode: SearchPopupMode, actionId?: string) => void;
  onOpenQuickActionSettings: () => void;
  onSelect: (result: UniversalSearchResult) => void;
  /** Action to open directly, rather than listing them. */
  quickActionId?: string;
  /** False when Quick Actions are switched off for the workspace. */
  quickActionsEnabled?: boolean;
}>;

export type UniversalSearchResult = SearchResult | Readonly<{
  blocked?: boolean;
  databaseId?: string;
  id: string;
  kind: 'action' | 'database' | 'record';
  matchScore: number;
  metadata?: string;
  subtitle?: string;
  title: string;
}>;

type Section = Readonly<{ items: readonly UniversalSearchResult[]; title: string }>;

function resultIcon(kind: SearchResultKind | 'action' | 'database' | 'record') {
  switch (kind) {
    case 'action':
      return <Zap aria-hidden="true" size={15} />;
    case 'item':
      return <Package aria-hidden="true" size={15} />;
    case 'person':
      return <Users aria-hidden="true" size={15} />;
    case 'account':
      return <Wallet aria-hidden="true" size={15} />;
    case 'transaction':
      return <Receipt aria-hidden="true" size={15} />;
    case 'view':
      return <Bookmark aria-hidden="true" size={15} />;
    case 'database':
    case 'page':
      return <Layout aria-hidden="true" size={15} />;
    default:
      return <FileText aria-hidden="true" size={15} />;
  }
}

function toActionResult(workflow: WorkspaceWorkflow, locale: Locale): UniversalSearchResult {
  return {
    blocked: !workflow.enabled,
    id: workflow.id,
    kind: 'action' as const,
    matchScore: 2,
    metadata: workflow.enabled ? undefined : (locale === 'ar' ? 'موقوف' : 'Turned off'),
    subtitle: undefined,
    title: workflow.name,
  };
}

export function UniversalSearchDialog({
  locale,
  mode,
  onClose,
  onModeChange,
  onOpenQuickActionSettings,
  onSelect,
  quickActionId,
  quickActionsEnabled = true,
}: UniversalSearchDialogProps) {
  const ar = locale === 'ar';
  const [term, setTerm] = useState('');
  const [actions, setActions] = useState<readonly WorkspaceWorkflow[]>([]);
  const [matches, setMatches] = useState<readonly UniversalSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Where 'back' should land: the scope the action was opened from.
  const originRef = useRef<SearchPopupMode>('search');
  const trimmed = term.trim();
  const openAction = quickActionId ? actions.find((action) => action.id === quickActionId) : undefined;
  const showingAction = quickActionsEnabled && mode === 'actions' && Boolean(quickActionId);
  // The popup normally searches everything; this scope is the quick-action
  // list on its own, reached from the toolbar rather than from a shortcut.
  const actionsOnly = quickActionsEnabled && mode === 'actions' && !quickActionId;

  const loadActions = useCallback(async () => {
    if (!quickActionsEnabled) {
      setActions([]);
      return;
    }
    const rows = await window.maxApi.workspace.listWorkflows();
    // Archived actions are gone. Switched-off ones are still listed, marked as
    // off, so "where did my action go" has an answer other than silence.
    setActions(rows.filter((row) => !row.archivedAt));
  }, [quickActionsEnabled]);

  useEffect(() => { void loadActions().catch(() => setActions([])); }, [loadActions]);

  useEffect(() => {
    if (showingAction) return;
    inputRef.current?.focus();
  }, [showingAction]);

  useEffect(() => {
    if (showingAction) return;
    setActiveIndex(0);
    if (actionsOnly || !trimmed) {
      setMatches([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [legacyResults, workspaceResults] = await Promise.all([
            window.maxApi.search.query(trimmed),
            window.maxApi.workspace.searchWorkspace(trimmed, 40),
          ]);
          if (!active) return;
          const generic: readonly UniversalSearchResult[] = workspaceResults.map((result) => ({
            databaseId: result.databaseId,
            id: result.entityId,
            kind: result.entityKind,
            matchScore: 1,
            metadata: result.displayMetadata,
            subtitle: result.displaySubtitle,
            title: result.displayTitle,
          }));
          const seen = new Set(generic.map((result) => result.id));
          setMatches([...generic, ...legacyResults.filter((result) => !seen.has(result.id))]);
        } catch {
          if (active) setMatches([]);
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 100);

    return () => { active = false; clearTimeout(timer); };
  }, [actionsOnly, showingAction, trimmed]);

  const sections = useMemo<readonly Section[]>(() => {
    const needle = trimmed.toLocaleLowerCase(locale);
    const actionItems = (quickActionsEnabled ? actions : [])
      .filter((action) => !needle || action.name.toLocaleLowerCase(locale).includes(needle))
      .slice(0, trimmed ? 6 : 9)
      .map((action) => toActionResult(action, locale));

    const groups: Section[] = [];
    if (actionItems.length > 0) groups.push({ items: actionItems, title: ar ? 'إجراءات' : 'Actions' });
    if (!actionsOnly && matches.length > 0) groups.push({ items: matches, title: ar ? 'النتائج' : 'Results' });
    return groups;
  }, [actions, actionsOnly, ar, locale, matches, quickActionsEnabled, trimmed]);

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const safeIndex = Math.min(activeIndex, Math.max(flat.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex, sections]);

  const choose = useCallback((result: UniversalSearchResult | undefined) => {
    if (!result) return;
    // An action opens right here, in the popup, on its own screen.
    if (result.kind === 'action') {
      originRef.current = mode;
      onModeChange('actions', result.id);
      return;
    }
    onSelect(result);
    onClose();
  }, [mode, onClose, onModeChange, onSelect]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(flat.length > 0 ? (safeIndex + 1) % flat.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(flat.length > 0 ? (safeIndex - 1 + flat.length) % flat.length : 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!loading) choose(flat[safeIndex]);
    } else if (!trimmed && (event.ctrlKey || event.metaKey || event.altKey)) {
      // Digits run the listed actions, on Arabic keyboards too.
      const digit = shortcutDigit(event);
      const action = digit === null ? undefined : sections[0]?.items[digit - 1];
      if (action?.kind === 'action') {
        event.preventDefault();
        choose(action);
      }
    }
  }

  const Back = ar ? ChevronRight : ChevronLeft;
  let rowIndex = -1;

  return (
    <FocusedOverlay className="search-dialog-overlay" labelId="search-dialog-title" onClose={() => { if (!actionBusy) onClose(); }}>
      <div className="search-dialog" data-mode={showingAction ? 'action' : 'search'} dir={ar ? 'rtl' : 'ltr'}>
        {showingAction ? (
          <header className="search-dialog__action-bar">
            <button
              aria-label={ar ? 'رجوع' : 'Back'}
              className="search-dialog__back"
              disabled={actionBusy}
              onClick={() => onModeChange(originRef.current === 'actions' ? 'actions' : 'search')}
              type="button"
            >
              <Back aria-hidden="true" size={17} />
            </button>
            <div className="search-dialog__action-title">
              <PageIconRenderer icon={openAction?.icon || 'lucide:Zap'} size={16} />
              <h2 id="search-dialog-title">{openAction?.name ?? (ar ? 'إجراء سريع' : 'Quick action')}</h2>
            </div>
            <button
              aria-label={ar ? 'إعدادات الإجراءات السريعة' : 'Quick action settings'}
              className="search-dialog__icon-button"
              disabled={actionBusy}
              onClick={onOpenQuickActionSettings}
              type="button"
            >
              <Settings2 aria-hidden="true" size={16} />
            </button>
          </header>
        ) : (
          <>
            <h2 className="sr-only" id="search-dialog-title">
              {actionsOnly ? (ar ? 'الإجراءات السريعة' : 'Quick Actions') : searchCopy(locale, 'search')}
            </h2>
            <div className="search-dialog__field">
              {actionsOnly
                ? <span className="search-dialog__scope"><Zap aria-hidden="true" size={13} />{ar ? 'إجراءات' : 'Actions'}</span>
                : <Search aria-hidden="true" className="search-dialog__field-icon" size={17} />}
              <input
                ref={inputRef}
                data-autofocus="true"
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls="workspace-search-results"
                aria-activedescendant={flat[safeIndex] ? `workspace-search-result-${safeIndex}` : undefined}
                aria-label={searchCopy(locale, 'search')}
                className="search-dialog__input"
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!quickActionsEnabled ? (ar ? '???? ?? ???? ?? ????' : 'Search pages and records?') : actionsOnly
                  ? (ar ? 'ابحث في الإجراءات السريعة…' : 'Search quick actions…')
                  : (ar ? 'ابحث عن إجراء أو صفحة أو سجل…' : 'Search actions, pages, and records…')}
                type="text"
                value={term}
              />
            </div>
          </>
        )}

        {showingAction ? (
          <div className="search-dialog__action-body">
            <Suspense fallback={<p className="search-dialog__empty" role="status">{ar ? 'جار التحميل…' : 'Loading…'}</p>}>
              {openAction
                ? <QuickActionForm
                    action={openAction}
                    locale={locale}
                    onBusyChange={setActionBusy}
                    onEnabled={() => void loadActions()}
                    onOpenSettings={onOpenQuickActionSettings}
                  />
                : <p className="search-dialog__empty" role="status">{ar ? 'جار التحميل…' : 'Loading…'}</p>}
            </Suspense>
          </div>
        ) : (
          <div
            ref={listRef}
            aria-busy={loading}
            aria-label={searchCopy(locale, 'search')}
            className="search-dialog__list"
            id="workspace-search-results"
            role="listbox"
          >
            {sections.map((section) => (
              <div className="search-dialog__group" key={section.title}>
                <p className="search-dialog__group-title">{section.title}</p>
                {section.items.map((item) => {
                  rowIndex += 1;
                  const index = rowIndex;
                  const isActive = index === safeIndex;
                  const blocked = 'blocked' in item && item.blocked;
                  const isAction = item.kind === 'action';
                  const digit = isAction && !trimmed && index < 9 ? localeDigit(index + 1, locale) : undefined;
                  return (
                    <div
                      aria-selected={isActive}
                      className="search-row"
                      data-blocked={blocked || undefined}
                      id={`workspace-search-result-${index}`}
                      key={`${item.kind}-${item.id}`}
                      onClick={() => choose(item)}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      <span className="search-row__icon">{blocked ? <Ban aria-hidden="true" size={15} /> : resultIcon(item.kind)}</span>
                      <span className="search-row__text">
                        <span className="search-row__title">{item.title}</span>
                        {item.subtitle && <span className="search-row__subtitle">{item.subtitle}</span>}
                      </span>
                      {item.metadata && <span className="search-row__meta">{item.metadata}</span>}
                      {digit && <kbd className="search-row__shortcut">Ctrl {digit}</kbd>}
                      {isActive
                        ? <CornerDownLeft aria-hidden="true" className="search-row__enter" size={14} />
                        : <ChevronRight aria-hidden="true" className="search-row__chevron" size={14} />}
                    </div>
                  );
                })}
              </div>
            ))}

            {loading && flat.length === 0 && (
              <p className="search-dialog__empty" role="status">{ar ? 'جارٍ البحث…' : 'Searching…'}</p>
            )}
            {!loading && flat.length === 0 && (
              <div className="search-dialog__empty">
                {trimmed
                  ? <p>{searchCopy(locale, 'noResults')} <strong>&quot;{term}&quot;</strong></p>
                  : actionsOnly
                    ? <p>{ar ? 'لا توجد إجراءات سريعة بعد.' : 'No quick actions yet.'}</p>
                    : <p>{!quickActionsEnabled ? (ar ? '???? ?? ???? ?? ????? ?????? ?? ???' : 'Search pages, databases, and records') : ar ? 'ابحث عن إجراء أو صفحة أو قاعدة بيانات أو سجل' : 'Search actions, pages, databases, and records'}</p>}
                {quickActionsEnabled && (actionsOnly || (!trimmed && actions.length === 0)) && (
                  <button className="btn btn-secondary" onClick={onOpenQuickActionSettings} type="button">
                    {ar ? 'إدارة الإجراءات السريعة' : 'Manage Quick Actions'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <footer className="search-dialog__footer">
          {showingAction ? (
            <span><kbd>Esc</kbd> {ar ? 'إغلاق' : 'Close'}</span>
          ) : (
            <>
              <span><kbd>↑</kbd><kbd>↓</kbd> {ar ? 'تنقل' : 'Navigate'}</span>
              <span><kbd>Enter</kbd> {ar ? 'اختيار' : 'Select'}</span>
              <span><kbd>Esc</kbd> {ar ? 'إغلاق' : 'Close'}</span>
            </>
          )}
        </footer>
      </div>
    </FocusedOverlay>
  );
}
