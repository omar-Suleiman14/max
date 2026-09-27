import { describe, expect, it } from 'vitest';

import { inlinePlainText, parseInline, serializeInline } from './max-inline';

describe('Max inline format', () => {
  it.each([
    'plain text',
    '**bold** and *italic* and _also italic_',
    '~~gone~~ ++under++ ==marked== `code *not italic*`',
    '**bold with *italic* inside**',
    'see [the site](https://example.com/a?b=1) now',
    'open [**Plans**](max-page:page%201) today',
    'مرحبا **بالعالم**',
    'multi\nline',
    '2*3*4 stays literal',
    'a snake_case_name stays literal',
    'unclosed **bold and [link](javascript:alert(1))',
  ])('reads and writes %j without changing its meaning', (source) => {
    const runs = parseInline(source);
    expect(parseInline(serializeInline(runs))).toEqual(runs);
  });

  it('keeps ordinary stored text byte-for-byte', () => {
    for (const source of ['plain', '**b** *i*', '[x](max-page:abc)', 'a * b']) expect(serializeInline(parseInline(source))).toBe(source);
  });

  it('reads page links as Max page identity', () => {
    expect(parseInline('[Plans](max-page:p%2F1)')).toEqual([{ link: { pageId: 'p/1' }, marks: {}, text: 'Plans' }]);
  });

  it('never turns literal marker characters into formatting', () => {
    const runs = [{ marks: {}, text: 'a *b* c ==d== [e](https://x.y)' }];
    const stored = serializeInline(runs);
    expect(parseInline(stored)).toEqual(runs);
    expect(inlinePlainText(stored)).toBe('a *b* c ==d== [e](https://x.y)');
  });

  it('refuses unsafe link destinations', () => {
    expect(parseInline('[x](javascript:alert(1))')[0]!.link).toBeUndefined();
  });

  it('merges neighbouring runs with the same formatting', () => {
    expect(serializeInline([{ marks: { bold: true }, text: 'a' }, { marks: { bold: true }, text: 'b' }])).toBe('**ab**');
  });
});
