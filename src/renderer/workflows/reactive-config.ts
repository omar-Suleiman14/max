import type { WorkflowInputField, WorkflowInputSchema } from '../../shared/workflow-contract';
export function hasReactiveFields(schema: WorkflowInputSchema): boolean {
  const fields = (items: readonly WorkflowInputField[]): boolean => items.some(f => f.derived || f.visibleWhen || f.requiredWhen || f.disabledWhen || f.pickerFilter || f.displayPropertyIds || f.allowCreate || (f.fields && fields(f.fields)));
  return !!(schema.rules?.length || schema.summary?.length || fields(schema.fields));
}
