import { useEffect, useRef, useState } from 'react';
import { Code2 } from 'lucide-react';
import type { Locale } from '../app/i18n';
import { formatFrontmatterBlock, parseFrontmatterYaml, splitFrontmatterBlock } from '../../shared/page-frontmatter';
import { applyFrontmatterEntries, propertiesToFrontmatterEntries } from './page-frontmatter-sync';
import type { PageProperty } from './page-properties';

/**
 * A raw-source view of a page's properties as a `---` delimited YAML block —
 * the same stored values `PageProperties` edits, never a second store.
 * Editing here writes back through `onChange`; editing the property panel
 * regenerates the text shown here.
 */
export function PageFrontmatter({ locale, onChange, properties: propertiesProp }: Readonly<{ locale: Locale; onChange: (properties: readonly PageProperty[]) => void; properties?: readonly PageProperty[] }>) {
  const ar = locale === 'ar';
  const properties = propertiesProp ?? [];
  const entries = propertiesToFrontmatterEntries(properties);
  const [open, setOpen] = useState(() => entries.length > 0);
  const [draft, setDraft] = useState(() => formatFrontmatterBlock(entries));
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);

  useEffect(() => {
    if (editing.current) { editing.current = false; return; }
    setDraft(formatFrontmatterBlock(propertiesToFrontmatterEntries(propertiesProp ?? [])));
    setError(null);
  }, [propertiesProp]);

  function handleChange(text: string) {
    setDraft(text);
    const split = splitFrontmatterBlock(text);
    if (!split) { setError(ar ? 'أضف "---" في بداية النص ونهايته.' : 'A frontmatter block needs a "---" line at the start and the end.'); return; }
    const parsed = parseFrontmatterYaml(split.yaml);
    if (parsed.error) { setError(parsed.error); return; }
    setError(null);
    editing.current = true;
    onChange(applyFrontmatterEntries(properties, parsed.entries));
  }

  if (!open) return <button type="button" className="page-frontmatter-toggle" onClick={() => setOpen(true)}>
    <Code2 size={13} />{ar ? 'عرض كـ YAML' : 'View as YAML'}
  </button>;

  return <section className="page-frontmatter" aria-label={ar ? 'خصائص الصفحة بصيغة YAML' : 'Page properties as YAML'}>
    <div className="page-frontmatter__bar">
      <span>{ar ? 'خصائص الصفحة (YAML)' : 'Page properties (YAML)'}</span>
      <button type="button" onClick={() => setOpen(false)}>{ar ? 'إخفاء' : 'Hide'}</button>
    </div>
    <textarea
      aria-label={ar ? 'مصدر YAML لخصائص الصفحة' : 'YAML source for page properties'}
      aria-invalid={error ? 'true' : undefined}
      className="page-frontmatter__source"
      spellCheck={false}
      value={draft}
      onChange={(event) => handleChange(event.target.value)}
    />
    {error && <p role="alert" className="page-frontmatter__error">{error}</p>}
  </section>;
}
