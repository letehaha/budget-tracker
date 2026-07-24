import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { addBreadcrumb, captureException } from '@/lib/sentry';

const captureExceptionMock = vi.mocked(captureException);
const addBreadcrumbMock = vi.mocked(addBreadcrumb);

const makeResponse = ({
  ok = true,
  status = 200,
  statusText = 'OK',
  json,
  contentType = 'application/json',
}: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  contentType?: string;
}): Response =>
  ({
    ok,
    status,
    statusText,
    json: json ?? (() => Promise.resolve({})),
    headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
  }) as unknown as Response;

const importModule = async () => {
  vi.resetModules();
  return import('./use-version-check');
};

describe('fetchRemoteVersion', () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null + breadcrumb (no exception) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')));
    const { fetchRemoteVersion } = await importModule();

    const result = await fetchRemoteVersion();

    expect(result).toBeNull();
    expect(addBreadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'version-check', level: 'info' }),
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('returns null + breadcrumb (no exception) on a 404 — endpoint not served here', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ ok: false, status: 404, statusText: 'Not Found' })),
    );
    const { fetchRemoteVersion } = await importModule();

    const result = await fetchRemoteVersion();

    expect(result).toBeNull();
    expect(addBreadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'version-check', level: 'info' }),
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('returns null + captures exception on a non-404 non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ ok: false, status: 502, statusText: 'Bad Gateway' })),
    );
    const { fetchRemoteVersion } = await importModule();

    const result = await fetchRemoteVersion();

    expect(result).toBeNull();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ status: 502, statusText: 'Bad Gateway' }),
      }),
    );
  });

  it('returns null + captures exception when JSON parsing fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          json: () => Promise.reject(new SyntaxError('Unexpected token <')),
          contentType: 'text/html',
        }),
      ),
    );
    const { fetchRemoteVersion } = await importModule();

    const result = await fetchRemoteVersion();

    expect(result).toBeNull();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ contentType: 'text/html' }),
      }),
    );
  });

  it('returns null + captures exception when payload is missing the version field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ json: () => Promise.resolve({}) })));
    const { fetchRemoteVersion } = await importModule();

    expect(await fetchRemoteVersion()).toBeNull();
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it('returns null + captures exception when version is not a string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ json: () => Promise.resolve({ version: 42 }) })));
    const { fetchRemoteVersion } = await importModule();

    expect(await fetchRemoteVersion()).toBeNull();
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it('returns the version string on a valid payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ json: () => Promise.resolve({ version: 'abc123' }) })),
    );
    const { fetchRemoteVersion } = await importModule();

    expect(await fetchRemoteVersion()).toBe('abc123');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});

describe('checkVersion', () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('skips the fetch when the document is hidden', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { checkVersion } = await importModule();

    await checkVersion();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT flip isStale when the remote version equals the current build', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ json: () => Promise.resolve({ version: __APP_VERSION__ }) })),
    );
    const { checkVersion, useVersionCheck } = await importModule();

    await checkVersion();

    expect(useVersionCheck().isStale.value).toBe(false);
  });

  it('flips isStale when the remote version differs from the current build', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ json: () => Promise.resolve({ version: `${__APP_VERSION__}-next` }) })),
    );
    const { checkVersion, useVersionCheck } = await importModule();

    await checkVersion();

    expect(useVersionCheck().isStale.value).toBe(true);
  });
});
