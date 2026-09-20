import { describe, expect, it } from 'vitest';

import { type SelectPinnedGroup, buildSelectSections } from './select-sections';

const pinnedGroup: SelectPinnedGroup<string> = {
  isPinned: (code) => ['EUR', 'USD'].includes(code),
  pinnedLabel: 'Yours',
  restLabel: 'Other',
};

describe('buildSelectSections', () => {
  it('returns one unlabelled section without a pinned group', () => {
    expect(buildSelectSections({ items: ['AED', 'EUR'] })).toEqual([{ label: null, items: ['AED', 'EUR'] }]);
  });

  it('splits pinned items out so no item appears in both sections', () => {
    const sections = buildSelectSections({ items: ['AED', 'EUR', 'GEL', 'USD'], pinnedGroup });

    expect(sections).toEqual([
      { label: 'Yours', items: ['EUR', 'USD'] },
      { label: 'Other', items: ['AED', 'GEL'] },
    ]);
  });

  it('stays ungrouped when nothing or everything is pinned', () => {
    expect(buildSelectSections({ items: ['AED', 'GEL'], pinnedGroup })).toEqual([
      { label: null, items: ['AED', 'GEL'] },
    ]);
    expect(buildSelectSections({ items: ['EUR', 'USD'], pinnedGroup })).toEqual([
      { label: null, items: ['EUR', 'USD'] },
    ]);
  });
});
