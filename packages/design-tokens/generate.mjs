import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';

const directory = fileURLToPath(new URL('.', import.meta.url));
const source = await readFile(resolve(directory, 'src/index.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { themes } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function cssFor(theme) {
  const values = themes[theme];
  const declarations = Object.entries(values.semantic).map(([name, value]) => `  --${name}: ${value};`);
  for (const [name, option] of Object.entries(values.options)) {
    declarations.push(`  --option-${name}-bg: ${option.background};`);
    declarations.push(`  --option-${name}-text: ${option.text};`);
  }
  return `:root${theme === 'dark' ? '[data-theme="dark"]' : ''} {\n${declarations.join('\n')}\n}`;
}

const css = `/* Generated from src/index.ts by generate.mjs. Do not edit. */\n${cssFor('light')}\n\n${cssFor('dark')}\n`;
const output = resolve(directory, 'desktop.css');
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== css) throw new Error('desktop.css is out of date; run node packages/design-tokens/generate.mjs');
} else {
  await writeFile(output, css);
}
