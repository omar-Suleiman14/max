/**
 * The desktop adapter between Max's canonical MaxDocument and BlockNote.
 *
 * BlockNote is an editing surface only. Everything that is persisted, synced,
 * published or exported is a MaxBlock; this module is the one place that knows
 * both shapes. It is lossless by construction:
 *
 * - Every block keeps its Max id, which BlockNote carries unchanged.
 * - Fields a BlockNote block cannot represent stay in the original MaxBlock,
 *   which `toMaxDocument` merges back by id.
 * - A block kind or block version this build does not understand becomes an
 *   `unsupported` block carrying its complete source, and is written back
 *   byte-for-byte.
 */
import { MAX_DOCUMENT_VERSION, type MaxBlock, type MaxDocument } from '../../shared/max-document';
import { legacyBlocksToMaxDocument } from '../../shared/max-document-legacy';
import { parseInline, serializeInline, type MaxInlineMarks, type MaxInlineRun } from '../../shared/max-inline';

export type BnStyles = Readonly<Partial<Record<'bold' | 'code' | 'highlight' | 'italic' | 'strike' | 'underline', boolean>>>;
export type BnText = Readonly<{ type: 'text'; text: string; styles: BnStyles }>;
export type BnLink = Readonly<{ type: 'link'; href: string; content: readonly BnText[] }>;
export type BnPageMention = Readonly<{ type: 'pageMention'; props: Readonly<{ pageId: string; label: string }> }>;
export type BnInline = BnText | BnLink | BnPageMention;
export type BnTableCell = Readonly<{ type: 'tableCell'; content: readonly BnInline[]; props?: Readonly<Record<string, unknown>> }>;
export type BnTable = Readonly<{ type: 'tableContent'; rows: readonly Readonly<{ cells: readonly (BnTableCell | readonly BnInline[])[] }>[] }>;
export type BnBlock = Readonly<{
  id: string;
  type: string;
  props: Readonly<Record<string, unknown>>;
  content?: readonly BnInline[] | BnTable;
  children: readonly BnBlock[];
}>;

/** Block kinds this adapter edits. Anything else is preserved as unsupported. */
export const EDITABLE_MAX_BLOCK_TYPES = [
  'text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code', 'toggle', 'callout', 'divider',
  'image', 'video', 'audio', 'file', 'simple-table', 'columns', 'database-view', 'page-link', 'embed',
  'bookmark', 'table-of-contents',
] as const;

const editable = new Set<string>(EDITABLE_MAX_BLOCK_TYPES);

/**
 * Fields each Max block kind derives from BlockNote. On the way back these are
 * rewritten from the editor; every other field of the original block survives.
 */
const OWNED: Readonly<Record<string, readonly string[]>> = {
  text: ['content'], h1: ['content'], h2: ['content'], h3: ['content'], bullet: ['content'], number: ['content', 'start'],
  todo: ['content', 'checked'], quote: ['content'], code: ['content', 'language'], toggle: ['content', 'col1Blocks'],
  callout: ['content', 'calloutIcon'], divider: [], image: ['url', 'caption', 'width', 'name'],
  video: ['url', 'caption', 'name'], audio: ['url', 'caption', 'name'], file: ['url', 'caption', 'name'],
  'simple-table': ['cells'], columns: ['col1Blocks', 'col2Blocks'],
  'database-view': ['content', 'databaseId', 'databaseKind', 'viewId'], 'page-link': ['pageId'],
  embed: ['url', 'caption'], bookmark: ['url', 'caption'], 'table-of-contents': [],
};
const STYLE_FIELDS = ['color', 'backgroundColor', 'textAlignment'];
const TYPE_FIELDS = new Set([...Object.values(OWNED).flat(), 'width']);

const COLOURS = new Set(['gray', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']);

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function colourProps(data: MaxBlock['data'], allowText = true): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const text = str(data.color);
  const background = str(data.backgroundColor).replace(/_bg$/, '');
  if (allowText && COLOURS.has(text)) props.textColor = text;
  if (COLOURS.has(background)) props.backgroundColor = background;
  return props;
}

function alignmentProps(data: MaxBlock['data']): Record<string, unknown> {
  const alignment = str(data.textAlignment);
  return ['center', 'right', 'justify'].includes(alignment) ? { textAlignment: alignment } : {};
}

function stylesFor(marks: MaxInlineMarks): BnStyles {
  const styles: Record<string, boolean> = {};
  for (const [mark, on] of Object.entries(marks)) if (on) styles[mark] = true;
  return styles;
}

/** Converts stored inline Markdown into BlockNote inline content. */
export function inlineToBlockNote(source: string): BnInline[] {
  const runs = parseInline(source);
  const out: BnInline[] = [];
  let index = 0;
  while (index < runs.length) {
    const run = runs[index]!;
    if (!run.link) { out.push({ styles: stylesFor(run.marks), text: run.text, type: 'text' }); index += 1; continue; }
    const group: MaxInlineRun[] = [];
    const key = JSON.stringify(run.link);
    while (index < runs.length && JSON.stringify(runs[index]!.link) === key) { group.push(runs[index]!); index += 1; }
    if ('pageId' in run.link) {
      out.push({ props: { label: serializeInline(group.map(({ marks, text }) => ({ marks, text }))), pageId: run.link.pageId }, type: 'pageMention' });
    } else {
      out.push({ content: group.map((item) => ({ styles: stylesFor(item.marks), text: item.text, type: 'text' as const })), href: run.link.href, type: 'link' });
    }
  }
  return out;
}

function marksFor(styles: BnStyles | undefined): MaxInlineMarks {
  const marks: Record<string, true> = {};
  for (const key of ['bold', 'code', 'highlight', 'italic', 'strike', 'underline'] as const) if (styles?.[key]) marks[key] = true;
  return marks;
}

/** Converts BlockNote inline content back into stored inline Markdown. */
export function inlineFromBlockNote(content: readonly BnInline[] | undefined): string {
  const runs: MaxInlineRun[] = [];
  for (const item of content ?? []) {
    if (item.type === 'text') runs.push({ marks: marksFor(item.styles), text: item.text });
    else if (item.type === 'link') {
      for (const text of item.content) runs.push({ link: { href: item.href }, marks: marksFor(text.styles), text: text.text });
    } else if (item.type === 'pageMention') {
      const label = item.props.label || item.props.pageId;
      for (const run of parseInline(label)) runs.push({ ...run, link: { pageId: item.props.pageId } });
    }
  }
  return serializeInline(runs);
}

function plainText(content: readonly BnInline[] | undefined): string {
  return (content ?? []).map((item) => item.type === 'text' ? item.text : item.type === 'link' ? item.content.map((text) => text.text).join('') : item.props.label).join('');
}

function legacyChildren(value: unknown): readonly MaxBlock[] {
  return Array.isArray(value) ? legacyBlocksToMaxDocument(value).blocks : [];
}

function unsupported(block: MaxBlock): BnBlock {
  return { children: [], id: block.id, props: { source: JSON.stringify(block) }, type: 'unsupported' };
}

function tableToBlockNote(cells: unknown): BnTable {
  const rows = Array.isArray(cells) && cells.length ? cells : [['', ''], ['', '']];
  return {
    rows: rows.map((row) => ({ cells: (Array.isArray(row) ? row : []).map((cell) => ({ content: inlineToBlockNote(str(cell)), type: 'tableCell' as const })) })),
    type: 'tableContent',
  };
}

function tableFromBlockNote(content: BnBlock['content']): string[][] {
  if (!content || Array.isArray(content) || !('rows' in content)) return [];
  return content.rows.map((row) => row.cells.map((cell) => inlineFromBlockNote(Array.isArray(cell) ? cell as readonly BnInline[] : (cell as BnTableCell).content)));
}

/** One MaxBlock as a BlockNote block. */
export function blockToBlockNote(block: MaxBlock): BnBlock {
  if (!editable.has(block.type) || (block.version !== undefined && block.version !== 1)) return unsupported(block);
  const { data } = block;
  const children = (block.children ?? []).map(blockToBlockNote);
  const base = { children, id: block.id };
  const inline = () => inlineToBlockNote(str(data.content));
  const styled = { ...colourProps(data), ...alignmentProps(data) };
  switch (block.type) {
    case 'text': return { ...base, content: inline(), props: styled, type: 'paragraph' };
    case 'h1': case 'h2': case 'h3':
      return { ...base, content: inline(), props: { ...styled, level: Number(block.type.slice(1)) }, type: 'heading' };
    case 'bullet': return { ...base, content: inline(), props: styled, type: 'bulletListItem' };
    case 'number': return { ...base, content: inline(), props: { ...styled, ...(typeof data.start === 'number' ? { start: data.start } : {}) }, type: 'numberedListItem' };
    case 'todo': return { ...base, content: inline(), props: { ...styled, checked: data.checked === true }, type: 'checkListItem' };
    case 'quote': return { ...base, content: inline(), props: colourProps(data), type: 'quote' };
    case 'code': return { ...base, content: [{ styles: {}, text: str(data.content), type: 'text' }], props: { language: str(data.language) || 'text' }, type: 'codeBlock' };
    case 'toggle': return {
      ...base,
      children: block.children?.length ? children : legacyChildren(data.col1Blocks).map(blockToBlockNote),
      content: inline(), props: styled, type: 'toggleListItem',
    };
    case 'callout': return { ...base, content: inline(), props: { ...colourProps(data), icon: str(data.calloutIcon) || 'lucide:Info' }, type: 'callout' };
    case 'divider': return { ...base, props: {}, type: 'divider' };
    case 'image': return {
      ...base,
      props: { ...colourProps(data, false), ...alignmentProps(data), caption: str(data.caption), name: str(data.name), url: str(data.url), ...(typeof data.width === 'number' ? { previewWidth: data.width } : {}) },
      type: 'image',
    };
    case 'video': case 'audio': case 'file':
      return { ...base, props: { ...colourProps(data, false), caption: str(data.caption), name: str(data.name) || str(data.caption), url: str(data.url) }, type: block.type };
    case 'simple-table': return { ...base, content: tableToBlockNote(data.cells), props: {}, type: 'table' };
    case 'columns': return {
      ...base,
      props: { columns: JSON.stringify([Array.isArray(data.col1Blocks) ? data.col1Blocks : [], Array.isArray(data.col2Blocks) ? data.col2Blocks : []]) },
      type: 'columns',
    };
    case 'database-view': return {
      ...base,
      props: { databaseId: str(data.databaseId), databaseKind: str(data.databaseKind) || str(data.content), viewId: str(data.viewId) },
      type: 'database',
    };
    case 'page-link': return { ...base, props: { pageId: str(data.pageId) }, type: 'pageLink' };
    case 'embed': case 'bookmark':
      return { ...base, props: { caption: str(data.caption), url: str(data.url) }, type: block.type };
    case 'table-of-contents': return { ...base, props: {}, type: 'tableOfContents' };
    default: return unsupported(block);
  }
}

function withoutFields(data: MaxBlock['data'], fields: Iterable<string>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...data };
  for (const field of fields) delete copy[field];
  return copy;
}

function colourData(props: BnBlock['props']): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (COLOURS.has(str(props.textColor))) data.color = props.textColor;
  if (COLOURS.has(str(props.backgroundColor))) data.backgroundColor = `${str(props.backgroundColor)}_bg`;
  if (['center', 'right', 'justify'].includes(str(props.textAlignment))) data.textAlignment = props.textAlignment;
  return data;
}

type Mapped = Readonly<{ type: string; data: Record<string, unknown>; children?: readonly MaxBlock[] }>;

function mapFromBlockNote(block: BnBlock, original: MaxBlock | undefined, recall: (id: string) => MaxBlock | undefined): Mapped | MaxBlock {
  const { props } = block;
  const inline = () => inlineFromBlockNote(block.content as readonly BnInline[] | undefined);
  const children = block.children.map((child) => fromBlockNote(child, recall));
  const nested = children.length ? { children } : {};
  switch (block.type) {
    case 'paragraph': return { ...nested, data: { content: inline(), ...colourData(props) }, type: 'text' };
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(props.level) || 1));
      return { ...nested, data: { content: inline(), ...colourData(props), ...(props.isToggleable ? { toggleable: true } : {}) }, type: `h${level}` };
    }
    case 'bulletListItem': return { ...nested, data: { content: inline(), ...colourData(props) }, type: 'bullet' };
    case 'numberedListItem': return { ...nested, data: { content: inline(), ...colourData(props), ...(typeof props.start === 'number' && props.start !== 1 ? { start: props.start } : {}) }, type: 'number' };
    case 'checkListItem': return { ...nested, data: { checked: props.checked === true, content: inline(), ...colourData(props) }, type: 'todo' };
    case 'quote': return { ...nested, data: { content: inline(), ...colourData(props) }, type: 'quote' };
    case 'codeBlock': {
      const language = str(props.language);
      const keepLanguage = language && (language !== 'text' || original?.data.language !== undefined);
      return { ...nested, data: { content: plainText(block.content as readonly BnInline[] | undefined), ...(keepLanguage ? { language } : {}) }, type: 'code' };
    }
    case 'toggleListItem': return { children, data: { content: inline(), ...colourData(props) }, type: 'toggle' };
    case 'callout': return { ...nested, data: { calloutIcon: str(props.icon) || 'lucide:Info', content: inline(), ...colourData(props) }, type: 'callout' };
    case 'divider': return { ...nested, data: {}, type: 'divider' };
    case 'image': return {
      ...nested,
      data: {
        caption: str(props.caption), url: str(props.url), ...colourData(props),
        ...(str(props.name) ? { name: props.name } : {}),
        ...(typeof props.previewWidth === 'number' ? { width: Math.round(props.previewWidth) } : {}),
      },
      type: 'image',
    };
    case 'video': case 'audio': case 'file': {
      const caption = str(props.caption) || (original ? '' : str(props.name));
      const name = str(props.name);
      return { ...nested, data: { caption, url: str(props.url), ...colourData(props), ...(name && name !== caption ? { name } : {}) }, type: block.type };
    }
    case 'table': return { ...nested, data: { cells: tableFromBlockNote(block.content) }, type: 'simple-table' };
    case 'columns': {
      let columns: unknown = [];
      try { columns = JSON.parse(str(props.columns)); } catch { /* A damaged prop keeps the original below. */ }
      const [col1Blocks, col2Blocks] = Array.isArray(columns) ? (columns as unknown[]) : [];
      if (!Array.isArray(col1Blocks) || !Array.isArray(col2Blocks)) return original ?? { data: {}, type: 'columns' };
      return { ...nested, data: { col1Blocks, col2Blocks }, type: 'columns' };
    }
    case 'database': {
      const databaseId = str(props.databaseId);
      const kind = str(props.databaseKind);
      return {
        ...nested,
        data: databaseId ? { databaseId, ...(str(props.viewId) ? { viewId: props.viewId } : {}) } : { content: kind, ...(kind ? { databaseKind: kind } : {}) },
        type: 'database-view',
      };
    }
    case 'pageLink': return { ...nested, data: str(props.pageId) ? { pageId: props.pageId } : {}, type: 'page-link' };
    case 'embed': case 'bookmark': return { ...nested, data: { caption: str(props.caption), url: str(props.url) }, type: block.type };
    case 'tableOfContents': return { ...nested, data: {}, type: 'table-of-contents' };
    case 'unsupported': {
      try {
        const source = JSON.parse(str(props.source)) as MaxBlock;
        // A pasted copy of an unsupported block must not share the source id.
        return source.id === block.id ? source : { ...source, id: block.id };
      } catch { return original ?? { data: {}, type: 'unknown' }; }
    }
    default: return { ...nested, data: { content: inline() }, type: 'text' };
  }
}

/** One BlockNote block as a MaxBlock, merged with what the editor loaded. */
export function fromBlockNote(block: BnBlock, recall: (id: string) => MaxBlock | undefined = () => undefined): MaxBlock {
  const original = recall(block.id);
  const mapped = mapFromBlockNote(block, original, recall);
  if ('id' in mapped) return mapped;
  const kept = original
    ? withoutFields(original.data, original.type === mapped.type ? [...(OWNED[mapped.type] ?? []), ...STYLE_FIELDS] : [...TYPE_FIELDS, ...STYLE_FIELDS])
    : {};
  const data = { ...kept, ...mapped.data };
  const extensions = original ? withoutFields(original, ['id', 'type', 'data', 'children']) : {};
  return {
    ...extensions,
    data,
    id: block.id,
    type: mapped.type,
    ...(mapped.children?.length ? { children: mapped.children } : {}),
  };
}

export function toBlockNote(document: MaxDocument): BnBlock[] {
  return document.blocks.map(blockToBlockNote);
}

export function toMaxDocument(blocks: readonly BnBlock[], recall: (id: string) => MaxBlock | undefined = () => undefined): MaxDocument {
  return { blocks: blocks.map((block) => fromBlockNote(block, recall)), version: MAX_DOCUMENT_VERSION };
}

/** Indexes every block, at every depth, so edits merge with what was loaded. */
export function indexBlocks(blocks: readonly MaxBlock[], into = new Map<string, MaxBlock>()): Map<string, MaxBlock> {
  for (const block of blocks) {
    into.set(block.id, block);
    if (block.children) indexBlocks(block.children, into);
    if (block.type === 'toggle' && !block.children?.length) indexBlocks(legacyChildren(block.data.col1Blocks), into);
  }
  return into;
}
