/* eslint-disable react-refresh/only-export-components -- BlockNote block specs, the schema, the editor context and the keyboard extension are module-level objects, not components. */
/**
 * The BlockNote schema Max edits pages with.
 *
 * It keeps BlockNote's text blocks and adds Max's own blocks as custom specs.
 * Styles are limited to what Max's inline format stores, so nothing can be
 * typed that a save would then silently drop.
 */
import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { createReactBlockSpec, createReactInlineContentSpec, createReactStyleSpec } from '@blocknote/react';
import { AlertTriangle, Database, FileText, Link2 } from 'lucide-react';
import { createContext, lazy, Suspense, useContext, useRef, useState, type ComponentType, type FormEvent } from 'react';

import type { Locale } from '../app/i18n';
import type { NavigationItem } from '../../shared/workspace-contract';
import { DatabaseSkeleton } from '../databases/DatabaseSkeleton';
import { LegacyDatabaseLink } from '../databases/LegacyDatabaseLink';
import { ExtraBlock } from '../pages/extra-blocks';
import { openPage, usePageGraph } from '../pages/page-graph-store';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import type { NotionBlock } from './page-blocks';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { inlinePlainText } from '../../shared/max-inline';

const DatabasePage = lazy(() => import('../databases/DatabasePage').then((module) => ({ default: module.DatabasePage })));

export type NestedEditorProps = Readonly<{
  blocks: readonly NotionBlock[];
  onChange: (blocks: readonly NotionBlock[]) => void;
}>;

export type MaxEditorContextValue = Readonly<{
  locale: Locale;
  parentPageId?: string;
  onWorkspaceChange?: () => void;
  /** Columns hold whole documents of their own, edited by the same editor. */
  NestedEditor: ComponentType<NestedEditorProps>;
}>;

export const MaxEditorContext = createContext<MaxEditorContextValue | null>(null);

function useMaxEditor(): MaxEditorContextValue {
  const value = useContext(MaxEditorContext);
  if (!value) throw new Error('Max blocks render inside MaxBlockEditor.');
  return value;
}

const colourProps = {
  backgroundColor: { default: 'default' as const },
  textColor: { default: 'default' as const },
};

export const calloutBlock = createReactBlockSpec(
  { content: 'inline', propSchema: { ...colourProps, icon: { default: 'lucide:Info' } }, type: 'callout' },
  {
    render: function Callout({ block, contentRef, editor }) {
      const { locale } = useMaxEditor();
      const [picking, setPicking] = useState(false);
      const button = useRef<HTMLButtonElement>(null);
      const ar = locale === 'ar';
      return <div className="max-callout" data-background={block.props.backgroundColor}>
        <button
          ref={button}
          aria-label={ar ? 'تغيير أيقونة الملاحظة' : 'Change callout icon'}
          className="max-callout__icon"
          contentEditable={false}
          onClick={() => setPicking((open) => !open)}
          type="button"
        >
          <PageIconRenderer fallback="lucide:Info" icon={block.props.icon} size={20} />
        </button>
        {picking && <IconPickerDialog
          anchor={button.current}
          currentIcon={block.props.icon}
          locale={locale}
          onClose={() => setPicking(false)}
          onSelect={(icon) => { editor.updateBlock(block, { props: { icon } }); setPicking(false); }}
        />}
        <div className="max-callout__content" ref={contentRef} />
      </div>;
    },
  },
);

function parseColumns(source: string): [readonly NotionBlock[], readonly NotionBlock[]] {
  try {
    const value = JSON.parse(source) as unknown;
    if (Array.isArray(value) && Array.isArray(value[0]) && Array.isArray(value[1])) return [value[0] as NotionBlock[], value[1] as NotionBlock[]];
  } catch { /* Fall through to empty columns. */ }
  return [[], []];
}

export const columnsBlock = createReactBlockSpec(
  { content: 'none', propSchema: { columns: { default: '[[],[]]' } }, type: 'columns' },
  {
    render: function Columns({ block, editor }) {
      const { NestedEditor } = useMaxEditor();
      const columns = parseColumns(block.props.columns);
      // Read the latest prop at write time: both columns share one block.
      const write = (index: 0 | 1, next: readonly NotionBlock[]) => {
        const current = editor.getBlock(block.id);
        if (!current || current.type !== 'columns') return;
        const latest = parseColumns((current.props as { columns: string }).columns);
        latest[index] = next;
        editor.updateBlock(current, { props: { columns: JSON.stringify(latest) } });
      };
      return <div className="max-columns" contentEditable={false}>
        {columns.map((blocks, index) => <div className="max-columns__column" key={index}>
          <NestedEditor blocks={blocks} onChange={(next) => write(index as 0 | 1, next)} />
        </div>)}
      </div>;
    },
  },
);

function DatabaseSetup({ blockId, onLinked }: { blockId: string; onLinked: (databaseId: string, viewId?: string) => void }) {
  const { locale, onWorkspaceChange, parentPageId } = useMaxEditor();
  const ar = locale === 'ar';
  const [mode, setMode] = useState<'choose' | 'new' | 'link'>('choose');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [databases, setDatabases] = useState<readonly NavigationItem[]>();

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError(undefined);
    try {
      const result = await window.maxApi.workspace.createDatabase({ parentNodeId: parentPageId, title: title.trim(), visibility: 'normal' });
      if (!result.ok) { setError(result.error.message); return; }
      const views = await window.maxApi.workspace.listViews(result.value.id);
      onLinked(result.value.id, views[0]?.id);
      onWorkspaceChange?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  }

  async function link(database: NavigationItem) {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      const views = await window.maxApi.workspace.listViews(database.id);
      const source = views[0];
      const linked = await window.maxApi.workspace.createView({
        databaseId: database.id, filterAst: source?.filterAst, group: source?.group, layout: source?.layout ?? 'table',
        layoutConfig: source?.layoutConfig, name: source?.name ?? database.title, ownerId: blockId, ownerType: 'block',
        propertyState: source?.propertyState, sorts: source?.sorts,
      });
      if (!linked.ok) throw new Error(linked.error.message);
      onLinked(database.id, linked.value.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  }

  function openLink() {
    setMode('link');
    void window.maxApi.workspace.getNavigation().then((navigation) => setDatabases(navigation.databases)).catch((reason: unknown) => setError(String(reason)));
  }

  return <div className="max-database-setup">
    <Database aria-hidden="true" size={18} />
    {mode === 'choose' && <div className="max-database-setup__choices">
      <button type="button" onClick={() => setMode('new')}>{ar ? 'قاعدة بيانات جديدة' : 'New database'}</button>
      <button type="button" onClick={openLink}>{ar ? 'ربط بقاعدة بيانات' : 'Link to a database'}</button>
    </div>}
    {mode === 'new' && <form onSubmit={(event) => void create(event)}>
      <label><span className="sr-only">{ar ? 'اسم قاعدة البيانات' : 'Database name'}</span>
        <input autoFocus placeholder={ar ? 'اسم قاعدة البيانات' : 'Database name'} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button type="button" onClick={() => setMode('choose')}>{ar ? 'رجوع' : 'Back'}</button>
      <button disabled={!title.trim() || busy} type="submit">{busy ? (ar ? 'جارٍ الإنشاء…' : 'Creating…') : (ar ? 'إنشاء' : 'Create')}</button>
    </form>}
    {mode === 'link' && <div className="max-database-setup__list">
      {databases === undefined ? <p>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p> : databases.length ? databases.map((database) => <button disabled={busy} key={database.id} onClick={() => void link(database)} type="button">
        <Database aria-hidden="true" size={16} /><span>{database.title}</span>
      </button>) : <p>{ar ? 'لا توجد قواعد بيانات بعد. ارجع وأنشئ قاعدة بيانات جديدة.' : 'No databases yet. Go back and create a new database.'}</p>}
      <button type="button" onClick={() => setMode('choose')}>{ar ? 'رجوع' : 'Back'}</button>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export const databaseBlock = createReactBlockSpec(
  { content: 'none', propSchema: { databaseId: { default: '' }, databaseKind: { default: '' }, viewId: { default: '' } }, type: 'database' },
  {
    render: function DatabaseBlock({ block, editor }) {
      const { locale } = useMaxEditor();
      const { databaseId, databaseKind, viewId } = block.props;
      return <div className="notion-embedded-db-card max-void-block" contentEditable={false}>
        <div className="notion-embedded-db-content">
          {databaseId ? <Suspense fallback={<DatabaseSkeleton embedded locale={locale} rows={3} />}>
            <DatabasePage databaseId={databaseId} embedded initialViewId={viewId || undefined} locale={locale} onRemoveEmbeddedView={() => editor.removeBlocks([block.id])} />
          </Suspense> : databaseKind ? <LegacyDatabaseLink alias={databaseKind} locale={locale} />
            : <DatabaseSetup blockId={block.id} onLinked={(id, view) => editor.updateBlock(block.id, { props: { databaseId: id, viewId: view ?? '' } })} />}
        </div>
      </div>;
    },
  },
);

/** The void Max blocks that the page editor already renders through ExtraBlock. */
function extraBlockSpec<const T extends 'pageLink' | 'embed' | 'bookmark'>(type: T, legacyType: NotionBlock['type']) {
  return createReactBlockSpec(
    { content: 'none', propSchema: { caption: { default: '' }, pageId: { default: '' }, url: { default: '' } }, type },
    {
      render: function Extra({ block, editor }) {
        const { locale } = useMaxEditor();
        const props = block.props as Readonly<{ caption: string; pageId: string; url: string }>;
        const update = (editor as unknown as { updateBlock: (id: string, update: { props: Record<string, string> }) => void }).updateBlock.bind(editor);
        const legacy: NotionBlock = { caption: props.caption, content: '', id: block.id, pageId: props.pageId || undefined, type: legacyType, url: props.url || undefined };
        return <div className="max-void-block" contentEditable={false}>
          <ExtraBlock block={legacy} locale={locale} onChange={(patch) => update(block.id, {
            props: {
              ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
              ...(patch.pageId !== undefined ? { pageId: patch.pageId } : {}),
              ...(patch.url !== undefined ? { url: patch.url } : {}),
            },
          })} />
        </div>;
      },
    },
  );
}

export const pageLinkBlock = extraBlockSpec('pageLink', 'page-link');
export const embedBlock = extraBlockSpec('embed', 'embed');
export const bookmarkBlock = extraBlockSpec('bookmark', 'bookmark');

export const tableOfContentsBlock = createReactBlockSpec(
  { content: 'none', propSchema: {}, type: 'tableOfContents' },
  {
    render: function TableOfContents({ editor }) {
      const { locale } = useMaxEditor();
      const ar = locale === 'ar';
      type Heading = Readonly<{ id: string; type: string; props: Readonly<{ level?: number }>; content?: readonly Readonly<{ text?: string }>[] }>;
      const headings = (editor.document as unknown as readonly Heading[]).filter((candidate) => candidate.type === 'heading');
      return <nav className="page-toc max-void-block" contentEditable={false} aria-label={ar ? 'محتويات الصفحة' : 'Table of contents'}>
        {headings.length ? headings.map((heading) => {
          const level = Number(heading.props.level) || 1;
          const text = (heading.content ?? []).map((item) => item.text ?? '').join('');
          return <button type="button" key={heading.id} style={{ paddingInlineStart: `${(level - 1) * 14 + 8}px` }} onClick={() => {
            editor.setTextCursorPosition(heading.id, 'end');
            editor.focus();
            editor.domElement?.querySelector(`[data-id="${CSS.escape(heading.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>{text || (ar ? 'عنوان' : 'Heading')}</button>;
        }) : <p>{ar ? 'أضف عناوين لتظهر هنا.' : 'Add headings to build a table of contents.'}</p>}
      </nav>;
    },
  },
);

export const unsupportedBlock = createReactBlockSpec(
  { content: 'none', propSchema: { source: { default: '' } }, type: 'unsupported' },
  {
    render: function Unsupported() {
      const { locale } = useMaxEditor();
      return <div className="max-unsupported-block max-void-block" contentEditable={false} role="note">
        <AlertTriangle aria-hidden="true" size={16} />
        {locale === 'ar' ? 'كتلة غير مدعومة في هذا الإصدار. تم الاحتفاظ بمحتواها كما هو.' : 'This block needs a newer version of Max. Its content is kept unchanged.'}
      </div>;
    },
  },
);

function PageMention({ label, pageId }: { label: string; pageId: string }) {
  const { locale } = useMaxEditor();
  const { graph } = usePageGraph();
  const page = graph.pages.find((candidate) => candidate.id === pageId);
  const loaded = graph.pages.length > 0;
  const missing = loaded && !page;
  const ar = locale === 'ar';
  const text = page?.title || inlinePlainText(label) || (ar ? 'صفحة' : 'Page');
  return <a
    aria-label={missing ? (ar ? `${text}، صفحة غير متاحة` : `${text}, page unavailable`) : undefined}
    className="max-page-mention"
    contentEditable={false}
    data-missing={missing || undefined}
    data-page-id={pageId}
    href="#"
    onClick={(event) => { event.preventDefault(); if (!missing) openPage(pageId); }}
    title={missing ? (ar ? 'هذه الصفحة محذوفة أو مؤرشفة' : 'This page was deleted or archived') : undefined}
  >
    {missing ? <FileText aria-hidden="true" size={13} /> : <Link2 aria-hidden="true" size={13} />}
    {text}
  </a>;
}

export const pageMention = createReactInlineContentSpec(
  { content: 'none', propSchema: { label: { default: '' }, pageId: { default: '' } }, type: 'pageMention' },
  { render: ({ inlineContent }) => <PageMention label={inlineContent.props.label} pageId={inlineContent.props.pageId} /> },
);

export const highlightStyle = createReactStyleSpec(
  { propSchema: 'boolean', type: 'highlight' },
  { render: ({ contentRef }) => <mark ref={contentRef} /> },
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped from the schema
const { textColor: _textColor, backgroundColor: _backgroundColor, ...storableStyles } = defaultStyleSpecs;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- replaced by a three-level heading
const { heading: _heading, ...textBlocks } = defaultBlockSpecs;

export const maxSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...textBlocks,
    heading: createHeadingBlockSpec({ allowToggleHeadings: false, levels: [1, 2, 3] }),
    bookmark: bookmarkBlock(),
    callout: calloutBlock(),
    columns: columnsBlock(),
    database: databaseBlock(),
    embed: embedBlock(),
    pageLink: pageLinkBlock(),
    tableOfContents: tableOfContentsBlock(),
    unsupported: unsupportedBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, pageMention },
  styleSpecs: { ...storableStyles, highlight: highlightStyle },
});

export type MaxSchemaEditor = typeof maxSchema.BlockNoteEditor;

/** Blocks without text of their own: Backspace below one removes it. */
export const VOID_BLOCKNOTE_TYPES = new Set([
  'bookmark', 'columns', 'database', 'divider', 'embed', 'file', 'image', 'pageLink', 'table', 'tableOfContents',
  'unsupported', 'video', 'audio',
]);

/** Blocks that draw a box around their line; emptying one keeps the line. */
export const CONTAINER_BLOCKNOTE_TYPES = new Set(['callout', 'codeBlock', 'quote', 'toggleListItem']);
