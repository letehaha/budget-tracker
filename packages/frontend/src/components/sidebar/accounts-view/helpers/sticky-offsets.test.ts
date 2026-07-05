import { describe, expect, it } from 'vitest';

import { BOTTOM_OFFSET_CLASSES, TOP_OFFSET_CLASSES, computeStickyOffsets } from './sticky-offsets';

const SECTIONS = ['bank', 'portfolios', 'ventures', 'cars', 'loans'] as const;

describe('computeStickyOffsets', () => {
  it('anchors the only visible section at top-0/bottom-0 and leaves hidden ones at the base', () => {
    const offsets = computeStickyOffsets({ allKeys: SECTIONS, visibleInOrder: ['bank'] });
    expect(offsets.bank).toEqual({ top: 'top-0', bottom: 'bottom-0' });
    expect(offsets.portfolios).toEqual({ top: 'top-0', bottom: 'bottom-0' });
    expect(offsets.loans).toEqual({ top: 'top-0', bottom: 'bottom-0' });
  });

  it('steps top by sections-above and bottom by sections-below when all are visible', () => {
    const offsets = computeStickyOffsets({ allKeys: SECTIONS, visibleInOrder: SECTIONS });
    expect(offsets.bank.top).toBe('top-0');
    expect(offsets.portfolios).toEqual({ top: 'top-9', bottom: 'bottom-27' });
    expect(offsets.ventures).toEqual({ top: 'top-18', bottom: 'bottom-18' });
    expect(offsets.cars).toEqual({ top: 'top-27', bottom: 'bottom-9' });
    expect(offsets.loans).toEqual({ top: 'top-36', bottom: 'bottom-0' });
  });

  it('collapses the ladder to the sections that remain when middle sections are hidden', () => {
    // ventures + loans hidden — bank, portfolios, cars are the visible ladder.
    const offsets = computeStickyOffsets({ allKeys: SECTIONS, visibleInOrder: ['bank', 'portfolios', 'cars'] });
    expect(offsets.portfolios).toEqual({ top: 'top-9', bottom: 'bottom-9' });
    expect(offsets.cars).toEqual({ top: 'top-18', bottom: 'bottom-0' });
    // hidden sections fall back to the base offset
    expect(offsets.ventures).toEqual({ top: 'top-0', bottom: 'bottom-0' });
    expect(offsets.loans).toEqual({ top: 'top-0', bottom: 'bottom-0' });
  });

  it('gives the second of two visible sections one top step and no bottom offset', () => {
    const offsets = computeStickyOffsets({ allKeys: SECTIONS, visibleInOrder: ['bank', 'loans'] });
    expect(offsets.loans).toEqual({ top: 'top-9', bottom: 'bottom-0' });
  });

  it('throws when more sections are visible than the offset ladder can place', () => {
    const overflow = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
    expect(overflow.length).toBeGreaterThan(TOP_OFFSET_CLASSES.length);
    expect(() => computeStickyOffsets({ allKeys: overflow, visibleInOrder: overflow })).toThrow();
  });

  it('keeps a step per section in each ladder so no two visible sections share an offset', () => {
    // Guards the invariant the throw protects: the ladders must cover every section.
    expect(TOP_OFFSET_CLASSES.length).toBeGreaterThanOrEqual(SECTIONS.length);
    expect(BOTTOM_OFFSET_CLASSES.length).toBeGreaterThanOrEqual(SECTIONS.length);
  });
});
