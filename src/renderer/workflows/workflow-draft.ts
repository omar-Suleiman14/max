import type { WorkflowStepType, WorkflowValue, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';

const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });

/** Every step type the engine runs, in the order the palette offers them. */
export const stepTypes: WorkflowStepType[] = ['FIND_RECORD', 'COMPUTE', 'CREATE_RECORD', 'UPDATE_RECORD', 'FOR_EACH', 'SUM', 'VALIDATE', 'RETURN_RESULT'];
const en = ['Find record', 'Calculate value', 'Create record', 'Update record', 'For each row', 'Sum rows', 'Check a condition', 'Show a result'];
const arabic = ['بحث عن سجل', 'حساب قيمة', 'إنشاء سجل', 'تحديث سجل', 'لكل صف', 'مجموع الصفوف', 'التحقق من شرط', 'عرض نتيجة'];

export const stepLabels = (ar: boolean): readonly string[] => (ar ? arabic : en);

/** The starting configuration when a step becomes a given type. */
export function configFor(type: WorkflowStepType, previous: Readonly<Record<string, unknown>>, collectionKey: string): Record<string, unknown> {
  if (type === 'VALIDATE') return { condition: literal(true), errorMessage: '' };
  if (type === 'RETURN_RESULT') return { outputs: [] };
  return { outputVariable: previous.outputVariable ?? crypto.randomUUID(), ...(['FOR_EACH', 'SUM'].includes(type) ? { collection: variable(collectionKey), ...(type === 'FOR_EACH' ? { steps: [], yield: { source: 'item' } } : { value: literal(0) }) } : {}) };
}

/** The parts of a draft the JSON view shows and accepts. */
export function draftToJson(draft: WorkspaceWorkflowDraft): string {
  return JSON.stringify({ enabled: draft.enabled !== false, icon: draft.icon ?? '', inputSchema: draft.inputSchema, name: draft.name, steps: draft.steps }, null, 2);
}

export function draftFromJson(text: string, base: WorkspaceWorkflowDraft, ar: boolean): WorkspaceWorkflowDraft | string {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return ar ? 'هذا ليس JSON صالحاً.' : 'This is not valid JSON.'; }
  const value = parsed as Partial<WorkspaceWorkflowDraft> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ar ? 'يجب أن يكون الإجراء كائناً.' : 'The action must be an object.';
  if (typeof value.name !== 'string') return ar ? 'الاسم مطلوب.' : 'name must be text.';
  if (!value.inputSchema || !Array.isArray(value.inputSchema.fields)) return ar ? 'inputSchema.fields يجب أن تكون قائمة.' : 'inputSchema.fields must be a list.';
  if (!Array.isArray(value.steps) || value.steps.some((step) => !step || typeof step !== 'object' || Array.isArray(step) || !stepTypes.includes((step as { type: WorkflowStepType }).type) || !(step as { config?: unknown }).config || typeof (step as { config?: unknown }).config !== 'object' || Array.isArray((step as { config?: unknown }).config))) return ar ? 'كل خطوة تحتاج type معروفاً و config.' : 'Every step needs a known type and a config object.';
  return { ...base, enabled: value.enabled !== false, icon: typeof value.icon === 'string' ? value.icon : base.icon, inputSchema: value.inputSchema, name: value.name, steps: value.steps };
}
