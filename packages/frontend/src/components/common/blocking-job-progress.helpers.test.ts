import { describe, expect, it } from 'vitest';

import { checklistRows } from './blocking-job-progress.helpers';

const base = {
  orderedStepKeys: ['a', 'b'],
  stepLabelKeys: { a: 'label.a', b: 'label.b' },
  preparingLabelKey: 'label.preparing',
  finishingLabelKey: 'label.finishing',
};

const statuses = (rows: ReturnType<typeof checklistRows>) => rows.map((row) => row.status);

describe('checklistRows', () => {
  it('marks the preparing row current while queued', () => {
    expect(statuses(checklistRows({ ...base, state: 'preparing' }))).toEqual(['now', 'pending', 'pending', 'pending']);
  });

  it('marks earlier steps done and the running step current', () => {
    const rows = checklistRows({ ...base, state: 'running', currentStepKey: 'b' });
    expect(statuses(rows)).toEqual(['done', 'done', 'now', 'pending']);
    expect(rows[2]!.labelKey).toBe('label.b');
  });

  it('falls back to the preparing row for an unknown running step', () => {
    expect(statuses(checklistRows({ ...base, state: 'running', currentStepKey: 'zzz' }))).toEqual([
      'now',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('marks everything done except the finishing row when finishing', () => {
    expect(statuses(checklistRows({ ...base, state: 'finishing' }))).toEqual(['done', 'done', 'done', 'now']);
  });
});
