import { DatabaseSkeleton } from '../databases/DatabaseSkeleton';
import { LegacyDatabaseLink } from '../databases/LegacyDatabaseLink';
import { ExtraBlock } from '../pages/extra-blocks';
import { renderInline, escapeText } from '../pages/rich-text';
import { openPage } from '../pages/page-graph-store';
import { safeWebUrl } from '../../shared/page-links';
import {
  Check,
  Columns,
  Database,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import type { Locale } from '../app/i18n';
import type { NavigationItem } from '../../shared/workspace-contract';
import { IconPickerDialog } from './icon-picker-dialog';
import { PageIconRenderer } from './page-icon-renderer';
import { matchesShortcut } from '../app/keyboard';

const DatabasePage = lazy(() => import('../databases/DatabasePage').then((module) => ({ default: module.DatabasePage })));

function parseInlineMarkdown(text: string) {
  return renderInline(text);
}

/** Extract plain text from a contentEditable element, preserving markdown markers from formatting. */
function htmlToMarkdown(el: HTMLElement): string {
  let result = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.textContent ?? '').replace(/\u200b/g, '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName.toLowerCase();
      if (['script', 'style', 'iframe', 'object'].includes(tag)) continue;
      const inner = htmlToMarkdown(node as HTMLElement);
      if (tag === 'strong' || tag === 'b') result += `**${inner}**`;
      else if (tag === 'em' || tag === 'i') result += `*${inner}*`;
      else if (tag === 'del' || tag === 's') result += `~~${inner}~~`;
      else if (tag === 'code') result += '`' + inner + '`';
      else if (tag === 'u') result += '++' + inner + '++';
      else if (tag === 'mark') result += '==' + inner + '==';
      else if (tag === 'a') {
        const element = node as HTMLElement;
        const pageId = element.dataset.pageId;
        const url = safeWebUrl(element.getAttribute('href') ?? '');
        result += pageId ? `[${inner}](max-page:${encodeURIComponent(pageId)})` : url ? `[${inner}](${url})` : inner;
      }
      else if (tag === 'br') result += '\n';
      else if (tag === 'div' || tag === 'p') result += (result && !result.endsWith('\n') ? '\n' : '') + inner;
      else result += inner;
    }
  }
  return result;
}

/** Save and restore caret position in a contentEditable element across innerHTML updates. */
function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return -1;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.anchorNode!, sel.anchorOffset);
  return range.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = (node.textContent ?? '').length;
    if (pos + len >= offset) {
      const range = document.createRange();
      range.setStart(node, offset - pos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    pos += len;
  }
  // Fallback: place at end
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * True when the caret already sits inside this element. A deferred focus must
 * not reposition it, or a fast typist loses the characters they just entered.
 */
function holdsCaret(el: HTMLElement): boolean {
  if (document.activeElement !== el) return false;
  const sel = window.getSelection();
  return Boolean(sel && sel.rangeCount > 0 && el.contains(sel.anchorNode));
}

export type BlockType =
  | 'page-link' | 'embed' | 'bookmark' | 'image' | 'video' | 'audio' | 'file' | 'simple-table' | 'table-of-contents'
  | 'quote'
  | 'code'
  | 'toggle'
  | 'bullet'
  | 'callout'
  | 'columns'
  | 'database-view'
  | 'divider'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'number'
  | 'text'
  | 'todo';

export type NotionBlock = {
  pageId?: string;
  url?: string;
  caption?: string;
  cells?: readonly (readonly string[])[];
  calloutIcon?: string;
  checked?: boolean; // For todo items
  col1Blocks?: readonly NotionBlock[]; // For columns block (left)
  col2Blocks?: readonly NotionBlock[]; // For columns block (right)
  content: string;
  databaseId?: string;
  databaseKind?: 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions';
  id: string;
  type: BlockType;
  viewId?: string;
};

function duplicateBlock(block: NotionBlock): NotionBlock {
  return { ...block, id: crypto.randomUUID(), col1Blocks: block.col1Blocks?.map(duplicateBlock), col2Blocks: block.col2Blocks?.map(duplicateBlock) };
}

type NotionBlockEditorProps = Readonly<{
  blocks: readonly NotionBlock[];
  locale: Locale;
  onChange: (blocks: readonly NotionBlock[]) => void;
  onWorkspaceChange?: () => void;
  parentPageId?: string;
  placeholder?: string;
}>;

type SlashOption = {
  category: 'basic' | 'database' | 'layout';
  description: string;
  descriptionAr: string;
  icon: LucideIcon;
  id: string;
  keywords: readonly string[];
  label: string;
  labelAr: string;
  run: (blockId: string) => void;
};

type RichTextBlockProps = {
  blockId: string;
  content: string;
  focused: boolean;
  index: number;
  locale: Locale;
  onBlur: () => void;
  onContentChange: (id: string, text: string) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  registerRef: (el: HTMLDivElement | null) => void;
};

/**
 * A contentEditable rich text block that converts inline markdown to formatted
 * HTML. Native editing (typing, backspace, selection+delete) is never
 * interrupted; formatting is applied after a 500ms idle pause and whenever
 * content changes externally (block split, merge, etc.).
 */
function RichTextBlock({ blockId, content, index, locale, onBlur, onContentChange, onFocus, onKeyDown, registerRef }: RichTextBlockProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const savedSelection = useRef<Range | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const composing = useRef(false);
  // Tracks whether we are updating from inside (input) vs outside (prop change)
  const isInternalUpdate = useRef(false);

  // Apply formatting: re-render innerHTML from the current content
  const applyFormatting = useCallback((el: HTMLDivElement, md: string) => {
    const newHtml = parseInlineMarkdown(md);
    if (el.innerHTML !== newHtml) {
      const offset = getCaretOffset(el);
      el.innerHTML = newHtml;
      if (offset >= 0 && el === document.activeElement) {
        const textLen = (el.textContent ?? '').length;
        setCaretOffset(el, Math.min(offset, textLen));
      }
    }
  }, []);

  // Sync the div's innerHTML from the content prop when it changes externally
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const el = divRef.current;
    if (!el) return;
    applyFormatting(el, content);
  }, [content, applyFormatting]);

  // Ref callback — set innerHTML only on initial mount (when the div is empty)
  // NOTE: no dependency on `content` to avoid ref churn on every keystroke
  const setRef = useCallback((el: HTMLDivElement | null) => {
    divRef.current = el;
    registerRef(el);
    if (el && !el.innerHTML) {
      el.innerHTML = parseInlineMarkdown(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerRef]);

  const handleInput = useCallback(() => {
    const el = divRef.current;
    if (!el) return;
    const md = htmlToMarkdown(el);
    isInternalUpdate.current = true;
    onContentChange(blockId, md);

  }, [blockId, onContentChange]);

  function trackSelection() {
    const selection = window.getSelection();
    const valid = !!selection && !selection.isCollapsed && !!divRef.current?.contains(selection.anchorNode) && !!divRef.current?.contains(selection.focusNode);
    if (valid && selection.rangeCount) savedSelection.current = selection.getRangeAt(0).cloneRange();
    setSelectionOpen(valid);
  }
  function format(command: string, value?: string) {
    const selection = window.getSelection();
    if (!savedSelection.current || !selection) return;
    divRef.current?.focus(); selection.removeAllRanges(); selection.addRange(savedSelection.current);
    if (command === 'code' || command === 'mark') document.execCommand('insertHTML', false, `<${command}>${escapeText(selection.toString())}</${command}>`);
    else document.execCommand(command, false, value);
    handleInput(); trackSelection();
  }

  const placeholder = index === 0
    ? locale === 'ar'
      ? "اكتب شيئاً، أو اكتب '/' للأوامر..."
      : "Type something, or press '/' for commands..."
    : '';

  return (
    <div className="inline-rich-block"><div
      ref={setRef}
      aria-label={locale === 'ar' ? 'كتلة نصية' : 'Text block'}
      className="notion-text-input notion-text-editable"
      contentEditable
      data-placeholder={placeholder}
      onBlur={(event) => {
        if ((event.relatedTarget as HTMLElement | null)?.closest('.inline-format-toolbar')) return;
        // Apply formatting immediately when the block loses focus
        const el = divRef.current;
        if (el) applyFormatting(el, htmlToMarkdown(el));
        setSelectionOpen(false); setLinkEditing(false);
        onBlur();
      }}
      onFocus={onFocus}
      onInput={() => { if (!composing.current) handleInput(); }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; handleInput(); }}
      onMouseUp={trackSelection}
      onKeyUp={trackSelection}
      onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { event.preventDefault(); document.execCommand(({ b: 'bold', i: 'italic', u: 'underline' })[event.key.toLowerCase() as 'b' | 'i' | 'u']); handleInput(); return; } onKeyDown(event); }}
      onPaste={(event) => { event.preventDefault(); const html = event.clipboardData.getData('text/html'); if (html) { const doc = new DOMParser().parseFromString(html, 'text/html'); document.execCommand('insertHTML', false, renderInline(htmlToMarkdown(doc.body))); } else document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); handleInput(); }}
      onClick={(event) => { const link = (event.target as Element).closest('a'); if (!link) return; event.preventDefault(); event.stopPropagation(); const id = link.getAttribute('data-page-id'); if (id) openPage(id); else { const url = safeWebUrl(link.getAttribute('href') ?? ''); if (url) void window.maxApi.workspace.openExternal(url).then((result) => { if (!result.ok) setLinkError(result.error.message); }).catch(() => setLinkError('Could not open link.')); } }}
      role="textbox"
      suppressContentEditableWarning
    />
    {selectionOpen && <div className="inline-format-toolbar" role="toolbar" aria-label={locale === 'ar' ? 'تنسيق النص' : 'Text formatting'} onMouseDown={(event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}>
      {(['bold', 'italic', 'underline', 'strikeThrough', 'code', 'mark'] as const).map((command) => <button type="button" key={command} title={command} aria-label={command} onClick={() => format(command)}>{({ bold: 'B', italic: 'I', underline: 'U', strikeThrough: 'S̶', code: '</>', mark: 'Highlight' })[command]}</button>)}
      <button type="button" onClick={() => setLinkEditing(!linkEditing)}>{locale === 'ar' ? 'رابط' : 'Link'}</button>
      <button type="button" onClick={() => format('removeFormat')}>{locale === 'ar' ? 'مسح التنسيق' : 'Clear format'}</button>
      {linkEditing && <form onSubmit={(event) => { event.preventDefault(); const url = safeWebUrl(linkUrl); if (!url) { setLinkError(locale === 'ar' ? 'أدخل رابطاً صالحاً.' : 'Enter a valid web URL.'); return; } format('createLink', url); setLinkEditing(false); setLinkError(''); }}><input autoFocus type="url" aria-label={locale === 'ar' ? 'الرابط' : 'Link URL'} value={linkUrl} placeholder="https://…" onChange={(event) => setLinkUrl(event.target.value)} /><button type="submit">{locale === 'ar' ? 'حفظ' : 'Apply'}</button></form>}
    </div>}
    {linkError && <small role="alert">{linkError}</small>}
    </div>
  );
}
export function NotionBlockEditor({ blocks, locale, onChange: publish, onWorkspaceChange, parentPageId }: NotionBlockEditorProps) {
  const currentBlocks = useRef(blocks);
  currentBlocks.current = blocks;
  const undoStack = useRef<(readonly NotionBlock[])[]>([]);
  const redoStack = useRef<(readonly NotionBlock[])[]>([]);
  function onChange(next: readonly NotionBlock[]) {
    if (JSON.stringify(next) === JSON.stringify(currentBlocks.current)) return;
    undoStack.current.push(currentBlocks.current);
    if (undoStack.current.length > 150) undoStack.current.shift();
    redoStack.current = [];
    currentBlocks.current = next;
    publish(next);
  }
  const deletedSelection = useRef<readonly NotionBlock[] | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selectionAnchor = useRef<number | null>(null);
  const selecting = useRef(false);
  const [selectedLines, setSelectedLines] = useState<readonly number[]>([]);
  function selectLines(anchor: number, end: number) {
    setSelectedLines(Array.from({ length: Math.abs(end - anchor) + 1 }, (_, index) => Math.min(anchor, end) + index));
    window.getSelection()?.removeAllRanges();
  }
  function pageText(items: readonly NotionBlock[]): string {
    return items.map((block) => block.type === 'columns'
      ? [pageText(block.col1Blocks ?? []), pageText(block.col2Blocks ?? [])].join('\n')
      : block.type === 'divider' ? '---' : block.type === 'todo' ? `${block.checked ? '[x]' : '[ ]'} ${block.content}` : block.content).join('\n');
  }
  useEffect(() => {
    const finish = () => { selecting.current = false; };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); };
  }, []);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [activeSlashBlockId, setActiveSlashBlockId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const [fileError, setFileError] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [calloutPickerId, setCalloutPickerId] = useState<string>();
  const calloutIconRefs = useRef(new Map<string, HTMLButtonElement>());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverEdge, setDragOverEdge] = useState<'after' | 'before'>('before');
  const [failedMoveBlockId, setFailedMoveBlockId] = useState<string | null>(null);
  const failedMoveTimer = useRef<number | undefined>(undefined);
  const [blockMenuId, setBlockMenuId] = useState<string | null>(null);
  function signalMoveFailure(id: string | undefined) {
    if (!id) return;
    if (failedMoveTimer.current) window.clearTimeout(failedMoveTimer.current);
    setFailedMoveBlockId(id);
    failedMoveTimer.current = window.setTimeout(() => setFailedMoveBlockId(null), 280);
  }
  useEffect(() => () => { if (failedMoveTimer.current) window.clearTimeout(failedMoveTimer.current); }, []);
  useEffect(() => {
    if (!blockMenuId) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.notion-block-gutter')) return;
      setBlockMenuId(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setBlockMenuId(null); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape, true); };
  }, [blockMenuId]);
  const [workspaceDatabases, setWorkspaceDatabases] = useState<readonly NavigationItem[]>([]);
  const [newDatabaseBlockId, setNewDatabaseBlockId] = useState<string | null>(null);
  const [newDatabaseTitle, setNewDatabaseTitle] = useState('');
  const [newDatabaseError, setNewDatabaseError] = useState<string>();
  const [creatingDatabase, setCreatingDatabase] = useState(false);
  const [linkDatabaseBlockId, setLinkDatabaseBlockId] = useState<string | null>(null);
  const [linkDatabaseError, setLinkDatabaseError] = useState<string>();
  const [linkingDatabaseId, setLinkingDatabaseId] = useState<string>();

  const inputRefs = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement | HTMLDivElement>>(new Map());

  useEffect(() => {
    let active = true;
    const workspace = window.maxApi?.workspace;
    if (!workspace) return () => { active = false; };
    void workspace.getNavigation().then((navigation) => {
      if (active) setWorkspaceDatabases(navigation.databases);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const focusEnd = () => {
      setSelectedLines([]); selectionAnchor.current = null; window.getSelection()?.removeAllRanges();
      const last = blocks.at(-1);
      if (!last || ['divider', 'database-view', 'columns'].includes(last.type)) insertBlockAfter(last?.id ?? '', 'text', '');
      else focusBlock(last.id);
    };
    canvas?.addEventListener('max:focus-page-end', focusEnd);
    return () => canvas?.removeEventListener('max:focus-page-end', focusEnd);
  // Rebind when the document changes; insertBlockAfter captures this same block snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);
  // Focus management helper
  function focusBlock(id: string, cursorAtEnd = true) {
    setFocusedBlockId(id);
    setTimeout(() => {
      const el = inputRefs.current.get(id);
      if (el && !holdsCaret(el)) {
        el.focus();
        if (el instanceof HTMLDivElement) {
          // contentEditable element
          if (cursorAtEnd) {
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else {
            setCaretOffset(el, 0);
          }
        } else if ('setSelectionRange' in el) {
          if (cursorAtEnd) {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }
        }
      }
    }, 20);
  }

  function updateBlock(id: string, update: Partial<NotionBlock>) {
    if (update.type && activeSlashBlockId === id && update.content === '') {
      const source = currentBlocks.current.find(block => block.id === id)?.content ?? '';
      const slash = source.lastIndexOf('/');
      if (slash > 0) update = { ...update, content: source.slice(0, slash).trimEnd() };
    }
    onChange(
      currentBlocks.current.map((b) => (b.id === id ? { ...b, ...update } : b)),
    );
  }

  function removeBlock(id: string) {
    const idx = blocks.findIndex((b) => b.id === id);
    const next = blocks.filter((b) => b.id !== id);
    if (next.length === 0) {
      const fallback: NotionBlock = { content: '', id: 'block_' + Math.random().toString(36).substring(2, 9), type: 'text' };
      onChange([fallback]);
      focusBlock(fallback.id);
    } else {
      onChange(next);
      const prevIdx = Math.max(0, idx - 1);
      if (next[prevIdx]) {
        focusBlock(next[prevIdx].id);
      }
    }
  }

  function insertBlockAfter(afterId: string, type: BlockType = 'text', content = ''): string {
    const idx = currentBlocks.current.findIndex((b) => b.id === afterId);
    const newBlock: NotionBlock = {
      content,
      id: 'block_' + Math.random().toString(36).substring(2, 9),
      type,
    };
    const next = [...currentBlocks.current];
    if (idx === -1) {
      next.push(newBlock);
    } else {
      next.splice(idx + 1, 0, newBlock);
    }
    onChange(next);
    focusBlock(newBlock.id);
    return newBlock.id;
  }

  function openInsertMenu(afterId: string) {
    const blockId = insertBlockAfter(afterId, 'text', '/');
    setActiveSlashBlockId(blockId);
    setSlashQuery('');
    setSlashIndex(0);
  }

  async function createInlineDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newDatabaseBlockId || !newDatabaseTitle.trim() || creatingDatabase) return;
    setCreatingDatabase(true);
    setNewDatabaseError(undefined);
    try {
      const result = await window.maxApi.workspace.createDatabase({
        parentNodeId: parentPageId,
        title: newDatabaseTitle.trim(),
        visibility: 'normal',
      });
      if (!result.ok) {
        setNewDatabaseError(result.error.message);
        return;
      }
      const views = await window.maxApi.workspace.listViews(result.value.id);
      updateBlock(newDatabaseBlockId, {
        content: '',
        databaseId: result.value.id,
        databaseKind: undefined,
        type: 'database-view',
        viewId: views[0]?.id,
      });
      const navigation = await window.maxApi.workspace.getNavigation();
      setWorkspaceDatabases(navigation.databases);
      onWorkspaceChange?.();
      setNewDatabaseBlockId(null);
      setNewDatabaseTitle('');
      setActiveSlashBlockId(null);
    } catch (error) {
      setNewDatabaseError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingDatabase(false);
    }
  }

  async function linkDatabase(blockId: string, database: NavigationItem) {
    if (linkingDatabaseId) return;
    setLinkingDatabaseId(database.id);
    setLinkDatabaseError(undefined);
    try {
      const views = await window.maxApi.workspace.listViews(database.id);
      const source = views[0];
      const linked = await window.maxApi.workspace.createView({
        databaseId: database.id,
        filterAst: source?.filterAst,
        group: source?.group,
        layout: source?.layout ?? 'table',
        layoutConfig: source?.layoutConfig,
        name: source?.name ?? database.title,
        ownerId: blockId,
        ownerType: 'block',
        propertyState: source?.propertyState,
        sorts: source?.sorts,
      });
      if (!linked.ok) throw new Error(linked.error.message);
      updateBlock(blockId, {
        content: '',
        databaseId: database.id,
        databaseKind: undefined,
        type: 'database-view',
        viewId: linked.value.id,
      });
      setLinkDatabaseBlockId(null);
      setActiveSlashBlockId(null);
    } catch (error) {
      setLinkDatabaseError(error instanceof Error ? error.message : String(error));
    } finally {
      setLinkingDatabaseId(undefined);
    }
  }

  // Handle markdown shortcut triggers: #, ##, ###, -, *, 1., [], >, ---, /2col
  function handleContentChange(id: string, text: string) {
    deletedSelection.current = null;
    // Check for markdown shortcuts at line start
    if (text === '# ') {
      updateBlock(id, { content: '', type: 'h1' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text === '## ') {
      updateBlock(id, { content: '', type: 'h2' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text === '### ') {
      updateBlock(id, { content: '', type: 'h3' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text === '- ' || text === '* ') {
      updateBlock(id, { content: '', type: 'bullet' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text === '1. ') {
      updateBlock(id, { content: '', type: 'number' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text === '[] ' || text === '[ ] ') {
      updateBlock(id, { checked: false, content: '', type: 'todo' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text === '> ') {
      updateBlock(id, { calloutIcon: 'lucide:Lightbulb', content: '', type: 'callout' });
      setActiveSlashBlockId(null);
      setTimeout(() => { const element = inputRefs.current.get(id); if (element instanceof HTMLDivElement) element.innerHTML = ''; focusBlock(id, false); }, 0);
      return;
    }
    if (text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim() === '---') {
      updateBlock(id, { content: '', type: 'divider' });
      insertBlockAfter(id, 'text', '');
      setActiveSlashBlockId(null);
      return;
    }

    // Slash command trigger
    // A command can follow existing text. Choosing it turns the command into
    // its own block, preserving the preceding sentence instead of requiring
    // people to start a fresh line just to use `/`.
    const commandStart = text.lastIndexOf('/');
    if (commandStart >= 0) {
      setActiveSlashBlockId(id);
      setSlashQuery(text.substring(commandStart + 1).replace(/[\u200B-\u200D\uFEFF]/g, '').trim());
      setSlashIndex(0);
    } else if (activeSlashBlockId === id) {
      setActiveSlashBlockId(null);
      setSlashQuery('');
    }

    updateBlock(id, { content: text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLTextAreaElement>, block: NotionBlock, index: number) {
    // If slash menu is open for this block
    if (activeSlashBlockId === block.id) {
      if (newDatabaseBlockId === block.id || linkDatabaseBlockId === block.id) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setNewDatabaseBlockId(null);
          setLinkDatabaseBlockId(null);
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIndex((prev) => (prev + 1) % filteredSlashOptions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIndex((prev) => (prev - 1 + filteredSlashOptions.length) % filteredSlashOptions.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = filteredSlashOptions[slashIndex];
        if (selected) {
          selected.run(block.id);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveSlashBlockId(null);
        return;
      }
    }

    // Enter key: create a new text block directly below
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // If pressing enter on an empty bullet/todo/number, transform it back to normal text
      if (!block.content.trim() && ['bullet', 'callout', 'h1', 'h2', 'h3', 'number', 'todo'].includes(block.type)) {
        updateBlock(block.id, { type: 'text' });
        return;
      }
      const target = event.currentTarget;
      let cursor: number;
      let before: string, after: string;
      if (target instanceof HTMLDivElement) {
        const selection = window.getSelection();
        if (selection?.rangeCount && target.contains(selection.anchorNode) && target.contains(selection.focusNode)) {
          const range = selection.getRangeAt(0);
          const prefix = range.cloneRange(); prefix.selectNodeContents(target); prefix.setEnd(range.startContainer, range.startOffset);
          const suffix = range.cloneRange(); suffix.selectNodeContents(target); suffix.setStart(range.endContainer, range.endOffset);
          const beforeElement = document.createElement('div'); beforeElement.append(prefix.cloneContents());
          const afterElement = document.createElement('div'); afterElement.append(suffix.cloneContents());
          before = htmlToMarkdown(beforeElement); after = htmlToMarkdown(afterElement);
        } else { before = block.content; after = ''; }
      } else {
        cursor = target.selectionStart ?? block.content.length;
        before = block.content.slice(0, cursor); after = block.content.slice(target.selectionEnd ?? cursor);
      }
      const nextType: BlockType = block.type === 'bullet' ? 'bullet' : block.type === 'todo' ? 'todo' : block.type === 'number' ? 'number' : 'text';
      const newBlock: NotionBlock = { content: after, id: 'block_' + Math.random().toString(36).substring(2, 9), type: nextType };
      const next = [...blocks];
      next[index] = { ...block, content: before };
      next.splice(index + 1, 0, newBlock);
      onChange(next);
      focusBlock(newBlock.id, false);
      return;
    }

    // Backspace at the start merges with the previous block, matching document editors.
    // Only trigger merge when there is NO text selection (i.e. cursor is collapsed at position 0).
    {
      const target = event.currentTarget;
      const isContentEditable = target instanceof HTMLDivElement;
      let cursorAtStart = false;
      let hasSelection = false;

      if (isContentEditable) {
        const sel = window.getSelection();
        hasSelection = sel ? !sel.isCollapsed : false;
        cursorAtStart = !hasSelection && (sel ? getCaretOffset(target) === 0 : false);
      } else {
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        hasSelection = start !== end;
        cursorAtStart = !hasSelection && start === 0;
      }

      if (event.key === 'Backspace' && hasSelection) {
        // Let the browser handle deletion of selected text natively.
        return;
      }

      if (event.key === 'Backspace' && cursorAtStart) {
        if (!block.content && block.type !== 'text') {
          event.preventDefault(); removeBlock(block.id); return;
        }
        if (block.type !== 'text') {
          event.preventDefault();
          updateBlock(block.id, { type: 'text' });
          return;
        }
        const previous = blocks[index - 1];
        if (previous) {
          event.preventDefault();
          const boundary = previous.content.length;
          const next = blocks.map((candidate) => candidate.id === previous.id ? { ...candidate, content: previous.content + block.content } : candidate).filter((candidate) => candidate.id !== block.id);
          onChange(next);
          setTimeout(() => {
            const prevEl = inputRefs.current.get(previous.id);
            if (prevEl && !holdsCaret(prevEl)) {
              prevEl.focus();
              if (prevEl instanceof HTMLDivElement) {
                setCaretOffset(prevEl, boundary);
              } else if ('setSelectionRange' in prevEl) {
                prevEl.setSelectionRange(boundary, boundary);
              }
            }
          }, 20);
          return;
        }
      }
    }

    // Arrow Up / Down navigation (works for both input/textarea and contentEditable)
    {
      const target = event.currentTarget;
      let cursorPos: number;
      let contentLen: number;

      if (target instanceof HTMLDivElement) {
        cursorPos = getCaretOffset(target);
        if (cursorPos < 0) cursorPos = 0;
        contentLen = (target.textContent ?? '').length;
      } else {
        cursorPos = target.selectionStart ?? 0;
        contentLen = ('value' in target) ? (target as HTMLInputElement).value.length : 0;
      }

      if (event.key === 'ArrowUp' && index > 0 && cursorPos === 0) {
        event.preventDefault();
        focusBlock(blocks[index - 1]?.id ?? block.id);
      } else if (event.key === 'ArrowDown' && index < blocks.length - 1 && cursorPos === contentLen) {
        event.preventDefault();
        focusBlock(blocks[index + 1]?.id ?? block.id, false);
      }
    }
  }

  // Slash options
  const slashOptions: readonly SlashOption[] = [
    // Basic Blocks
    {
      category: 'basic',
      description: 'Just start writing with plain text',
      descriptionAr: 'كتابة نص عادي بدون تنسيق',
      icon: FileText,
      id: 'text',
      keywords: ['text', 'paragraph', 'نص', 'فقرة', 'كتابة'],
      label: 'Text',
      labelAr: 'نص',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'text' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Big section heading',
      descriptionAr: 'عنوان قسم رئيسي كبير',
      icon: Heading1,
      id: 'h1',
      keywords: ['h1', 'heading', 'title', 'عنوان', 'رئيسي', 'كبير'],
      label: 'Heading 1',
      labelAr: 'عنوان 1',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'h1' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Medium section heading',
      descriptionAr: 'عنوان فرعي متوسط',
      icon: Heading2,
      id: 'h2',
      keywords: ['h2', 'subheading', 'عنوان', 'فرعي', 'متوسط'],
      label: 'Heading 2',
      labelAr: 'عنوان 2',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'h2' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Small section heading',
      descriptionAr: 'عنوان فرعي صغير',
      icon: Heading3,
      id: 'h3',
      keywords: ['h3', 'small heading', 'عنوان', 'صغير'],
      label: 'Heading 3',
      labelAr: 'عنوان 3',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'h3' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Track tasks with a to-do list',
      descriptionAr: 'قائمة مهام مع مربعات اختيار تفاعلية',
      icon: ListTodo,
      id: 'todo',
      keywords: ['todo', 'task', 'check', 'مهام', 'قائمة', 'مهمة', 'اختيار'],
      label: 'To-do list',
      labelAr: 'قائمة مهام',
      run: (bId) => {
        updateBlock(bId, { checked: false, content: '', type: 'todo' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Create a simple bulleted list',
      descriptionAr: 'قائمة نقطية بسيطة',
      icon: List,
      id: 'bullet',
      keywords: ['bullet', 'list', 'نقطة', 'قائمة', 'عناصر'],
      label: 'Bulleted list',
      labelAr: 'قائمة نقطية',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'bullet' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Create a numbered list',
      descriptionAr: 'قائمة مرقمة متسلسلة',
      icon: ListOrdered,
      id: 'number',
      keywords: ['number', 'ordered', 'ترقيم', 'أرقام', 'تسلسل'],
      label: 'Numbered list',
      labelAr: 'قائمة مرقمة',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'number' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Make writing stand out with an icon',
      descriptionAr: 'ملاحظة مميزة مع رمز وخلفية هادئة',
      icon: Lightbulb,
      id: 'callout',
      keywords: ['callout', 'note', 'tip', 'ملاحظة', 'تنبيه', 'فكرة'],
      label: 'Callout',
      labelAr: 'ملاحظة مميزة',
      run: (bId) => {
        updateBlock(bId, { calloutIcon: 'lucide:Lightbulb', content: '', type: 'callout' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Visually divide blocks with a line',
      descriptionAr: 'خط فاصل بين الأقسام',
      icon: Minus,
      id: 'divider',
      keywords: ['divider', 'line', 'separator', 'فاصل', 'خط'],
      label: 'Divider',
      labelAr: 'فاصل',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'divider' });
        insertBlockAfter(bId, 'text', '');
        setActiveSlashBlockId(null);
      },
    },

    // Layout (2 Columns)
    {
      category: 'layout',
      description: 'Split into 2 side-by-side columns on the same line',
      descriptionAr: 'تقسيم الصفحة إلى عمودين متجاورين في نفس السطر',
      icon: Columns,
      id: 'columns',
      keywords: ['columns', '2 columns', 'split', 'side by side', 'عمودين', 'تقسيم', 'أعمدة'],
      label: '2 Columns',
      labelAr: 'عمودين متجاورين',
      run: (bId) => {
        updateBlock(bId, {
          col1Blocks: [{ content: '', id: 'col1_' + Math.random().toString(36).substring(2, 9), type: 'text' }],
          col2Blocks: [{ content: '', id: 'col2_' + Math.random().toString(36).substring(2, 9), type: 'text' }],
          content: '',
          type: 'columns',
        });
        setActiveSlashBlockId(null);
      },
    },

    ...(['quote', 'code', 'toggle'] as const).map((type): SlashOption => ({
      category: 'basic', id: type, icon: type === 'code' ? FileText : type === 'quote' ? Lightbulb : List,
      label: { quote: 'Quote', code: 'Code', toggle: 'Toggle list' }[type],
      labelAr: { quote: 'اقتباس', code: 'كود', toggle: 'قائمة قابلة للطي' }[type],
      description: { quote: 'Highlight a quotation', code: 'Code with preserved spacing', toggle: 'Collapsible notes under a heading' }[type],
      descriptionAr: { quote: 'إبراز اقتباس', code: 'كتابة كود', toggle: 'ملاحظات قابلة للطي' }[type],
      keywords: [type, 'block'], run: (id) => { updateBlock(id, { type, content: '', col1Blocks: type === 'toggle' ? [{ id: crypto.randomUUID(), type: 'text', content: '' }] : undefined }); setActiveSlashBlockId(null); focusBlock(id); },
    })),
    ...(['page-link', 'embed', 'bookmark', 'image', 'video', 'audio', 'file', 'simple-table', 'table-of-contents'] as const).map((type): SlashOption => ({
      category: 'basic', id: type, icon: FileText,
      label: { 'page-link': 'Link to page', embed: 'Embed', bookmark: 'Web bookmark', image: 'Image', video: 'Video', audio: 'Audio', file: 'File link', 'simple-table': 'Simple table', 'table-of-contents': 'Table of contents' }[type],
      labelAr: { 'page-link': 'رابط صفحة', embed: 'تضمين', bookmark: 'إشارة ويب', image: 'صورة', video: 'فيديو', audio: 'صوت', file: 'رابط ملف', 'simple-table': 'جدول بسيط', 'table-of-contents': 'محتويات الصفحة' }[type],
      description: type === 'page-link' ? 'Link a workspace page with automatic backlinks' : type === 'simple-table' ? 'Rows and columns without a database' : type === 'table-of-contents' ? 'Navigate headings on this page' : 'Add content using a web URL',
      descriptionAr: 'إضافة محتوى إلى الصفحة', keywords: [type, 'media', 'link'],
      run: (id) => { updateBlock(id, { type, content: '' }); setActiveSlashBlockId(null); },
    })),
    // Databases
    {
      category: 'database',
      description: 'Create a new inline database in this page',
      descriptionAr: 'إنشاء قاعدة بيانات جديدة داخل هذه الصفحة',
      icon: Database,
      id: 'db_new',
      keywords: ['new database', 'inline database', 'قاعدة بيانات جديدة'],
      label: 'New database',
      labelAr: 'قاعدة بيانات جديدة',
      run: (bId) => {
        setNewDatabaseBlockId(bId);
        setNewDatabaseTitle('');
        setNewDatabaseError(undefined);
      },
    },
    {
      category: 'database',
      description: 'Choose an existing database after inserting this block',
      descriptionAr: 'اختر قاعدة بيانات موجودة بعد إدراج هذا العنصر',
      icon: Database,
      id: 'db_link',
      keywords: ['link database', 'linked view', 'existing database', 'قاعدة بيانات مرتبطة'],
      label: 'Link to a database',
      labelAr: 'ربط بقاعدة بيانات',
      run: (bId) => {
        setLinkDatabaseBlockId(bId);
        setLinkDatabaseError(undefined);
      },
    },
  ];

  const filteredSlashOptions = slashOptions.filter((opt) => {
    if (!slashQuery) return true;
    const q = slashQuery.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    return (
      opt.label.toLowerCase().includes(q) ||
      opt.labelAr.includes(q) ||
      opt.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });

  // Drag-and-drop block reordering
  function handleDragStart(event: React.DragEvent, index: number) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', blocks[index]?.id ?? '');
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOverEdge(e.clientY >= rect.top + rect.height / 2 ? 'after' : 'before');
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      if (draggedIndex !== null) signalMoveFailure(blocks[draggedIndex]?.id);
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(draggedIndex, 1);
    if (moved) {
      const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertAt = Math.max(0, adjustedTarget + (dragOverEdge === 'after' ? 1 : 0));
      next.splice(insertAt, 0, moved);
      onChange(next);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) { signalMoveFailure(blocks[index]?.id); return; }
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next);
    requestAnimationFrame(() => focusBlock(moved.id));
  }

  async function addDroppedFiles(files: FileList) {
    setFileError('');
    try {
    const additions: NotionBlock[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const result = await window.maxApi.assets.importImage(new Uint8Array(await file.arrayBuffer()), file.name);
        if (!result.ok) throw new Error(result.error.message);
        additions.push({ caption: file.name, content: '', id: crypto.randomUUID(), type: 'image', url: result.value.url });
        continue;
      }
      const result = await window.maxApi.assets.importAttachment(new Uint8Array(await file.arrayBuffer()), file.name);
      if (!result.ok) throw new Error(result.error.message);
      additions.push({ caption: file.name, content: '', id: crypto.randomUUID(), type: 'file', url: result.value.url });
    }
    if (additions.length) onChange([...currentBlocks.current, ...additions]);
    } catch (error) { setFileError(String(error)); }
  }

  return (
    <div
      ref={canvasRef}
      tabIndex={-1}
      className="notion-editor-canvas"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault(); event.stopPropagation();
        void addDroppedFiles(event.dataTransfer.files);
      }}
      onContextMenu={(event) => {
        const target = event.target as Element;
        if (target.closest('.notion-editor-canvas') !== event.currentTarget || target.closest('.database-page-container,button,a')) return;
        event.preventDefault(); event.stopPropagation();
        const row = target.closest('.notion-block-row');
        const index = row ? Array.from(event.currentTarget.children).indexOf(row) : blocks.length - 1;
        const block = blocks[index];
        if (block && block.type === 'text' && ['', '/'].includes(block.content.replace(/[\u200B-\u200D\uFEFF]/g, '').trim())) {
          setActiveSlashBlockId(block.id); setSlashQuery(''); setSlashIndex(0); focusBlock(block.id);
        } else openInsertMenu(block?.id ?? '');
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        setSelectedLines([]); selectionAnchor.current = null;
        window.getSelection()?.removeAllRanges();
      }}
      onKeyDownCapture={(event) => {
        if ((event.target as Element).closest('.notion-editor-canvas') !== event.currentTarget) return;
        if ((event.ctrlKey || event.metaKey) && matchesShortcut(event, 'z') && !(event.target as Element).closest('.database-page-container')) {
          const from = event.shiftKey ? redoStack.current : undoStack.current;
          const to = event.shiftKey ? undoStack.current : redoStack.current;
          const previous = from.pop();
          if (previous) { event.preventDefault(); event.stopPropagation(); to.push(currentBlocks.current); currentBlocks.current = previous; publish(previous); setSelectedLines([]); }
          return;
        }
        if (event.nativeEvent.isComposing || (event.target as Element).closest('input,textarea,.inline-format-toolbar')) return;
        if ((event.target as Element).closest('.database-page-container,.notion-slash-menu,.notion-block-action-menu')) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault(); event.stopPropagation();
          selectionAnchor.current = 0;
          if (blocks.length) selectLines(0, blocks.length - 1);
          event.currentTarget.focus();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && deletedSelection.current) {
          event.preventDefault(); event.stopPropagation(); onChange(deletedSelection.current); deletedSelection.current = null;
          event.currentTarget.focus(); return;
        }
        if ((event.target as Element).closest('[contenteditable="true"]') && !selectedLines.length) return;
        if (selectedLines.length && (event.key === 'Backspace' || event.key === 'Delete')) {
          event.preventDefault(); event.stopPropagation();
          deletedSelection.current = blocks;
          const next = blocks.filter((_, index) => !selectedLines.includes(index));
          const fallback: NotionBlock = { id: crypto.randomUUID(), type: 'text', content: '' };
          onChange(next.length ? next : [fallback]);
          setSelectedLines([]); selectionAnchor.current = null;
          focusBlock((next.at(-1) ?? fallback).id);
        } else if (event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          const current = blocks.findIndex((block) => block.id === focusedBlockId);
          const anchor = selectionAnchor.current ?? Math.max(0, current);
          const edge = selectedLines.length ? (event.key === 'ArrowDown' ? selectedLines.at(-1)! : selectedLines[0]!) : anchor;
          event.preventDefault(); event.stopPropagation(); selectionAnchor.current = anchor;
          selectLines(anchor, Math.max(0, Math.min(blocks.length - 1, edge + (event.key === 'ArrowDown' ? 1 : -1))));
          event.currentTarget.focus();
        } else if (event.key === 'Escape') {
          setSelectedLines([]); selectionAnchor.current = null;
        }
      }}
      onCopy={(event) => {
        if (!selectedLines.length || (event.target as Element).closest('.notion-editor-canvas') !== event.currentTarget) return;
        event.preventDefault(); event.stopPropagation();
        event.clipboardData.setData('text/plain', pageText(blocks.filter((_, index) => selectedLines.includes(index))));
      }}
      onClick={(event) => {
        if (selectedLines.length || !window.getSelection()?.isCollapsed) return;
        if (event.target !== event.currentTarget) return;
        const last = blocks.at(-1);
        if (!last) insertBlockAfter('', 'text', '');
        else if (['divider', 'database-view', 'columns', 'page-link', 'embed', 'bookmark', 'image', 'video', 'audio', 'file', 'simple-table', 'table-of-contents'].includes(last.type)) insertBlockAfter(last.id, 'text', '');
        else focusBlock(last.id);
      }}
    >
      {selectedLines.length > 0 && <div className="block-selection-toolbar" role="toolbar" aria-label={locale === 'ar' ? 'الكتل المحددة' : 'Selected blocks'}>
        <span>{selectedLines.length} {locale === 'ar' ? 'محدد' : 'selected'}</span>
        <select aria-label={locale === 'ar' ? 'تحويل إلى' : 'Turn selected blocks into'} value="" onChange={event => {
          const type = event.target.value as BlockType;
          onChange(blocks.map((block, index) => selectedLines.includes(index) ? { ...block, type, calloutIcon: block.calloutIcon || 'lucide:Lightbulb' } : block));
        }}><option value="" disabled>{locale === 'ar' ? 'تحويل إلى…' : 'Turn into…'}</option>{(['text','h1','h2','h3','bullet','number','todo','quote','callout','code'] as const).map(type => <option key={type} value={type}>{({text:'Text',h1:'Heading 1',h2:'Heading 2',h3:'Heading 3',bullet:'Bulleted list',number:'Numbered list',todo:'To-do',quote:'Quote',callout:'Callout',code:'Code'})[type]}</option>)}</select>
      </div>}
      <p className="sr-only" role="status">{failedMoveBlockId ? (locale === 'ar' ? 'لا يمكن نقل الكتلة أبعد من ذلك.' : 'This block cannot move any farther.') : ''}</p>
      {fileError && <p role="alert">{fileError}</p>}
      {blocks.map((block, index) => {
        const isDragging = draggedIndex === index;
        const isDragOver = dragOverIndex === index;
        const isSlashActive = activeSlashBlockId === block.id;
        let listNumber = 1;
        for (let previous = index - 1; previous >= 0 && blocks[previous]?.type === 'number'; previous--) listNumber++;
        const richText = <RichTextBlock blockId={block.id} content={block.content} focused={focusedBlockId === block.id} index={index} locale={locale} onContentChange={handleContentChange} onFocus={() => setFocusedBlockId(block.id)} onBlur={() => setFocusedBlockId(null)} onKeyDown={(event) => handleKeyDown(event, block, index)} registerRef={(element) => { if (element) inputRefs.current.set(block.id, element); else inputRefs.current.delete(block.id); }} />;

        return (
          <div
            key={block.id}
            className="notion-block-row"
            data-block-id={block.id}
            onKeyDown={(event) => {
              if (block.type !== 'page-link' || event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey) return;
              const target = event.target as Element;
              if (!target.closest('.page-link-row')) return;
              event.preventDefault(); event.stopPropagation(); removeBlock(block.id);
            }}
            data-line-selected={selectedLines.includes(index)}
            onPointerDown={(event) => {
              const target = event.target as Element;
              if (target.closest('.notion-editor-canvas') !== canvasRef.current || target.closest('button,.database-page-container,.notion-slash-menu')) return;
              if (target.closest('input,textarea,[contenteditable="true"],a')) { selecting.current = false; return; }
              if (event.shiftKey && selectionAnchor.current !== null) {
                event.preventDefault(); selectLines(selectionAnchor.current, index); canvasRef.current?.focus();
              } else { selectionAnchor.current = index; setSelectedLines([]); selecting.current = true; }
            }}
            onPointerEnter={(event) => {
              if (!selecting.current || !event.buttons || selectionAnchor.current === null || selectionAnchor.current === index) return;
              selectLines(selectionAnchor.current, index); canvasRef.current?.focus();
            }}
            data-scroll-kind={block.type}
            data-scroll-label={block.type === 'database-view' ? (block.databaseKind || (locale === 'ar' ? 'عرض قاعدة البيانات' : 'Database view')) : undefined}
            data-drag-over={isDragOver}
            data-dragging={isDragging}
            data-drop-edge={isDragOver ? dragOverEdge : undefined}
            data-move-failed={failedMoveBlockId === block.id || undefined}
            data-type={block.type}
            onClick={(e) => {
              if (selectedLines.length || !window.getSelection()?.isCollapsed) return;
              // Focus the block input if the user clicked the row padding/empty space
              if (e.target === e.currentTarget || (e.target as Element).classList.contains('notion-block-body')) {
                focusBlock(block.id);
              }
            }}
            onDragEnd={() => {
              setDraggedIndex(null);
              setDragOverIndex(null);
            }}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
          >
            {/* Gutter Handles (+ and Drag grip) - Hover Only */}
            <div className="notion-block-gutter">
              <button
                aria-label={locale === 'ar' ? 'إدراج عنصر أسفل' : 'Insert block below'}
                className="notion-gutter-btn notion-gutter-btn--add"
                onClick={() => openInsertMenu(block.id)}
                title={locale === 'ar' ? 'إدراج نص أو قاعدة بيانات' : 'Insert text or database'}
                type="button"
              >
                <Plus size={14} />
              </button>
              <button
                aria-label={locale === 'ar' ? 'خيارات السطر' : 'Block actions'}
                className="notion-gutter-btn notion-gutter-btn--drag"
                draggable
                aria-haspopup="menu"
                aria-expanded={blockMenuId === block.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => { event.stopPropagation(); if (event.shiftKey) { const anchor = selectionAnchor.current ?? index; selectionAnchor.current = anchor; selectLines(anchor, index); } else { selectionAnchor.current = index; setSelectedLines([index]); setBlockMenuId(current => current === block.id ? null : block.id); } }}
                onDragStart={(event) => handleDragStart(event, index)}
                onKeyDown={(event) => {
                  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault();
                    moveBlock(index, event.key === 'ArrowUp' ? -1 : 1);
                  }
                }}
                title={locale === 'ar' ? 'انقر للخيارات، اسحب للترتيب' : 'Click for options · Drag to reorder'}
                type="button"
              >
                <GripVertical size={14} />
              </button>
              {blockMenuId === block.id && (
                <div className="notion-block-action-menu" role="menu">
                  <button onClick={() => { setBlockMenuId(null); updateBlock(block.id, { type: 'text' }); }} role="menuitem" type="button">{locale === 'ar' ? 'نص' : 'Text'}</button>
                  <button onClick={() => { setBlockMenuId(null); updateBlock(block.id, { type: 'h2' }); }} role="menuitem" type="button">{locale === 'ar' ? 'عنوان' : 'Heading'}</button>
                  <button onClick={() => { const next = [...blocks]; next.splice(index + 1, 0, duplicateBlock(block)); onChange(next); setBlockMenuId(null); }} role="menuitem" type="button">{locale === 'ar' ? 'إنشاء نسخة' : 'Duplicate'}</button>
                  <button disabled={index === 0} onClick={() => { moveBlock(index, -1); setBlockMenuId(null); }} role="menuitem" type="button">{locale === 'ar' ? 'نقل لأعلى' : 'Move up'}</button>
                  <button disabled={index === blocks.length - 1} onClick={() => { moveBlock(index, 1); setBlockMenuId(null); }} role="menuitem" type="button">{locale === 'ar' ? 'نقل لأسفل' : 'Move down'}</button>
                  {['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code'].includes(block.type) && <details><summary>{locale === 'ar' ? 'تحويل إلى' : 'Turn into'}</summary>{(['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code'] as const).map((type) => <button type="button" role="menuitem" key={type} onClick={() => { updateBlock(block.id, { type }); setBlockMenuId(null); }}>{({ text: 'Text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'Bulleted list', number: 'Numbered list', todo: 'To-do', quote: 'Quote', code: 'Code' })[type]}</button>)}</details>}
                  <button className="danger" onClick={() => { setBlockMenuId(null); removeBlock(block.id); }} role="menuitem" type="button">{locale === 'ar' ? 'حذف' : 'Delete'}</button>
                </div>
              )}
            </div>

            {/* Block Body */}
            <div className="notion-block-body">
              {['page-link', 'embed', 'bookmark', 'image', 'video', 'audio', 'file', 'simple-table', 'table-of-contents'].includes(block.type) && <ExtraBlock block={block} blocks={blocks} locale={locale} onChange={(patch) => updateBlock(block.id, patch)} />}
              {block.type === 'text' && richText}
              {(block.type === 'quote' || block.type === 'code') && <textarea ref={(element) => { if (element) inputRefs.current.set(block.id, element); else inputRefs.current.delete(block.id); }} className={'notion-extra-block notion-extra-block--' + block.type} aria-label={block.type} rows={Math.max(2, block.content.split('\n').length)} value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} onKeyDown={(event) => { if (block.type !== 'code') handleKeyDown(event, block, index); }} />}
              {block.type === 'toggle' && <details className="notion-toggle-block" open><summary><input ref={(element) => { if (element) inputRefs.current.set(block.id, element); else inputRefs.current.delete(block.id); }} placeholder={locale === 'ar' ? 'عنوان' : 'Toggle heading'} value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></summary><NotionBlockEditor blocks={block.col1Blocks ?? []} locale={locale} onChange={(next) => updateBlock(block.id, { col1Blocks: next })} parentPageId={parentPageId} onWorkspaceChange={onWorkspaceChange} /></details>}
              {['h1', 'h2', 'h3'].includes(block.type) && richText}

              {block.type === 'todo' && (
                <div className="notion-todo-wrap" data-checked={Boolean(block.checked)}>
                  <button
                    aria-checked={Boolean(block.checked)}
                    aria-label="Toggle task"
                    className="notion-todo-checkbox"
                    data-checked={Boolean(block.checked)}
                    onClick={() => updateBlock(block.id, { checked: !block.checked })}
                    type="button"
                  >
                    {block.checked && <Check size={13} strokeWidth={3} />}
                  </button>
                  {richText}
                </div>
              )}

              {block.type === 'bullet' && (
                <div className="notion-bullet-wrap">
                  <span className="notion-bullet-dot" />
                  {richText}
                </div>
              )}

              {block.type === 'number' && (
                <div className="notion-number-wrap">
                  <span className="notion-number-prefix">{listNumber}.</span>
                  {richText}
                </div>
              )}

              {block.type === 'callout' && (
                <div className="notion-callout-card">
                  <button
                    aria-label={locale === 'ar' ? 'تغيير أيقونة الملاحظة' : 'Change callout icon'}
                    className="notion-callout-icon"
                    onClick={() => setCalloutPickerId((current) => current === block.id ? undefined : block.id)}
                    ref={(element) => { if (element) calloutIconRefs.current.set(block.id, element); else calloutIconRefs.current.delete(block.id); }}
                    type="button"
                  >
                    <PageIconRenderer fallback="lucide:Lightbulb" icon={block.calloutIcon || 'lucide:Lightbulb'} size={20} />
                  </button>
                  {calloutPickerId === block.id && (
                    <IconPickerDialog
                      anchor={calloutIconRefs.current.get(block.id)}
                      currentIcon={block.calloutIcon}
                      locale={locale}
                      onClose={() => setCalloutPickerId(undefined)}
                      onSelect={(calloutIcon) => { updateBlock(block.id, { calloutIcon }); setCalloutPickerId(undefined); }}
                    />
                  )}
                  {richText}
                </div>
              )}

              {block.type === 'divider' && (
                <div className="notion-divider-wrap">
                  <hr className="notion-divider" />
                </div>
              )}

              {/* 2-Column Side-by-Side Block */}
              {block.type === 'columns' && (
                <div className="notion-columns-container">
                  <div className="notion-column notion-column--1">
                    <NotionBlockEditor
                      blocks={
                        block.col1Blocks && block.col1Blocks.length > 0
                          ? block.col1Blocks
                          : [{ content: '', id: 'c1_' + Math.random().toString(36).substring(2, 7), type: 'text' }]
                      }
                      locale={locale}
                      onChange={(nextCol1) => updateBlock(block.id, { col1Blocks: nextCol1 })}
                      onWorkspaceChange={onWorkspaceChange}
                      parentPageId={parentPageId}
                    />
                  </div>
                  <div className="notion-column notion-column--2">
                    <NotionBlockEditor
                      blocks={
                        block.col2Blocks && block.col2Blocks.length > 0
                          ? block.col2Blocks
                          : [{ content: '', id: 'c2_' + Math.random().toString(36).substring(2, 7), type: 'text' }]
                      }
                      locale={locale}
                      onChange={(nextCol2) => updateBlock(block.id, { col2Blocks: nextCol2 })}
                      onWorkspaceChange={onWorkspaceChange}
                      parentPageId={parentPageId}
                    />
                  </div>
                </div>
              )}

              {/* Embedded Live Database View */}
              {block.type === 'database-view' && (
                <div className="notion-embedded-db-card">
                  <div className="notion-embedded-db-content">
                    <Suspense fallback={<DatabaseSkeleton embedded locale={locale} rows={3} />}>
                    {block.databaseId ? (
                      <DatabasePage databaseId={block.databaseId} embedded initialViewId={block.viewId} locale={locale} onRemoveEmbeddedView={() => removeBlock(block.id)} />
                    ) : (
                      <LegacyDatabaseLink alias={block.databaseKind ?? block.content} locale={locale} />
                    )}
                    </Suspense>
                  </div>
                </div>
              )}

              {/* Floating Slash Menu Palette */}
              {isSlashActive && (
                <div className="notion-slash-menu" role="menu">
                  <div className="notion-slash-menu__header">
                    <span>{locale === 'ar' ? 'العناصر والأوامر' : 'BASIC BLOCKS & VIEWS'}</span>
                    <kbd>ESC</kbd>
                  </div>
                  <div className="notion-slash-menu__list">
                    {newDatabaseBlockId === block.id ? (
                      <form className="notion-new-database-form" onSubmit={(event) => void createInlineDatabase(event)}>
                        <div className="notion-new-database-form__icon"><Database aria-hidden="true" size={19} /></div>
                        <div>
                          <strong>{locale === 'ar' ? 'قاعدة بيانات جديدة داخل هذه الصفحة' : 'New database in this page'}</strong>
                          <small>{locale === 'ar' ? 'ستظهر هنا كجدول مباشر ويمكنك إضافة طرق عرض لاحقًا.' : 'It will appear here as a live table. You can add more views later.'}</small>
                        </div>
                        <label>
                          <span className="sr-only">{locale === 'ar' ? 'اسم قاعدة البيانات' : 'Database name'}</span>
                          <input
                            autoFocus
                            onChange={(event) => setNewDatabaseTitle(event.target.value)}
                            placeholder={locale === 'ar' ? 'اسم قاعدة البيانات' : 'Database name'}
                            value={newDatabaseTitle}
                          />
                        </label>
                        {newDatabaseError && <p className="form-error" role="alert">{newDatabaseError}</p>}
                        <div className="notion-new-database-form__actions">
                          <button onClick={() => setNewDatabaseBlockId(null)} type="button">{locale === 'ar' ? 'رجوع' : 'Back'}</button>
                          <button disabled={!newDatabaseTitle.trim() || creatingDatabase} type="submit">{creatingDatabase ? (locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…') : (locale === 'ar' ? 'إنشاء' : 'Create')}</button>
                        </div>
                      </form>
                    ) : linkDatabaseBlockId === block.id ? (
                      <div className="notion-database-picker">
                        <div className="notion-database-picker__heading">
                          <Database aria-hidden="true" size={18} />
                          <div>
                            <strong>{locale === 'ar' ? 'ربط بقاعدة بيانات' : 'Link to a database'}</strong>
                            <small>{locale === 'ar' ? 'اختر قاعدة البيانات التي تريد عرضها في هذه الصفحة.' : 'Choose the database to show on this page.'}</small>
                          </div>
                        </div>
                        {linkDatabaseError && <p className="form-error" role="alert">{linkDatabaseError}</p>}
                        <div className="notion-database-picker__list">
                          {workspaceDatabases.length > 0 ? workspaceDatabases.map((database) => (
                            <button
                              disabled={Boolean(linkingDatabaseId)}
                              key={database.id}
                              onClick={() => void linkDatabase(block.id, database)}
                              type="button"
                            >
                              <Database aria-hidden="true" size={16} />
                              <span>{database.title}</span>
                              {linkingDatabaseId === database.id && <small>{locale === 'ar' ? 'جارٍ الربط…' : 'Linking…'}</small>}
                            </button>
                          )) : (
                            <p>{locale === 'ar' ? 'لا توجد قواعد بيانات بعد. ارجع وأنشئ قاعدة بيانات جديدة.' : 'No databases yet. Go back and create a new database.'}</p>
                          )}
                        </div>
                        <button className="notion-database-picker__back" onClick={() => setLinkDatabaseBlockId(null)} type="button">
                          {locale === 'ar' ? 'رجوع' : 'Back'}
                        </button>
                      </div>
                    ) : filteredSlashOptions.length > 0 ? (
                      filteredSlashOptions.map((opt, optIdx) => {
                        const Icon = opt.icon;
                        const isSelected = optIdx === slashIndex;
                        return (
                          <button
                            key={opt.id}
                            className="notion-slash-item"
                            data-selected={isSelected}
                            onClick={() => opt.run(block.id)}
                            onMouseEnter={() => setSlashIndex(optIdx)}
                            type="button"
                          >
                            <div className="notion-slash-item__icon">
                              <Icon size={16} />
                            </div>
                            <div className="notion-slash-item__info">
                              <strong>{locale === 'ar' ? opt.labelAr : opt.label}</strong>
                              <small>{locale === 'ar' ? opt.descriptionAr : opt.description}</small>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="notion-slash-empty">
                        <p>{locale === 'ar' ? 'لا توجد نتائج' : 'No results found'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

    </div>
  );
}
