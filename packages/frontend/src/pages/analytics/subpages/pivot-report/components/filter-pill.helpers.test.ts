import { describe, expect, it } from 'vitest';

import { filterPillClass } from './filter-pill.helpers';

describe('filterPillClass', () => {
  it('keeps the compact pill height on md screens for both states', () => {
    for (const active of [true, false]) {
      const result = filterPillClass({ active });
      expect(result).toContain('h-8');
      expect(result).toContain('md:h-8');
      expect(result).toContain('md:min-h-8');
    }
  });

  it('switches border and background by active state', () => {
    const activeClass = filterPillClass({ active: true });
    expect(activeClass).toContain('border-primary/60');
    expect(activeClass).toContain('bg-primary/10');

    const inactiveClass = filterPillClass({ active: false });
    expect(inactiveClass).toContain('border-border');
    expect(inactiveClass).toContain('text-muted-foreground');
  });
});
