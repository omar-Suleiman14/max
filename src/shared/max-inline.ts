/**
 * Max's inline text format.
 *
 * A MaxBlock stores its text as a small Markdown dialect in `data.content`:
 * `**bold**`, `*italic*` or `_italic_`, `~~strike~~`, `++underline++`,
 * `==highlight==`, `` `code` ``, `[label](https://…)` and
 * `[label](max-page:<id>)` for a link to another Max page. A backslash escapes
 * a marker character so literal text never turns into formatting.
 *
 * This module turns that string into editor-neutral runs and back. Editors,
 * renderers and exporters consume runs; none of them parse the string on their
 * own, and none of them persist their own inline representation.
 */

export type MaxInlineMarks = Readonly<{
  bold?: true;
  code?: true;
  highlight?: true;
  italic?: true;
  strike?: true;
  underline?: true;
}>;

export type MaxInlineLink = Readonly<{ href: string } | { pageId: string }>;

export type MaxInlineRun = Readonly<{
  text: string;
  marks: MaxInlineMarks;
  link?: MaxInlineLink;
}>;

type Mark = keyof MaxInlineMarks;

const PAIRED: readonly (readonly [string, Mark])[] = [
  ['**', 'bold'],
  ['~~', 'strike'],
  ['++', 'underline'],
  ['==', 'highlight'],
];

const ESCAPABLE = new Set(['\\', '*', '_', '~', '`', '+', '=', '[', ']']);

const MARK_ORDER: readonly Mark[] = ['bold', 'italic', 'underline', 'strike', 'highlight'];

function isWord(char: string | undefined): boolean {
  return !!char && /[\p{L}\p{N}_]/u.test(char);
}

function sameMarks(a: MaxInlineMarks, b: MaxInlineMarks): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<Mark>;
  for (const key of keys) if (!!a[key] !== !!b[key]) return false;
  return true;
}

function sameLink(a?: MaxInlineLink, b?: MaxInlineLink): boolean {
  if (!a || !b) return a === b;
  return ('href' in a ? a.href : `page:${a.pageId}`) === ('href' in b ? b.href : `page:${b.pageId}`);
}

/** Merges neighbouring runs that carry identical formatting. */
export function normalizeRuns(runs: readonly MaxInlineRun[]): readonly MaxInlineRun[] {
  const out: MaxInlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const marks = Object.fromEntries(Object.entries(run.marks).filter(([, on]) => on)) as MaxInlineMarks;
    const previous = out[out.length - 1];
    if (previous && sameMarks(previous.marks, marks) && sameLink(previous.link, run.link)) {
      out[out.length - 1] = { ...previous, text: previous.text + run.text };
    } else out.push(run.link ? { link: run.link, marks, text: run.text } : { marks, text: run.text });
  }
  return out;
}

function withMark(runs: readonly MaxInlineRun[], mark: Mark): MaxInlineRun[] {
  return runs.map((run) => ({ ...run, marks: { ...run.marks, [mark]: true } }));
}

function findClosing(source: string, marker: string, from: number): number {
  for (let index = from; index <= source.length - marker.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (source.startsWith(marker, index)) return index;
  }
  return -1;
}

function parseLinkDestination(destination: string): MaxInlineLink | null {
  if (destination.startsWith('max-page:')) {
    try {
      const pageId = decodeURIComponent(destination.slice('max-page:'.length));
      return pageId ? { pageId } : null;
    } catch { return null; }
  }
  try {
    const url = new URL(destination);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? { href: destination } : null;
  } catch { return null; }
}

function parseRange(source: string): MaxInlineRun[] {
  const runs: MaxInlineRun[] = [];
  let plain = '';
  const flush = () => { if (plain) runs.push({ marks: {}, text: plain }); plain = ''; };
  let index = 0;
  outer: while (index < source.length) {
    const char = source[index]!;
    if (char === '\\' && ESCAPABLE.has(source[index + 1] ?? '')) {
      plain += source[index + 1];
      index += 2;
      continue;
    }
    if (char === '`') {
      const end = source.indexOf('`', index + 1);
      if (end > index + 1) {
        flush();
        runs.push({ marks: { code: true }, text: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (char === '[') {
      const close = findClosing(source, '](', index + 1);
      if (close > index + 1) {
        const end = source.indexOf(')', close + 2);
        const destination = end > close + 2 ? source.slice(close + 2, end) : '';
        const link = destination && !/\s/.test(destination) ? parseLinkDestination(destination) : null;
        if (link) {
          flush();
          for (const run of parseRange(source.slice(index + 1, close))) runs.push({ ...run, link });
          index = end + 1;
          continue;
        }
      }
    }
    for (const [marker, mark] of PAIRED) {
      if (!source.startsWith(marker, index)) continue;
      const end = findClosing(source, marker, index + marker.length);
      if (end > index + marker.length) {
        flush();
        runs.push(...withMark(parseRange(source.slice(index + marker.length, end)), mark));
        index = end + marker.length;
        continue outer;
      }
    }
    if ((char === '*' || char === '_') && !isWord(source[index - 1]) && source[index + 1] !== char && source[index + 1] !== ' ') {
      for (let end = findClosing(source, char, index + 1); end > index + 1; end = findClosing(source, char, end + 1)) {
        if (source[end - 1] === ' ' || isWord(source[end + 1]) || source[end + 1] === char) continue;
        flush();
        runs.push(...withMark(parseRange(source.slice(index + 1, end)), 'italic'));
        index = end + 1;
        continue outer;
      }
    }
    plain += char;
    index += 1;
  }
  flush();
  return runs;
}

/** Reads stored inline Markdown. Unrecognised syntax stays as literal text. */
export function parseInline(source: string): readonly MaxInlineRun[] {
  return normalizeRuns(parseRange(source));
}

function escapeAll(text: string): string {
  let out = '';
  for (const char of text) out += ESCAPABLE.has(char) ? `\\${char}` : char;
  return out;
}

function destinationFor(link: MaxInlineLink): string {
  return 'href' in link ? link.href : `max-page:${encodeURIComponent(link.pageId)}`;
}

const MARKER: Readonly<Record<Exclude<Mark, 'code'>, string>> = { bold: '**', highlight: '==', italic: '*', strike: '~~', underline: '++' };

function codeText(text: string, marks: MaxInlineMarks, escape: (text: string) => string): string {
  // Code spans cannot contain a backtick in this dialect. Keep the text and
  // drop the code mark rather than write a span that would read back wrong.
  return marks.code && !text.includes('`') && text ? `\`${text}\`` : escape(text);
}

/**
 * Writes a sequence of runs with marks opened and closed as spans, so a bold
 * phrase containing an italic word is written `**a *b* c**` rather than as
 * three separately wrapped pieces that no longer read back.
 */
function serializeSpans(runs: readonly MaxInlineRun[], escape: (text: string) => string): string {
  let out = '';
  const open: Exclude<Mark, 'code'>[] = [];
  for (const run of runs) {
    const wanted = MARK_ORDER.filter((mark) => run.marks[mark]) as Exclude<Mark, 'code'>[];
    let keep = 0;
    while (keep < open.length && wanted.includes(open[keep]!)) keep += 1;
    for (let index = open.length - 1; index >= keep; index -= 1) out += MARKER[open[index]!];
    open.length = keep;
    for (const mark of wanted) if (!open.includes(mark)) { out += MARKER[mark]; open.push(mark); }
    out += codeText(run.text, run.marks, escape);
  }
  for (let index = open.length - 1; index >= 0; index -= 1) out += MARKER[open[index]!];
  return out;
}

function serializeWith(runs: readonly MaxInlineRun[], escape: (text: string) => string): string {
  let out = '';
  let index = 0;
  while (index < runs.length) {
    const start = index;
    const link = runs[index]!.link;
    while (index < runs.length && sameLink(runs[index]!.link, link)) index += 1;
    const spans = serializeSpans(runs.slice(start, index), escape);
    out += link ? `[${spans}](${destinationFor(link)})` : spans;
  }
  return out;
}

function runsEqual(a: readonly MaxInlineRun[], b: readonly MaxInlineRun[]): boolean {
  return a.length === b.length && a.every((run, index) => run.text === b[index]!.text
    && sameMarks(run.marks, b[index]!.marks) && sameLink(run.link, b[index]!.link));
}

/**
 * Writes runs as inline Markdown. Plain text is written verbatim when that
 * already reads back identically, so ordinary text and existing pages keep
 * their stored form; otherwise marker characters are escaped.
 */
export function serializeInline(runs: readonly MaxInlineRun[]): string {
  const normalized = normalizeRuns(runs);
  const plain = serializeWith(normalized, (text) => text);
  if (runsEqual(parseInline(plain), normalized)) return plain;
  return serializeWith(normalized, escapeAll);
}

/** Visible text without formatting, for search, titles and previews. */
export function inlinePlainText(source: string): string {
  return parseInline(source).map((run) => run.text).join('');
}
