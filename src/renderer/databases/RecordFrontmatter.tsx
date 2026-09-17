import { Code2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import { formatFrontmatterBlock, parseFrontmatterYaml, splitFrontmatterBlock, type FrontmatterScalar } from '../../shared/page-frontmatter';
import {
  RECORD_FRONTMATTER_CREATABLE_TYPES,
  planRecordFrontmatterEntries,
  recordToFrontmatterEntries,
  type RecordFrontmatterOperation,
} from '../../shared/record-frontmatter';
import type { PropertyType } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';

type Props = Readonly<{
  locale: Locale;
  onCreateProperty: (key: string, type: (typeof RECORD_FRONTMATTER_CREATABLE_TYPES)[number], value: FrontmatterScalar) => Promise<string | null>;
  onWrite: (operation: RecordFrontmatterOperation) => Promise<string | null>;
  properties: Readonly<Record<string, unknown>>;
  schema: DatabaseSchema;
  title: string;
}>;

const typeLabel: Readonly<Record<(typeof RECORD_FRONTMATTER_CREATABLE_TYPES)[number], string>> = {
  text: 'Text', number: 'Number', select: 'Select', multi_select: 'Multi-select', status: 'Status', checkbox: 'Checkbox', date: 'Date', url: 'URL', email: 'Email', phone: 'Phone',
};

export function RecordFrontmatter({ locale, onCreateProperty, onWrite, properties, schema, title }: Props) {
  const ar = locale === 'ar';
  const source = useMemo(() => formatFrontmatterBlock(recordToFrontmatterEntries(schema.properties, { properties, title })), [properties, schema.properties, title]);
  const [open, setOpen] = useState(() => schema.properties.length > 0);
  const [draft, setDraft] = useState(source);
  const [parseError, setParseError] = useState<string | null>(null);
  const [runtimeErrors, setRuntimeErrors] = useState<Readonly<Record<string, string>>>({});
  const [selectedTypes, setSelectedTypes] = useState<Readonly<Record<string, PropertyType | ''>>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingApply = useRef<ReturnType<typeof setTimeout> | null>(null);
  const version = useRef(0);

  const parsed = splitFrontmatterBlock(draft);
  const parsedYaml = parsed ? parseFrontmatterYaml(parsed.yaml) : null;
  const plan = parsedYaml && !parsedYaml.error ? planRecordFrontmatterEntries(schema.properties, parsedYaml.entries) : null;

  useEffect(() => {
    if (document.activeElement === textarea.current) return;
    setDraft(source);
    setParseError(null);
    setRuntimeErrors({});
  }, [source]);

  useEffect(() => () => { if (pendingApply.current) clearTimeout(pendingApply.current); }, []);

  function change(text: string) {
    setDraft(text);
    setRuntimeErrors({});
    if (pendingApply.current) clearTimeout(pendingApply.current);
    const split = splitFrontmatterBlock(text);
    if (!split) {
      setParseError(ar ? 'أضف سطر "---" في بداية النص ونهايته.' : 'A frontmatter block needs a "---" line at the start and the end.');
      return;
    }
    const nextParsed = parseFrontmatterYaml(split.yaml);
    if (nextParsed.error) { setParseError(nextParsed.error); return; }
    setParseError(null);
    const nextPlan = planRecordFrontmatterEntries(schema.properties, nextParsed.entries);
    const nextVersion = ++version.current;
    pendingApply.current = setTimeout(() => {
      void (async () => {
        const failures: Record<string, string> = {};
        for (const operation of nextPlan.operations) {
          const error = await onWrite(operation);
          if (error) failures[operation.key] = error;
        }
        if (version.current === nextVersion) setRuntimeErrors(failures);
      })();
    }, 250);
  }

  async function create(key: string, value: FrontmatterScalar) {
    const type = selectedTypes[key];
    if (!type || !RECORD_FRONTMATTER_CREATABLE_TYPES.includes(type as (typeof RECORD_FRONTMATTER_CREATABLE_TYPES)[number])) return;
    setCreating(key);
    const error = await onCreateProperty(key, type as (typeof RECORD_FRONTMATTER_CREATABLE_TYPES)[number], value);
    setRuntimeErrors((current) => error ? { ...current, [key]: error } : Object.fromEntries(Object.entries(current).filter(([candidate]) => candidate !== key)));
    setCreating(null);
  }

  if (!open) return <button type="button" className="page-frontmatter-toggle" onClick={() => setOpen(true)}><Code2 size={13} />{ar ? 'عرض كـ YAML' : 'View as YAML'}</button>;

  return <section className="page-frontmatter record-frontmatter" aria-label={ar ? 'خصائص السجل بصيغة YAML' : 'Record properties as YAML'}>
    <div className="page-frontmatter__bar"><span>{ar ? 'خصائص السجل (YAML)' : 'Record properties (YAML)'}</span><button type="button" onClick={() => setOpen(false)}>{ar ? 'إخفاء' : 'Hide'}</button></div>
    <textarea
      ref={textarea}
      aria-label={ar ? 'مصدر YAML لخصائص السجل' : 'YAML source for record properties'}
      aria-invalid={parseError ? 'true' : undefined}
      className="page-frontmatter__source"
      spellCheck={false}
      value={draft}
      onBlur={() => { if (!parseError && Object.keys(runtimeErrors).length === 0) setDraft(source); }}
      onChange={(event) => change(event.target.value)}
    />
    {parseError && <p role="alert" className="page-frontmatter__error">{parseError}</p>}
    {plan?.issues.map((issue) => issue.kind === 'unknown'
      ? <div className="record-frontmatter__offer" key={issue.key}>
          <span>{issue.message}</span>
          <select aria-label={`Type for ${issue.key}`} value={selectedTypes[issue.key] ?? ''} onChange={(event) => setSelectedTypes((current) => ({ ...current, [issue.key]: event.target.value as PropertyType }))}>
            <option value="">{ar ? 'اختر النوع…' : 'Choose type…'}</option>
            {RECORD_FRONTMATTER_CREATABLE_TYPES.map((type) => <option key={type} value={type}>{typeLabel[type]}</option>)}
          </select>
          <button type="button" className="btn btn-sm" disabled={!selectedTypes[issue.key] || creating === issue.key} onClick={() => { void create(issue.key, issue.value); }}>{creating === issue.key ? (ar ? 'جارٍ الإنشاء…' : 'Creating…') : (ar ? 'إنشاء' : 'Create')}</button>
          {runtimeErrors[issue.key] && <span className="record-frontmatter__key-error" role="alert">{runtimeErrors[issue.key]}</span>}
        </div>
      : <p className="page-frontmatter__error" key={issue.key} role="alert">{issue.key}: {issue.message}</p>)}
    {plan?.operations.map((operation) => runtimeErrors[operation.key] ? <p className="page-frontmatter__error" key={operation.key} role="alert">{operation.key}: {runtimeErrors[operation.key]}</p> : null)}
  </section>;
}
