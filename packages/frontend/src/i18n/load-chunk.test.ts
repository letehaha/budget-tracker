import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A locale JSON chunk that resolves to a module carrying no message content —
// what a stale or truncated asset response looks like to the dynamic import.
vi.mock('./locales/chunks/en/layout.json', () => ({}));

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

import { captureException } from '@/lib/sentry';

import { loadChunks } from './index';

describe('loadChunk with a module that carries no messages', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(captureException).mockClear();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not throw, so one bad chunk cannot break a route transition', async () => {
    await expect(loadChunks({ locale: 'en', chunks: ['layout'] })).resolves.toBeUndefined();
  });

  it('reports the failure with a message naming the chunk', async () => {
    await loadChunks({ locale: 'en', chunks: ['layout'] });

    expect(captureException).toHaveBeenCalledTimes(1);
    const { error, context } = vi.mocked(captureException).mock.calls[0]![0] as {
      error: Error;
      context: Record<string, unknown>;
    };
    expect(error.message).toContain('layout');
    expect(context).toEqual({ chunk: 'layout', locale: 'en' });
  });

  it('leaves the chunk unloaded so a later attempt retries instead of serving raw keys', async () => {
    await loadChunks({ locale: 'en', chunks: ['layout'] });
    await loadChunks({ locale: 'en', chunks: ['layout'] });

    // A chunk recorded as loaded would short-circuit the second call before the loader runs.
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
