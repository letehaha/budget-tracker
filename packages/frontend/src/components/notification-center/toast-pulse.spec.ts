import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PULSE_DURATION_MS, findLiveToast, pulseToast } from './toast-pulse';

const LIVE_ID = '2:Transaction created:';

const createToast = ({ id, removed }: { id?: string; removed?: boolean } = {}) => {
  const element = document.createElement('li');
  element.setAttribute('data-sonner-toast', '');
  if (id !== undefined) element.setAttribute('data-testid', id);
  if (removed) element.setAttribute('data-removed', 'true');
  document.body.append(element);

  return element;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('finding the toast to pulse', () => {
  test('finds a mounted toast by its id', () => {
    createToast({ id: 'other' });
    const target = createToast({ id: LIVE_ID });

    expect(findLiveToast({ id: LIVE_ID })).toBe(target);
  });

  test('returns null when no toast carries the id', () => {
    createToast({ id: 'other' });

    expect(findLiveToast({ id: LIVE_ID })).toBeNull();
  });

  test('returns null for a toast that is leaving', () => {
    createToast({ id: LIVE_ID, removed: true });

    expect(findLiveToast({ id: LIVE_ID })).toBeNull();
  });

  test('finds a live toast, which renders data-removed as false', () => {
    const target = createToast({ id: LIVE_ID });
    target.setAttribute('data-removed', 'false');

    expect(findLiveToast({ id: LIVE_ID })).toBe(target);
  });

  test('matches the whole id rather than a prefix of it', () => {
    createToast({ id: `${LIVE_ID}extra` });

    expect(findLiveToast({ id: LIVE_ID })).toBeNull();
  });

  test('ignores elements that are not toasts', () => {
    const stray = document.createElement('div');
    stray.setAttribute('data-testid', LIVE_ID);
    document.body.append(stray);

    expect(findLiveToast({ id: LIVE_ID })).toBeNull();
  });
});

describe('pulsing a toast', () => {
  test('marks the toast for the pulse', () => {
    const element = createToast({ id: LIVE_ID });

    pulseToast({ element });

    expect(element.getAttribute('data-pulse')).toBe('true');
  });

  test('drops the mark once the animation is over', () => {
    const element = createToast({ id: LIVE_ID });

    pulseToast({ element });
    vi.advanceTimersByTime(PULSE_DURATION_MS - 1);
    expect(element.getAttribute('data-pulse')).toBe('true');

    vi.advanceTimersByTime(1);
    expect(element.hasAttribute('data-pulse')).toBe(false);
  });

  test('restarts the animation by removing the mark before re-adding it', () => {
    const element = createToast({ id: LIVE_ID });
    pulseToast({ element });

    const removeAttribute = vi.spyOn(element, 'removeAttribute');
    const readRect = vi.spyOn(element, 'getBoundingClientRect');
    const setAttribute = vi.spyOn(element, 'setAttribute');

    pulseToast({ element });

    expect(removeAttribute).toHaveBeenCalledWith('data-pulse');
    expect(setAttribute).toHaveBeenCalledWith('data-pulse', 'true');
    expect(removeAttribute.mock.invocationCallOrder[0]).toBeLessThan(readRect.mock.invocationCallOrder[0]!);
    expect(readRect.mock.invocationCallOrder[0]).toBeLessThan(setAttribute.mock.invocationCallOrder[0]!);
    expect(element.getAttribute('data-pulse')).toBe('true');
  });

  test('a second pulse pushes the cleanup back instead of stripping the mark early', () => {
    const element = createToast({ id: LIVE_ID });

    pulseToast({ element });
    vi.advanceTimersByTime(PULSE_DURATION_MS - 50);
    pulseToast({ element });

    vi.advanceTimersByTime(PULSE_DURATION_MS - 1);
    expect(element.getAttribute('data-pulse')).toBe('true');

    vi.advanceTimersByTime(1);
    expect(element.hasAttribute('data-pulse')).toBe(false);
  });

  test('survives a toast that unmounts mid-pulse', () => {
    const element = createToast({ id: LIVE_ID });

    pulseToast({ element });
    element.remove();

    expect(() => vi.advanceTimersByTime(PULSE_DURATION_MS)).not.toThrow();
    expect(element.hasAttribute('data-pulse')).toBe(false);
  });

  test('pulses an element that was never mounted', () => {
    const element = document.createElement('li');

    expect(() => pulseToast({ element })).not.toThrow();
    expect(element.getAttribute('data-pulse')).toBe('true');
  });
});
