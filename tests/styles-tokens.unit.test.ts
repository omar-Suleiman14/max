import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { themes } from '../packages/design-tokens/src/index';

const root = fileURLToPath(new URL('..', import.meta.url));
const renderer = fileURLToPath(new URL('../src/renderer/', import.meta.url));
const desktop = readFileSync(fileURLToPath(new URL('../packages/design-tokens/desktop.css', import.meta.url)), 'utf8');

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}

const styles = cssFiles(renderer).map((path) => readFileSync(path, 'utf8')).join('\n');
const allStyles = `${desktop}\n${readFileSync(`${renderer}/styles.css`, 'utf8')}`;

function declarations(css: string): Map<string, string> {
  return new Map([...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [match[1], match[2].trim()]));
}

/**
 * A custom property the stylesheet reads but never sets, and reads without a
 * fallback, is invisible: the browser resolves it to nothing and drops the whole
 * declaration with no error. That is how `var(--primary)` left calendar record
 * pills as white text on a white cell and the today badge unreadable, and how
 * `var(--foreground)` left eight database rules with no colour at all.
 *
 * A usage that supplies a fallback is fine, and so is a property the renderer
 * sets from script, as long as every read of it names a fallback.
 */
describe('stylesheet custom properties', () => {
  it('keeps generated CSS in sync with the typed token source', () => {
    expect(() => execFileSync(process.execPath, ['packages/design-tokens/generate.mjs', '--check'], { cwd: root })).not.toThrow();
  });

  it('covers desktop semantic and option references in both themes', () => {
    const [lightCss, darkCss] = desktop.split(':root[data-theme="dark"]');
    const light = declarations(lightCss);
    const dark = declarations(darkCss);
    expect(Object.keys(themes.light.semantic).sort()).toEqual(Object.keys(themes.dark.semantic).sort());
    expect(Object.keys(themes.light.options).sort()).toEqual(Object.keys(themes.dark.options).sort());
    for (const [name, value] of Object.entries(themes.light.semantic)) {
      expect(light.get(`--${name}`)).toBe(value);
      expect(dark.get(`--${name}`)).toBe(themes.dark.semantic[name as keyof typeof themes.dark.semantic]);
    }
    for (const [name, option] of Object.entries(themes.light.options)) {
      const darkOption = themes.dark.options[name as keyof typeof themes.dark.options];
      expect(light.get(`--option-${name}-bg`)).toBe(option.background);
      expect(light.get(`--option-${name}-text`)).toBe(option.text);
      expect(dark.get(`--option-${name}-bg`)).toBe(darkOption.background);
      expect(dark.get(`--option-${name}-text`)).toBe(darkOption.text);
    }
    const tokenNames = new Set(light.keys());
    const sharedReads = [...styles.matchAll(/var\(\s*(--(?:option-[a-z0-9-]+|accent(?:-[a-z0-9-]+)?|bg|canvas(?:-[a-z0-9-]+)?|card(?:-[a-z0-9-]+)?|danger(?:-[a-z0-9-]+)?|info|line(?:-[a-z0-9-]+)?|muted(?:-[a-z0-9-]+)?|overlay|purple|shadow-[a-z0-9-]+|sidebar|success|text(?:-[a-z0-9-]+)?|warning))\b/g)].map((match) => match[1]);
    expect([...new Set(sharedReads.filter((name) => !tokenNames.has(name)))].sort()).toEqual([]);
  });

  it('consumes generated values without duplicate desktop declarations', () => {
    const tokenNames = new Set(declarations(desktop).keys());
    const duplicates = [...styles.matchAll(/(?:^|[;{])\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]).filter((name) => tokenNames.has(name));
    expect(duplicates).toEqual([]);
    expect(readFileSync(`${renderer}/styles.css`, 'utf8')).toContain("@import url('../../packages/design-tokens/desktop.css');");
  });

  it('defines every custom property it reads without a fallback', () => {
    const defined = new Set([...allStyles.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
    const read = [...allStyles.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)].map((match) => match[1]);
    const missing = [...new Set(read.filter((name) => !defined.has(name)))].sort();

    expect(missing).toEqual([]);
  });
});
