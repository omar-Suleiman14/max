import { describe, expect, it } from 'vitest';

import { buildDraftRequest, diffDefinitions, mapPropertiesToFields } from './chaos-field-mapping';
import { parseChaosSummary, responseCountDisplay, validateChaosDraftRequest } from './chaos-integration-contract';

describe('Chaos field mapping', () => {
  it('maps supported properties and explains the rest', () => {
    const { fields, unsupported } = mapPropertiesToFields([
      { id: 'p1', name: 'Name', type: 'title' },
      { id: 'p2', name: 'Stage', options: [{ label: 'New' }, { label: 'Won' }], type: 'select' },
      { id: 'p3', name: 'Owner', type: 'user' },
      { id: 'p4', name: 'Total', type: 'formula' },
    ]);
    expect(fields.map((field) => [field.id, field.type])).toEqual([['name', 'text'], ['stage', 'choice']]);
    expect(fields[0]!.required).toBe(true);
    expect(unsupported.map((item) => item.name)).toEqual(['Owner', 'Total']);
  });

  it('drops quiz-only keys from form drafts', () => {
    const request = buildDraftRequest('form', { fields: [{ correctAnswer: 'A', id: 'q', label: 'Pick', options: ['A', 'B', ' '], points: 3, type: 'choice' }], title: ' Survey ' }, 'Page');
    expect(request).toEqual({ fields: [{ id: 'q', label: 'Pick', options: ['A', 'B'], type: 'choice' }], kind: 'form', source: { label: 'Page' }, title: 'Survey' });
    expect(validateChaosDraftRequest(request)).toEqual([]);
  });

  it('describes changes for the update preview', () => {
    const before = { fields: [{ id: 'a', label: 'A', type: 'text' as const }, { id: 'b', label: 'B', type: 'text' as const }], title: 'T' };
    const after = { fields: [{ id: 'a', label: 'A!', type: 'text' as const }, { id: 'c', label: 'C', type: 'text' as const }], title: 'T' };
    expect(diffDefinitions(before, after).map((change) => change.kind)).toEqual(['changed', 'added', 'removed']);
  });
});

describe('Chaos summaries', () => {
  it('never shows a count below the group size and ignores unexpected fields', () => {
    const summary = parseChaosSummary({
      averageScorePercent: null, completedCount: 3, itemId: 'form_1', kind: 'form', minimumGroupSize: 5,
      questions: [{ answeredCount: 3, fieldId: 'q', label: 'Q', type: 'text', respondentEmail: 'x@example.com' }],
      responseCount: 3, status: 'live', suppressed: false, updatedAt: 1, respondents: ['x@example.com'],
    });
    expect(responseCountDisplay(summary)).toEqual({ kind: 'suppressed', minimumGroupSize: 5 });
    expect(JSON.stringify(summary)).not.toContain('example.com');
  });
});
