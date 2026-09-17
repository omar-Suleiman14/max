/**
 * A small, safe parser and serializer for the restricted YAML subset a page's
 * `---` frontmatter block can hold: flat `key: value` pairs whose values are
 * text, numbers, booleans, null, or a flat list of strings. Nothing here
 * executes a tag or resolves a reference — every value is a plain scalar or a
 * plain list of scalars.
 *
 * Duplicate keys resolve deterministically: the last occurrence wins, and it
 * takes the position of its last occurrence when the block is regenerated.
 */

export type FrontmatterScalar = string | number | boolean | readonly string[] | null;
export type FrontmatterEntry = readonly [key: string, value: FrontmatterScalar];
export type FrontmatterPropertyType = 'checkbox' | 'date' | 'multi_select' | 'number' | 'text';

export type FrontmatterSplit = Readonly<{ body: string; yaml: string }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_TOKEN = /^[+-]?(\d+\.\d+|\d+|\.\d+)$/;
const NULL_TOKEN = /^(null|Null|NULL|~)$/;
const TRUE_TOKEN = /^(true|True|TRUE)$/;
const FALSE_TOKEN = /^(false|False|FALSE)$/;

/**
 * Splits a leading `---` delimited block from the rest of a page's text.
 * Returns null when the block never closes, so a missing closing delimiter
 * never consumes the page body as frontmatter.
 */
export function splitFrontmatterBlock(source: string): FrontmatterSplit | null {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closeIndex === -1) return null;
  return { yaml: lines.slice(1, closeIndex).join('\n'), body: lines.slice(closeIndex + 1).join('\n') };
}

type ScalarResult = Readonly<{ error?: string; value: FrontmatterScalar }>;

function parseDoubleQuoted(token: string): ScalarResult {
  let out = '';
  let i = 1;
  while (i < token.length) {
    const ch = token[i];
    if (ch === '\\') {
      const next = token[i + 1];
      if (next === 'n') { out += '\n'; i += 2; continue; }
      if (next === 't') { out += '\t'; i += 2; continue; }
      if (next === '"') { out += '"'; i += 2; continue; }
      if (next === '\\') { out += '\\'; i += 2; continue; }
      if (next === 'u') {
        const hex = token.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return { value: null, error: 'Invalid unicode escape in a double-quoted value.' };
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6; continue;
      }
      return { value: null, error: `Unknown escape sequence "\\${next ?? ''}" in a double-quoted value.` };
    }
    if (ch === '"') {
      if (i !== token.length - 1) return { value: null, error: 'Unexpected characters after a closing double quote.' };
      return { value: out };
    }
    out += ch; i += 1;
  }
  return { value: null, error: 'Unterminated double-quoted value.' };
}

function parseSingleQuoted(token: string): ScalarResult {
  let out = '';
  let i = 1;
  while (i < token.length) {
    const ch = token[i];
    if (ch === "'") {
      if (token[i + 1] === "'") { out += "'"; i += 2; continue; }
      if (i !== token.length - 1) return { value: null, error: 'Unexpected characters after a closing single quote.' };
      return { value: out };
    }
    out += ch; i += 1;
  }
  return { value: null, error: 'Unterminated single-quoted value.' };
}

function parseFlowArray(token: string): ScalarResult {
  if (token[token.length - 1] !== ']') return { value: null, error: 'A list must end with "]".' };
  const inner = token.slice(1, -1).trim();
  if (inner === '') return { value: [] };
  const items: string[] = [];
  let i = 0;
  while (i < inner.length) {
    while (inner[i] === ' ') i += 1;
    let raw: ScalarResult;
    let end: number;
    if (inner[i] === '"' || inner[i] === "'") {
      const quote = inner[i];
      let j = i + 1;
      while (j < inner.length && !(inner[j] === quote && !(quote === "'" && inner[j + 1] === "'"))) {
        if (quote === "'" && inner[j] === "'" && inner[j + 1] === "'") j += 2;
        else j += 1;
      }
      end = j + 1;
      const token2 = inner.slice(i, end);
      raw = quote === '"' ? parseDoubleQuoted(token2) : parseSingleQuoted(token2);
    } else {
      let j = i;
      while (j < inner.length && inner[j] !== ',') j += 1;
      end = j;
      raw = parseScalarToken(inner.slice(i, j).trim());
    }
    if (raw.error) return raw;
    if (typeof raw.value !== 'string') return { value: null, error: 'A list item must be text.' };
    items.push(raw.value);
    i = end;
    while (inner[i] === ' ') i += 1;
    if (inner[i] === ',') { i += 1; continue; }
    if (i >= inner.length) break;
    return { value: null, error: `Unexpected character "${inner[i]}" in a list.` };
  }
  return { value: items };
}

function parseScalarToken(token: string): ScalarResult {
  if (token === '') return { value: null };
  if (NULL_TOKEN.test(token)) return { value: null };
  if (TRUE_TOKEN.test(token)) return { value: true };
  if (FALSE_TOKEN.test(token)) return { value: false };
  if (NUMBER_TOKEN.test(token)) return { value: Number(token) };
  if (token[0] === '"') return parseDoubleQuoted(token);
  if (token[0] === "'") return parseSingleQuoted(token);
  if (token[0] === '[') return parseFlowArray(token);
  return { value: token };
}

export type FrontmatterParseResult = Readonly<{ entries: readonly FrontmatterEntry[]; error: string | null }>;

/** Parses a `key: value` block. The text passed in excludes the `---` delimiters. */
export function parseFrontmatterYaml(yamlText: string): FrontmatterParseResult {
  const lines = yamlText.split(/\r?\n/);
  const values = new Map<string, FrontmatterScalar>();
  let error: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    if (/^[ \t]*$/.test(rawLine)) { i += 1; continue; }
    if (rawLine[0] === '\t') { error = 'Tabs are not allowed for indentation.'; break; }
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('#')) { i += 1; continue; }
    if (/^[ \t]/.test(rawLine)) { error = `Unexpected indentation: "${rawLine}".`; break; }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) { error = `Expected "key: value", got "${trimmed}".`; break; }
    const key = trimmed.slice(0, colonIndex).trim();
    if (!key) { error = `A property name cannot be empty ("${trimmed}").`; break; }
    const afterColon = trimmed.slice(colonIndex + 1).trim();
    if (afterColon === '') {
      const items: string[] = [];
      let j = i + 1;
      let sawItem = false;
      while (j < lines.length) {
        const peek = lines[j] ?? '';
        if (/^[ \t]*$/.test(peek)) { j += 1; continue; }
        if (peek[0] === '\t') { error = 'Tabs are not allowed for indentation.'; break; }
        const match = /^ +-(?: (.*))?$/.exec(peek);
        if (!match) break;
        sawItem = true;
        const itemScalar = parseScalarToken((match[1] ?? '').trim());
        if (itemScalar.error) { error = itemScalar.error; break; }
        if (typeof itemScalar.value !== 'string') { error = `A list item must be text ("${peek.trim()}").`; break; }
        items.push(itemScalar.value);
        j += 1;
      }
      if (error) break;
      if (sawItem) { values.delete(key); values.set(key, items); i = j; continue; }
      values.delete(key); values.set(key, null); i += 1; continue;
    }
    const scalar = parseScalarToken(afterColon);
    if (scalar.error) { error = scalar.error; break; }
    values.delete(key); values.set(key, scalar.value);
    i += 1;
  }
  return { entries: [...values.entries()], error };
}

const NEEDS_QUOTING = /^[\s]|[\s]$|^[-?:#&*!|>'"%@`[\]{},]|: |:$/;

function quoteIfNeeded(value: string): string {
  if (value === '') return '""';
  if (NULL_TOKEN.test(value) || TRUE_TOKEN.test(value) || FALSE_TOKEN.test(value) || NUMBER_TOKEN.test(value) || NEEDS_QUOTING.test(value) || value.includes('\n')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
  }
  return value;
}

function stringifyScalar(value: FrontmatterScalar): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${(value as readonly string[]).map((item) => quoteIfNeeded(item)).join(', ')}]`;
  return quoteIfNeeded(value as string);
}

/** Serializes entries back into `key: value` lines, in the given order. */
export function stringifyFrontmatterYaml(entries: readonly FrontmatterEntry[]): string {
  return entries.map(([key, value]) => `${key}: ${stringifyScalar(value)}`).join('\n');
}

/** Wraps serialized entries with the `---` delimiters that mark a frontmatter block. */
export function formatFrontmatterBlock(entries: readonly FrontmatterEntry[]): string {
  return `---\n${stringifyFrontmatterYaml(entries)}\n---`;
}

/**
 * The type a brand-new property should get from a YAML value. Never used to
 * override the type of a property that already exists, and never inferred
 * from the key's name — only from the value's shape.
 */
export function inferFrontmatterPropertyType(value: FrontmatterScalar): FrontmatterPropertyType {
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'multi_select';
  if (typeof value === 'string' && ISO_DATE.test(value)) return 'date';
  return 'text';
}
