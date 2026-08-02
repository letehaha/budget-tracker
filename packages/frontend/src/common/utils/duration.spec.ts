import { formatCountdown, getCoarseDuration } from '@/common/utils/duration';
import { describe, expect, it } from 'vitest';

const seconds = (value: number) => value * 1000;
const minutes = (value: number) => value * 60 * 1000;
const hours = (value: number) => value * 60 * 60 * 1000;

describe('formatCountdown', () => {
  it('renders minutes and zero-padded seconds', () => {
    expect(formatCountdown({ ms: minutes(14) + seconds(7) })).toBe('14:07');
    expect(formatCountdown({ ms: minutes(15) })).toBe('15:00');
    expect(formatCountdown({ ms: seconds(9) })).toBe('0:09');
  });

  it('floors partial seconds so 0:00 only shows when the time is gone', () => {
    expect(formatCountdown({ ms: seconds(1) + 999 })).toBe('0:01');
    expect(formatCountdown({ ms: 999 })).toBe('0:00');
  });

  it('clamps negative durations to zero', () => {
    expect(formatCountdown({ ms: 0 })).toBe('0:00');
    expect(formatCountdown({ ms: -5000 })).toBe('0:00');
  });

  it('widens to h:mm:ss past an hour', () => {
    expect(formatCountdown({ ms: hours(1) })).toBe('1:00:00');
    expect(formatCountdown({ ms: hours(3) + minutes(59) + seconds(59) })).toBe('3:59:59');
    expect(formatCountdown({ ms: hours(1) + seconds(5) })).toBe('1:00:05');
  });
});

describe('getCoarseDuration', () => {
  it('reports seconds below a minute', () => {
    expect(getCoarseDuration({ ms: seconds(45) })).toEqual({ unit: 'seconds', value: 45 });
    expect(getCoarseDuration({ ms: 0 })).toEqual({ unit: 'seconds', value: 0 });
  });

  it('reports rounded minutes below an hour', () => {
    expect(getCoarseDuration({ ms: minutes(15) })).toEqual({ unit: 'minutes', value: 15 });
    expect(getCoarseDuration({ ms: minutes(2) + seconds(40) })).toEqual({ unit: 'minutes', value: 3 });
  });

  it('reports rounded hours past an hour', () => {
    expect(getCoarseDuration({ ms: hours(4) })).toEqual({ unit: 'hours', value: 4 });
    expect(getCoarseDuration({ ms: hours(2) + minutes(20) })).toEqual({ unit: 'hours', value: 2 });
  });

  it('promotes to the next unit instead of reporting 60 of the smaller one', () => {
    expect(getCoarseDuration({ ms: seconds(59) + 600 })).toEqual({ unit: 'minutes', value: 1 });
    expect(getCoarseDuration({ ms: hours(1) - 1 })).toEqual({ unit: 'hours', value: 1 });
  });

  it('clamps negative durations to zero', () => {
    expect(getCoarseDuration({ ms: -1000 })).toEqual({ unit: 'seconds', value: 0 });
  });
});
