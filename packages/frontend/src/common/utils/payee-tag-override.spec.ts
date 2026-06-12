import { describe, expect, it } from 'vitest';

import { applyPayeeTagOverride } from './payee-tag-override';

describe('applyPayeeTagOverride', () => {
  it('applies payee tags onto an empty selection', () => {
    expect(
      applyPayeeTagOverride({
        currentTagIds: [],
        lastAutoAppliedTagIds: [],
        payeeTagIds: ['a', 'b'],
      }),
    ).toEqual(['a', 'b']);
  });

  it('replaces previously auto-applied tags when the payee changes', () => {
    expect(
      applyPayeeTagOverride({
        currentTagIds: ['a', 'b'],
        lastAutoAppliedTagIds: ['a', 'b'],
        payeeTagIds: ['c'],
      }),
    ).toEqual(['c']);
  });

  it('keeps manually picked tags across payee changes', () => {
    expect(
      applyPayeeTagOverride({
        currentTagIds: ['manual', 'a'],
        lastAutoAppliedTagIds: ['a'],
        payeeTagIds: ['b'],
      }),
    ).toEqual(['manual', 'b']);
  });

  it('clears only the auto portion when the new payee has no tag rule', () => {
    expect(
      applyPayeeTagOverride({
        currentTagIds: ['manual', 'a', 'b'],
        lastAutoAppliedTagIds: ['a', 'b'],
        payeeTagIds: [],
      }),
    ).toEqual(['manual']);
  });

  it('does not resurrect an auto tag the user deselected', () => {
    // User deselected 'b' (still tracked as auto) — switching payees must not
    // treat its absence as a manual pick.
    expect(
      applyPayeeTagOverride({
        currentTagIds: ['a'],
        lastAutoAppliedTagIds: ['a', 'b'],
        payeeTagIds: ['c'],
      }),
    ).toEqual(['c']);
  });

  it('deduplicates when a payee tag is already manually selected', () => {
    expect(
      applyPayeeTagOverride({
        currentTagIds: ['a'],
        lastAutoAppliedTagIds: [],
        payeeTagIds: ['a', 'b'],
      }),
    ).toEqual(['a', 'b']);
  });

  it('treats saved tags as manual in edit mode (empty tracker merges only)', () => {
    expect(
      applyPayeeTagOverride({
        currentTagIds: ['saved1', 'saved2'],
        lastAutoAppliedTagIds: [],
        payeeTagIds: ['p1'],
      }),
    ).toEqual(['saved1', 'saved2', 'p1']);
  });
});
