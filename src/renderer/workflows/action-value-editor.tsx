import { scalarText } from '../../shared/scalar-text';
import type { WorkflowValue } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { Select } from '../ui/select';

export type ValueChoice = { label: string; value: WorkflowValue };
type Props = { value: unknown; onChange: (value: WorkflowValue) => void; choices: ValueChoice[]; locale: Locale; expression?: boolean };

export function ActionValueEditor({ value, onChange, choices, locale, expression = true }: Props) {
  const ar = locale === 'ar';
  const ref = value && typeof value === 'object' && 'source' in value ? value as WorkflowValue : { source: 'literal' as const, value: value ?? '' };
  const match = choices.findIndex((choice) => JSON.stringify(choice.value) === JSON.stringify(ref));
  const mode = match >= 0 ? scalarText(match) : ref.source === 'expression' ? 'expression' : ref.source === 'literal' ? 'literal' : 'broken';
  return <div className="action-value">
    <Select aria-label={ar ? 'مصدر القيمة' : 'Value source'} value={mode} onChange={(e) => {
      if (e.target.value === 'literal') onChange({ source: 'literal', value: '' });
      else if (e.target.value === 'expression') onChange({ source: 'expression', expression: '', bindings: {} });
      else if (choices[Number(e.target.value)]) onChange(choices[Number(e.target.value)]!.value);
    }}>
      <option value="literal">{ar ? 'قيمة ثابتة' : 'Fixed value'}</option>
      {expression && <option value="expression">{ar ? 'حساب' : 'Calculation'}</option>}
      {mode === 'broken' && <option value="broken">{ar ? 'مرجع غير متاح' : 'Unavailable reference'}</option>}
      {choices.map((choice, index) => <option key={index} value={index}>{choice.label}</option>)}
    </Select>
    {ref.source === 'literal' && <><Select aria-label={ar ? 'نوع القيمة' : 'Value type'} value={typeof ref.value} onChange={(e) => onChange({ source: 'literal', value: e.target.value === 'number' ? 0 : e.target.value === 'boolean' ? false : '' })}><option value="string">{ar ? 'نص' : 'Text'}</option><option value="number">{ar ? 'رقم' : 'Number'}</option><option value="boolean">{ar ? 'منطقي' : 'Boolean'}</option></Select>{typeof ref.value === 'boolean' ? <input aria-label={ar ? 'القيمة' : 'Value'} type="checkbox" checked={ref.value} onChange={(e) => onChange({ source: 'literal', value: e.target.checked })} /> : <input aria-label={ar ? 'القيمة' : 'Value'} type={typeof ref.value === 'number' ? 'number' : 'text'} step="any" value={scalarText(ref.value ?? '')} onChange={(e) => onChange({ source: 'literal', value: typeof ref.value === 'number' ? Number(e.target.value) : e.target.value })} />}</>}
    {ref.source === 'expression' && <div className="action-expression">
      <input aria-label={ar ? 'التعبير' : 'Expression'} placeholder="v1 * v2" value={ref.expression} onChange={(e) => onChange({ ...ref, expression: e.target.value })} />
      {Object.entries(ref.bindings).map(([key, binding]) => <div className="action-row" key={key}><span>{key}</span><ActionValueEditor value={binding} onChange={(next) => onChange({ ...ref, bindings: { ...ref.bindings, [key]: next } })} choices={choices} locale={locale} expression={false} /><button type="button" aria-label={ar ? 'حذف متغير' : 'Remove binding'} onClick={() => onChange({ ...ref, bindings: Object.fromEntries(Object.entries(ref.bindings).filter(([name]) => name !== key)) })}>×</button></div>)}
      <button type="button" onClick={() => { let index = 1; while (Object.hasOwn(ref.bindings, `v${index}`)) index++; onChange({ ...ref, bindings: { ...ref.bindings, [`v${index}`]: { source: 'literal', value: 0 } } }); }}>{ar ? '+ متغير للحساب' : '+ Add value to calculation'}</button>
    </div>}
  </div>;
}
