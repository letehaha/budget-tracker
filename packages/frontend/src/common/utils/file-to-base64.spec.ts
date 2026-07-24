import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fileToBase64 } from './file-to-base64';

/**
 * Outcome the mock FileReader delivers for the next read. `readAsDataURL` in jsdom
 * always yields a comma-prefixed base64 string with no error, so a controllable
 * fake is the only way to exercise the no-comma, non-string, and onerror branches.
 */
type ReadOutcome = { kind: 'load'; result: unknown } | { kind: 'error'; error: Error | null };

let nextOutcome: ReadOutcome;

class MockFileReader {
  result: unknown = null;
  error: unknown = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(_blob: Blob): void {
    // Deliver asynchronously, like the real API, so the promise's handlers are wired.
    queueMicrotask(() => {
      if (nextOutcome.kind === 'load') {
        this.result = nextOutcome.result;
        this.onload?.();
      } else {
        this.error = nextOutcome.error;
        this.onerror?.();
      }
    });
  }
}

const makeFile = () => new File(['payload'], 'backup.zip', { type: 'application/zip' });

describe('fileToBase64', () => {
  beforeEach(() => {
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips the data-URL prefix and returns just the base64 payload', async () => {
    nextOutcome = { kind: 'load', result: 'data:application/zip;base64,QUJD' };
    await expect(fileToBase64({ file: makeFile() })).resolves.toBe('QUJD');
  });

  it('returns the whole string when there is no data-URL prefix (no comma)', async () => {
    nextOutcome = { kind: 'load', result: 'QUJD' };
    await expect(fileToBase64({ file: makeFile() })).resolves.toBe('QUJD');
  });

  it('rejects when reader.result is not a string', async () => {
    nextOutcome = { kind: 'load', result: new ArrayBuffer(4) };
    await expect(fileToBase64({ file: makeFile() })).rejects.toThrow('Failed to read file as base64');
  });

  it('rejects with the reader error on the onerror path', async () => {
    const err = new Error('boom');
    nextOutcome = { kind: 'error', error: err };
    await expect(fileToBase64({ file: makeFile() })).rejects.toBe(err);
  });

  it('rejects with a fallback error when the reader exposes no error object', async () => {
    nextOutcome = { kind: 'error', error: null };
    await expect(fileToBase64({ file: makeFile() })).rejects.toThrow('Failed to read file');
  });
});
