import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { asUser, provisionSecondUserWithBaseCurrency } from '@tests/helpers/share';
import { randomUUID } from 'node:crypto';

/**
 * Contract tests for the four Microsoft Money endpoints that need no `.mny`
 * file: rejected uploads, unknown upload ids, cross-user isolation and auth.
 * The import behaviour itself lives in `ms-money-execute-import.e2e.ts`, which
 * needs a real fixture and is skipped when none is present.
 */

/** A well-formed upload id that was never issued. */
const unknownUploadId = () => randomUUID();

/** Minimal mapping — the requests below never get far enough to use it. */
const someAccountMapping = { 'Some Account': { action: 'skip' as const } };

/** An empty cookie string sends no session, so the endpoint must answer 401. */
const withoutSession = <T>(fn: () => Promise<T>) => asUser({ cookies: '', fn });

describe('Microsoft Money import endpoints', () => {
  describe('POST /import/ms-money/upload', () => {
    it('rejects a body that is not a Microsoft Money database', async () => {
      const result = await helpers.uploadMsMoney({
        file: Buffer.from('this is a text file, not a Money database'),
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(result.errorMessage).toMatch(/not a Microsoft Money database/i);
    });

    it('rejects a body of the right size that is still not a Money database', async () => {
      // Random bytes long enough to clear any minimum-length check, so the
      // rejection comes from the file's own header rather than its size.
      const result = await helpers.uploadMsMoney({ file: Buffer.alloc(8192, 0x42) });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(result.errorMessage).toBeTruthy();
    });

    it('rejects an empty body', async () => {
      const result = await helpers.uploadMsMoney({ file: Buffer.alloc(0) });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(result.errorMessage).toMatch(/No file was uploaded/i);
    });

    it('rejects a body sent without the octet-stream content type', async () => {
      // Only `application/octet-stream` reaches the raw parser, so anything else
      // leaves the handler with no buffer at all.
      const result = await helpers.uploadMsMoney({
        file: Buffer.from('some bytes'),
        contentType: 'text/plain',
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(result.errorMessage).toMatch(/No file was uploaded/i);
    });
  });

  describe('POST /import/ms-money/detect-duplicates', () => {
    it('returns 404 for an upload id that was never issued', async () => {
      const response = await helpers.detectMsMoneyDuplicates({
        payload: { uploadId: unknownUploadId(), accountMapping: someAccountMapping },
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 422 for an upload id that is not a UUID', async () => {
      const response = await helpers.detectMsMoneyDuplicates({
        payload: { uploadId: '../../etc/passwd', accountMapping: someAccountMapping },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('POST /import/ms-money/execute', () => {
    it('returns 404 for an upload id that was never issued', async () => {
      // The upload is checked before the job is queued, so an id the user cannot
      // act on fails immediately instead of becoming a job that dies later.
      const response = await helpers.executeMsMoney({
        payload: { uploadId: unknownUploadId(), accountMapping: someAccountMapping },
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 422 for an upload id that is not a UUID', async () => {
      const response = await helpers.executeMsMoney({
        payload: { uploadId: 'not-a-uuid', accountMapping: someAccountMapping },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('GET /import/ms-money/status/:jobId', () => {
    it('returns 404 for an unknown job id', async () => {
      const response = await helpers.getMsMoneyImportStatus({ jobId: 'no-such-ms-money-job' });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('cross-user isolation', () => {
    /**
     * A cached upload is keyed by its owner, so a second user asking for one gets
     * the same 404 as an id that does not exist — never a 200 carrying someone
     * else's data.
     *
     * Without a `.mny` fixture there is no way to mint a real upload here, so the
     * id is a well-formed random UUID. `ms-money-execute-import.e2e.ts` covers the
     * same boundary with an upload that genuinely belongs to another user.
     */
    it("refuses another user's upload id on both mapping steps", async () => {
      const otherUser = await provisionSecondUserWithBaseCurrency();
      const uploadId = unknownUploadId();

      await asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          const detect = await helpers.detectMsMoneyDuplicates({
            payload: { uploadId, accountMapping: someAccountMapping },
          });
          expect(detect.statusCode).toBe(ERROR_CODES.NotFoundError);

          const execute = await helpers.executeMsMoney({
            payload: { uploadId, accountMapping: someAccountMapping },
          });
          expect(execute.statusCode).toBe(ERROR_CODES.NotFoundError);
        },
      });
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated upload', async () => {
      const result = await withoutSession(() => helpers.uploadMsMoney({ file: Buffer.from('anything') }));

      expect(result.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('rejects unauthenticated detect-duplicates', async () => {
      const response = await withoutSession(() =>
        helpers.detectMsMoneyDuplicates({
          payload: { uploadId: unknownUploadId(), accountMapping: someAccountMapping },
        }),
      );

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('rejects an unauthenticated execute', async () => {
      const response = await withoutSession(() =>
        helpers.executeMsMoney({
          payload: { uploadId: unknownUploadId(), accountMapping: someAccountMapping },
        }),
      );

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('rejects an unauthenticated status poll', async () => {
      const response = await withoutSession(() => helpers.getMsMoneyImportStatus({ jobId: 'any-job' }));

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });
  });
});
