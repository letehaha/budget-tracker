import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from './download-file';

describe('downloadBlob', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  const FAKE_URL = 'blob:fake-url';

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(FAKE_URL);
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    appendChildSpy = vi.spyOn(document.body, 'appendChild');
    removeChildSpy = vi.spyOn(document.body, 'removeChild');
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    createElementSpy = vi.spyOn(document, 'createElement');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an object URL, clicks an anchor with the requested filename, and removes the anchor', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });

    downloadBlob({ blob, filename: 'report.csv' });

    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
    expect(createElementSpy).toHaveBeenCalledWith('a');
    const anchor = createElementSpy.mock.results[0]!.value as HTMLAnchorElement;
    expect(anchor.href).toContain(FAKE_URL);
    expect(anchor.download).toBe('report.csv');
    expect(appendChildSpy).toHaveBeenCalledWith(anchor);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledWith(anchor);
  });

  it('defers URL.revokeObjectURL past the current tick so async browsers can capture the download', () => {
    downloadBlob({ blob: new Blob(['x']), filename: 'x.bin' });

    // Same tick: revoke MUST NOT have fired yet – Safari starts the download
    // asynchronously and would cancel it if we revoked synchronously.
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(FAKE_URL);
  });

  it('revokes immediately and rethrows if the click step itself throws', () => {
    clickSpy.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => downloadBlob({ blob: new Blob(['x']), filename: 'x.bin' })).toThrow('boom');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(FAKE_URL);
    // Anchor was appended; the finally branch removes it even on click failure.
    expect(removeChildSpy).toHaveBeenCalled();
  });
});
