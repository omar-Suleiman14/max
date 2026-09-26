/* eslint-disable react-refresh/only-export-components -- BlockNote block specs, the schema, the editor context and the keyboard extension are module-level objects, not components. */
/**
 * Max's desktop block editor.
 *
 * BlockNote provides the editing interactions. This component owns the
 * boundary: it loads blocks through the MaxDocument adapter and publishes
 * MaxDocument-shaped blocks back, so nothing outside `src/renderer/editor`
 * ever sees a BlockNote type.
 */
import { createExtension } from '@blocknote/core';
import { filterSuggestionItems, SuggestionMenu } from '@blocknote/core/extensions';
import * as locales from '@blocknote/core/locales';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { TextSelection } from 'prosemirror-state';
import { Columns2, Database, FileText, Globe, Info, Link2, ListTree } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';

import type { Locale } from '../app/i18n';
import { legacyBlocksToMaxDocument, maxDocumentToLegacyBlocks } from '../../shared/max-document-legacy';
import type { MaxBlock } from '../../shared/max-document';
import { serializeInline } from '../../shared/max-inline';
import type { NotionBlock } from './page-blocks';
import { indexBlocks, toBlockNote, toMaxDocument } from './blocknote-adapter';
import {
  CONTAINER_BLOCKNOTE_TYPES,
  MaxEditorContext,
  maxSchema,
  VOID_BLOCKNOTE_TYPES,
  type MaxSchemaEditor,
  type NestedEditorProps,
} from './max-blocknote-schema';
import './max-block-editor.css';

export type MaxBlockEditorProps = Readonly<{
  blocks: readonly NotionBlock[];
  locale: Locale;
  onChange: (blocks: readonly NotionBlock[]) => void;
  onWorkspaceChange?: () => void;
  parentPageId?: string;
  placeholder?: string;
  /** A column inside another editor: no trailing empty line, no page title. */
  nested?: boolean;
  /** Receives the editing surface, for callers that move the caret into it. */
  editorRef?: MutableRefObject<MaxSchemaEditor | null>;
}>;

type Editor = MaxSchemaEditor;

function focusPageTitle(editor: Editor): boolean {
  const title = editor.domElement?.closest('.custom-page-view')?.querySelector('.custom-page-title-input');
  if (!(title instanceof HTMLTextAreaElement || title instanceof HTMLInputElement)) return false;
  title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
  return true;
}

function isEmpty(block: { content?: unknown }): boolean {
  return Array.isArray(block.content) && block.content.length === 0;
}

/** Where a block's editable text starts in the ProseMirror document. */
function contentStart(editor: Editor, id: string): { start: number; size: number } | undefined {
  let found: { start: number; size: number } | undefined;
  editor.prosemirrorState.doc.descendants((node, position) => {
    if (found) return false;
    if (node.attrs.id !== id) return true;
    const content = node.firstChild;
    // blockContainer opens at `position`; its content node opens one later.
    if (content) found = { size: content.content.size, start: position + 2 };
    return false;
  });
  return found;
}

/**
 * Joins a line into the one above, keeping its text, formatting and nested
 * lines, and leaves the caret at the join.
 */
function mergeIntoPrevious(editor: Editor, previousId: string, blockId: string): void {
  const boundary = contentStart(editor, previousId)?.size ?? 0;
  editor.transact(() => {
    const previous = editor.getBlock(previousId)!;
    const block = editor.getBlock(blockId)!;
    editor.updateBlock(previous, { content: [...previous.content as never[], ...block.content as never[]] as never });
    if (block.children.length) editor.insertBlocks(block.children, previous, 'after');
    editor.removeBlocks([block]);
  });
  const target = contentStart(editor, previousId);
  const view = editor.prosemirrorView;
  if (target && view) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target.start + boundary)));
}

/**
 * Max's Backspace rules, which the owner set for every block kind:
 * - a caret-less block above the line (divider, image, embed…) is removed and
 *   the caret stays where it is;
 * - emptying a box (callout, quote, code, toggle) takes the box off the line;
 * - a heading or a list item is only styling, so Backspace at its head merges
 *   the line into the one above in a single press;
 * - Backspace at the head of the first line goes to the page title.
 */
export const maxKeyboard = createExtension({
  key: 'maxKeyboard',
  keyboardShortcuts: {
    Backspace: ({ editor: untyped }) => {
      const editor = untyped as unknown as Editor;
      const view = editor.prosemirrorView;
      if (!view) return false;
      const { selection } = view.state;
      if (!selection.empty || selection.$from.parentOffset !== 0) return false;
      const position = editor.getTextCursorPosition();
      const block = position.block;
      if (position.parentBlock) return false;
      if (CONTAINER_BLOCKNOTE_TYPES.has(block.type)) {
        editor.updateBlock(block, { props: {}, type: 'paragraph' });
        editor.setTextCursorPosition(block.id, 'start');
        return true;
      }
      const previous = position.prevBlock;
      if (!previous) {
        if (isEmpty(block) && editor.document.length > 1) editor.removeBlocks([block]);
        return focusPageTitle(editor);
      }
      if (VOID_BLOCKNOTE_TYPES.has(previous.type)) {
        editor.removeBlocks([previous]);
        editor.setTextCursorPosition(block.id, 'start');
        return true;
      }
      if (block.type === 'paragraph') return false;
      if (isEmpty(block) && !block.children.length) {
        editor.removeBlocks([block]);
        editor.setTextCursorPosition(previous.id, 'end');
        return true;
      }
      if (!Array.isArray(previous.content) || !Array.isArray(block.content)) return false;
      mergeIntoPrevious(editor, previous.id, block.id);
      return true;
    },
  },
});

export function maxSlashItems(editor: Editor, locale: Locale): DefaultReactSuggestionItem[] {
  const ar = locale === 'ar';
  const insert = (partial: Parameters<Editor['insertBlocks']>[0][number]) => () => {
    const current = editor.getTextCursorPosition().block;
    if (isEmpty(current) && current.type === 'paragraph') editor.replaceBlocks([current], [partial]);
    else editor.insertBlocks([partial], current, 'after');
  };
  const group = ar ? 'عناصر Max' : 'Max blocks';
  return [
    { aliases: ['callout', 'note', 'tip', 'ملاحظة', 'تنبيه'], group, icon: <Info size={18} />, onItemClick: insert({ type: 'callout' }), subtext: ar ? 'إبراز ملاحظة بأيقونة' : 'Make a note stand out', title: ar ? 'ملاحظة بارزة' : 'Callout' },
    { aliases: ['columns', '2col', 'أعمدة'], group, icon: <Columns2 size={18} />, onItemClick: insert({ props: { columns: JSON.stringify([[{ content: '', id: crypto.randomUUID(), type: 'text' }], [{ content: '', id: crypto.randomUUID(), type: 'text' }]]) }, type: 'columns' }), subtext: ar ? 'عمودان جنباً إلى جنب' : 'Two columns side by side', title: ar ? 'أعمدة' : 'Columns' },
    { aliases: ['database', 'table view', 'inline database', 'قاعدة بيانات'], group, icon: <Database size={18} />, onItemClick: insert({ type: 'database' }), subtext: ar ? 'إنشاء قاعدة بيانات أو ربط واحدة' : 'Create a database or link an existing one', title: ar ? 'قاعدة بيانات' : 'Database' },
    { aliases: ['page', 'link page', 'رابط صفحة'], group, icon: <FileText size={18} />, onItemClick: insert({ type: 'pageLink' }), subtext: ar ? 'كتلة تربط صفحة أخرى' : 'A block that links another page', title: ar ? 'رابط صفحة' : 'Link to page' },
    { aliases: ['mention', '[[', 'inline page', 'إشارة'], group, icon: <Link2 size={18} />, onItemClick: () => editor.getExtension(SuggestionMenu)?.openSuggestionMenu('@', { deleteTriggerCharacter: true }), subtext: ar ? 'رابط صفحة داخل السطر' : 'Link a page inside this line', title: ar ? 'إشارة إلى صفحة' : 'Mention a page' },
    { aliases: ['embed', 'iframe', 'تضمين'], group, icon: <Globe size={18} />, onItemClick: insert({ type: 'embed' }), subtext: ar ? 'تضمين صفحة ويب' : 'Embed a web page', title: ar ? 'تضمين' : 'Embed' },
    { aliases: ['bookmark', 'url', 'إشارة ويب'], group, icon: <Globe size={18} />, onItemClick: insert({ type: 'bookmark' }), subtext: ar ? 'رابط ويب كبطاقة' : 'A web link as a card', title: ar ? 'إشارة ويب' : 'Web bookmark' },
    { aliases: ['toc', 'contents', 'محتويات'], group, icon: <ListTree size={18} />, onItemClick: insert({ type: 'tableOfContents' }), subtext: ar ? 'التنقل بين عناوين الصفحة' : 'Navigate the headings on this page', title: ar ? 'محتويات الصفحة' : 'Table of contents' },
  ];
}

/** Titles of BlockNote's own slash items that Max does not offer. */
function hiddenDefaultItems(editor: Editor): Set<string> {
  const menu = editor.dictionary.slash_menu as Readonly<Record<string, { title: string } | undefined>>;
  return new Set(['emoji', 'page_break'].map((key) => menu[key]?.title ?? key));
}

/** Escapes a page title for use as an inline Markdown link label. */
function labelFor(title: string): string {
  return serializeInline([{ marks: {}, text: title }]);
}

async function pageMentionItems(editor: Editor, locale: Locale, query: string): Promise<DefaultReactSuggestionItem[]> {
  const graph = await window.maxApi.workspace.getPageGraph();
  const needle = query.toLocaleLowerCase();
  return graph.pages
    .filter((page) => page.title.toLocaleLowerCase().includes(needle))
    .slice(0, 30)
    .map((page) => ({
      group: locale === 'ar' ? 'صفحات' : 'Pages',
      icon: <FileText size={16} />,
      onItemClick: () => editor.insertInlineContent([{ props: { label: labelFor(page.title), pageId: page.id }, type: 'pageMention' }, ' ']),
      subtext: page.path,
      title: page.title || (locale === 'ar' ? 'بدون عنوان' : 'Untitled'),
    }));
}

function localFileUrl(url: string): string {
  return typeof location !== 'undefined' && location.protocol.startsWith('http') ? url.replace('max://asset/', '/__max/asset/') : url;
}

async function uploadFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  const result = image ? await window.maxApi.assets.importImage(bytes, file.name) : await window.maxApi.assets.importAttachment(bytes, file.name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.url;
}

function useThemeName(): 'dark' | 'light' {
  const read = (): 'dark' | 'light' => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'], attributes: true });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function load(blocks: readonly NotionBlock[]) {
  const document = legacyBlocksToMaxDocument(blocks);
  return { document, index: indexBlocks(document.blocks) };
}

function signature(blocks: readonly unknown[]): string {
  return JSON.stringify(legacyBlocksToMaxDocument(blocks).blocks);
}

/** A nested document (a column) edited by the same editor. */
function NestedMaxEditor(props: NestedEditorProps & Readonly<{ parent: Omit<MaxBlockEditorProps, 'blocks' | 'onChange'> }>): ReactNode {
  return <MaxBlockEditor {...props.parent} blocks={props.blocks} onChange={props.onChange} />;
}

export function MaxBlockEditor({ blocks, editorRef, locale, nested = false, onChange, onWorkspaceChange, parentPageId, placeholder }: MaxBlockEditorProps) {
  const root = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => load(blocks), []); // eslint-disable-line react-hooks/exhaustive-deps
  const index = useRef<Map<string, MaxBlock>>(initial.index);
  const published = useRef(signature(blocks));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const theme = useThemeName();
  const sideMenu = typeof document !== 'undefined' && typeof document.elementFromPoint === 'function';

  const editor = useCreateBlockNote({
    dictionary: {
      ...(locale === 'ar' ? locales.ar : locales.en),
      placeholders: {
        ...(locale === 'ar' ? locales.ar : locales.en).placeholders,
        default: placeholder ?? (locale === 'ar' ? "اكتب شيئاً، أو اكتب '/' للأوامر…" : "Type something, or press '/' for commands…"),
      },
    },
    disableExtensions: sideMenu ? [] : ['sideMenu'],
    domAttributes: { editor: { 'aria-label': locale === 'ar' ? 'محتوى الصفحة' : 'Page content' } },
    extensions: [maxKeyboard],
    initialContent: initial.document.blocks.length ? toBlockNote(initial.document) as never : undefined,
    resolveFileUrl: (url) => Promise.resolve(localFileUrl(url)),
    schema: maxSchema,
    tables: { cellBackgroundColor: false, cellTextColor: false, headers: false, splitCells: false },
    trailingBlock: !nested,
    uploadFile,
  });

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = editor;
    return () => { editorRef.current = null; };
  }, [editor, editorRef]);

  // A surrounding surface (the record drawer's notes area) asks for the caret
  // at the end of the document when its own whitespace is clicked.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const focusEnd = () => { const last = editor.document.at(-1); if (last) { editor.setTextCursorPosition(last, 'end'); editor.focus(); } };
    element.addEventListener('max:focus-page-end', focusEnd);
    return () => element.removeEventListener('max:focus-page-end', focusEnd);
  }, [editor]);

  // Content replaced from outside (a template, an undo elsewhere, a restore)
  // is loaded into the editor; our own echoes are ignored.
  useEffect(() => {
    const next = signature(blocks);
    if (next === published.current) return;
    published.current = next;
    const loaded = load(blocks);
    index.current = loaded.index;
    const content = toBlockNote(loaded.document);
    editor.replaceBlocks(editor.document, content.length ? content as never : [{ type: 'paragraph' }]);
  }, [blocks, editor]);

  function publish() {
    const document = toMaxDocument(editor.document, (id) => index.current.get(id));
    index.current = indexBlocks(document.blocks, new Map(index.current));
    const legacy = maxDocumentToLegacyBlocks(document) as readonly NotionBlock[];
    const next = signature(legacy);
    if (next === published.current) return;
    published.current = next;
    onChangeRef.current(legacy);
  }

  const context = useMemo(() => ({
    locale,
    NestedEditor: (props: NestedEditorProps) => <NestedMaxEditor {...props} parent={{ locale, nested: true, onWorkspaceChange, parentPageId }} />,
    onWorkspaceChange,
    parentPageId,
  }), [locale, onWorkspaceChange, parentPageId]);

  return <MaxEditorContext.Provider value={context}>
    <div
      ref={root}
      className="max-block-editor"
      data-nested={nested || undefined}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      onClick={(event) => {
        // A click in the empty space under the last line puts the caret there.
        if (event.target !== event.currentTarget) return;
        const last = editor.document.at(-1);
        if (last) { editor.setTextCursorPosition(last, 'end'); editor.focus(); }
      }}
    >
      <BlockNoteView
        editor={editor}
        onChange={publish}
        sideMenu={sideMenu}
        slashMenu={false}
        theme={theme}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={(query) => Promise.resolve(filterSuggestionItems([
            ...getDefaultReactSlashMenuItems(editor).filter((item) => !hiddenDefaultItems(editor).has(item.title)),
            ...maxSlashItems(editor, locale),
          ], query))}
        />
        <SuggestionMenuController triggerCharacter="@" getItems={(query) => pageMentionItems(editor, locale, query)} />
      </BlockNoteView>
    </div>
  </MaxEditorContext.Provider>;
}
