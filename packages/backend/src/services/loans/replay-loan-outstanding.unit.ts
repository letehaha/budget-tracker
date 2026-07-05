import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { replayLoanOutstanding } from './replay-loan-outstanding';

interface FakeLeg {
  time: string;
  cents: number;
}

const replay = ({ legs, anchorDate, opening }: { legs: FakeLeg[]; anchorDate: string; opening: number }) =>
  replayLoanOutstanding({
    legs,
    anchorDate,
    openingBalance: Money.fromCents(opening),
    pickCents: ({ leg }) => leg.cents,
  }).map((point) => ({ date: point.date, cents: point.balance.toCents() }));

describe('replayLoanOutstanding', () => {
  it('emits a lone anchor point when there are no legs', () => {
    expect(replay({ legs: [], anchorDate: '2024-01-01', opening: -1000 })).toEqual([
      { date: '2024-01-01', cents: -1000 },
    ]);
  });

  it('groups multiple legs on the same UTC day into one cumulative point', () => {
    const legs: FakeLeg[] = [
      { time: '2024-01-10T09:00:00Z', cents: 10000 },
      { time: '2024-01-10T20:00:00Z', cents: 20000 },
    ];
    expect(replay({ legs, anchorDate: '2024-01-01', opening: -100000 })).toEqual([
      { date: '2024-01-01', cents: -100000 },
      { date: '2024-01-10', cents: -70000 },
    ]);
  });

  it('emits one point per distinct day in chronological order', () => {
    const legs: FakeLeg[] = [
      { time: '2024-02-01T00:00:00Z', cents: 30000 },
      { time: '2024-01-15T00:00:00Z', cents: 20000 },
    ];
    expect(replay({ legs, anchorDate: '2024-01-01', opening: -100000 })).toEqual([
      { date: '2024-01-01', cents: -100000 },
      { date: '2024-01-15', cents: -80000 },
      { date: '2024-02-01', cents: -50000 },
    ]);
  });

  it('folds a leg dated before the anchor onto the anchor day (no separate opening point)', () => {
    const legs: FakeLeg[] = [{ time: '2023-12-20T00:00:00Z', cents: 40000 }];
    expect(replay({ legs, anchorDate: '2024-01-01', opening: -100000 })).toEqual([
      { date: '2024-01-01', cents: -60000 },
    ]);
  });

  it('folds a same-day (anchor-boundary) leg into the anchor point', () => {
    const legs: FakeLeg[] = [{ time: '2024-01-01T12:00:00Z', cents: 25000 }];
    expect(replay({ legs, anchorDate: '2024-01-01', opening: -100000 })).toEqual([
      { date: '2024-01-01', cents: -75000 },
    ]);
  });

  it('floors an overpaying batch at zero instead of going into credit', () => {
    const legs: FakeLeg[] = [{ time: '2024-01-05T00:00:00Z', cents: 50000 }];
    expect(replay({ legs, anchorDate: '2024-01-01', opening: -10000 })).toEqual([
      { date: '2024-01-01', cents: -10000 },
      { date: '2024-01-05', cents: 0 },
    ]);
  });
});
