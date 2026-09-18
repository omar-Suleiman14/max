import { describe, expect, it } from 'vitest';
import {
  formatFrontmatterBlock,
  inferFrontmatterPropertyType,
  parseFrontmatterYaml,
  splitFrontmatterBlock,
  stringifyFrontmatterYaml,
  type FrontmatterEntry,
} from './page-frontmatter';

function roundTrip(entries: readonly FrontmatterEntry[]) {
  const yaml = stringifyFrontmatterYaml(entries);
  const parsed = parseFrontmatterYaml(yaml);
  expect(parsed.error).toBeNull();
  return parsed.entries;
}

describe('page-frontmatter round trip', () => {
  it('round-trips text', () => {
    expect(roundTrip([['Title', 'Hello world']])).toEqual([['Title', 'Hello world']]);
  });

  it('round-trips numbers, including decimals and negatives', () => {
    expect(roundTrip([['Count', 42], ['Ratio', 3.5], ['Delta', -7]])).toEqual([['Count', 42], ['Ratio', 3.5], ['Delta', -7]]);
  });

  it('round-trips booleans', () => {
    expect(roundTrip([['Done', true], ['Archived', false]])).toEqual([['Done', true], ['Archived', false]]);
  });

  it('round-trips an ISO date', () => {
    expect(roundTrip([['Due', '2024-03-15']])).toEqual([['Due', '2024-03-15']]);
  });

  it('round-trips a list', () => {
    expect(roundTrip([['Tags', ['one', 'two', 'three']]])).toEqual([['Tags', ['one', 'two', 'three']]]);
  });

  it('round-trips a value that needs quoting', () => {
    expect(roundTrip([['Note', 'trailing space ']])).toEqual([['Note', 'trailing space ']]);
    expect(roundTrip([['Note', 'a: b']])).toEqual([['Note', 'a: b']]);
    expect(roundTrip([['Note', '- dash led']])).toEqual([['Note', '- dash led']]);
    expect(roundTrip([['Note', '123']])).toEqual([['Note', '123']]);
    expect(roundTrip([['Note', 'true']])).toEqual([['Note', 'true']]);
  });

  it('round-trips Unicode and Arabic text', () => {
    expect(roundTrip([['العنوان', 'مرحباً بالعالم 🎉']])).toEqual([['العنوان', 'مرحباً بالعالم 🎉']]);
  });

  it('round-trips an empty string distinctly from null', () => {
    expect(roundTrip([['Empty', ''], ['Nothing', null]])).toEqual([['Empty', ''], ['Nothing', null]]);
  });

  it('round-trips a value containing a newline', () => {
    expect(roundTrip([['Multi', 'line one\nline two']])).toEqual([['Multi', 'line one\nline two']]);
  });
});

describe('splitFrontmatterBlock', () => {
  it('splits a well-formed block', () => {
    const result = splitFrontmatterBlock('---\nTitle: Hello\n---\nBody text');
    expect(result).toEqual({ yaml: 'Title: Hello', body: 'Body text' });
  });

  it('returns null and leaves the body untouched when the closing delimiter is missing', () => {
    const source = '---\nTitle: Hello\nStill going with no closer';
    expect(splitFrontmatterBlock(source)).toBeNull();
  });

  it('returns null when the text does not begin with a delimiter', () => {
    expect(splitFrontmatterBlock('Just a paragraph.\n---\nnot frontmatter')).toBeNull();
  });
});

describe('parseFrontmatterYaml failures', () => {
  it('reports malformed YAML without throwing', () => {
    const result = parseFrontmatterYaml('this has no colon');
    expect(result.error).not.toBeNull();
  });

  it('reports an unterminated quoted value', () => {
    const result = parseFrontmatterYaml('Title: "unterminated');
    expect(result.error).not.toBeNull();
  });

  it('reports tabs used for indentation', () => {
    const result = parseFrontmatterYaml('Tags:\n\t- one');
    expect(result.error).not.toBeNull();
  });

  it('resolves duplicate keys deterministically: last value wins, moved to the end', () => {
    const result = parseFrontmatterYaml('A: 1\nB: 2\nA: 3');
    expect(result.error).toBeNull();
    expect(result.entries).toEqual([['B', 2], ['A', 3]]);
  });
});

describe('inferFrontmatterPropertyType', () => {
  it('infers checkbox from a boolean', () => {
    expect(inferFrontmatterPropertyType(true)).toBe('checkbox');
  });

  it('infers number from an integer or decimal', () => {
    expect(inferFrontmatterPropertyType(5)).toBe('number');
    expect(inferFrontmatterPropertyType(5.5)).toBe('number');
  });

  it('infers date from an ISO date string', () => {
    expect(inferFrontmatterPropertyType('2024-01-01')).toBe('date');
  });

  it('infers multi_select from a list', () => {
    expect(inferFrontmatterPropertyType(['a', 'b'])).toBe('multi_select');
  });

  it('infers text for any other scalar, including a key named status', () => {
    expect(inferFrontmatterPropertyType('in progress')).toBe('text');
  });

  it('infers text for a single quoted string, never select', () => {
    expect(inferFrontmatterPropertyType('Backlog')).toBe('text');
  });

  it('infers text for null', () => {
    expect(inferFrontmatterPropertyType(null)).toBe('text');
  });
});

describe('formatFrontmatterBlock', () => {
  it('wraps serialized entries with delimiters', () => {
    expect(formatFrontmatterBlock([['Title', 'Hello']])).toBe('---\nTitle: Hello\n---');
  });
});
