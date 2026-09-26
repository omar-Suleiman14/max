import type { WorkflowInputField, WorkflowValue } from '../../shared/workflow-contract';
import type { WorkspaceProperty } from '../../shared/property-contract';
import type { ValueChoice } from './action-value-editor';
import { inputKey } from './input-defaults';
export function formChoices(fields: readonly WorkflowInputField[], schemas: Record<string, readonly WorkspaceProperty[]>, child = false, locale: 'ar' | 'en' = 'en'): ValueChoice[] {
  return fields.flatMap((f, i) => {
    const value: WorkflowValue = child ? { source: 'item', field: inputKey(f, i) } : { source: 'variable', key: inputKey(f, i) };
    return [{ label: (child ? (locale === 'ar' ? 'الصف · ' : 'Row · ') : '') + f.label, value }, ...(f.type === 'record' ? (schemas[f.databaseId ?? ''] ?? []).map(p => ({ label: f.label + ' · ' + p.name, value: { source: 'property' as const, record: value, databaseId: f.databaseId!, propertyId: p.id } })) : [])];
  });
}
