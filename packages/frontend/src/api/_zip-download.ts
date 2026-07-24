import { API_HTTP } from '@/api/_api';
import { config } from '@/common/config';
import { ApiBaseError } from '@/common/types';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { API_ERROR_CODES, parseFilenameFromContentDisposition } from '@bt/shared/types';

const API_VER = config.apiVer;
const SESSION_ID_KEY = 'session-id';

/**
 * Shape of the JSON error body the backend returns when a zip endpoint fails.
 * The standard envelope wraps the error fields under `response`; gateway
 * middleware (e.g. a raw 413) may put them at the top level, so both are read.
 */
type ErrorEnvelope = { response?: ApiBaseError } & Partial<ApiBaseError>;

interface ZipDownloadResult {
  blob: Blob;
  filename: string;
  /** Kept so callers can read endpoint-specific headers (e.g. `X-Total-Rows`). */
  response: Response;
}

/**
 * POST to a backend endpoint that streams a binary zip and return its blob,
 * parsed filename and the raw `Response`.
 *
 * Uses raw `fetch` instead of the shared `ApiCaller` because the body is a zip,
 * not the standard `{ status, response }` JSON envelope. On error the server
 * still returns the envelope; it is parsed and re-thrown via `ApiErrorResponseError`
 * so callers see the same shape as any regular API call. `feature` tags the Sentry
 * report if the error body itself can't be parsed.
 */
export async function fetchZipDownload({
  path,
  body,
  feature,
  defaultFilename,
}: {
  path: string;
  body?: unknown;
  feature: string;
  defaultFilename: string;
}): Promise<ZipDownloadResult> {
  const url = `${API_HTTP}${API_VER}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': window.sessionStorage?.getItem(SESSION_ID_KEY) || '',
      Accept: 'application/zip, application/json',
    },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    let rawBody: string | null = null;
    let envelope: ErrorEnvelope | null = null;
    try {
      rawBody = await response.text();
      envelope = rawBody ? (JSON.parse(rawBody) as ErrorEnvelope) : null;
    } catch (parseErr) {
      captureException({
        error: parseErr instanceof Error ? parseErr : new Error(String(parseErr)),
        context: {
          feature,
          stage: 'envelope-parse',
          status: response.status,
          statusText: response.statusText,
          bodyPreview: rawBody?.slice(0, 500) ?? null,
        },
      });
      envelope = null;
    }
    // The standard envelope wraps fields under `response`; surface either shape so
    // a gateway-level 4xx (which may omit the wrapper) still shows its message and
    // code through to the caller's toast handling.
    const inner: Partial<ApiBaseError> = envelope?.response ?? envelope ?? {};
    const message = inner.message || `Download failed (${response.status} ${response.statusText})`;
    const errorPayload: ApiBaseError = {
      message,
      code: inner.code ?? API_ERROR_CODES.unexpected,
      statusText: response.statusText,
      details: inner.details,
    };
    throw new ApiErrorResponseError(message, errorPayload);
  }

  const blob = await response.blob();
  const filename =
    parseFilenameFromContentDisposition({ header: response.headers.get('Content-Disposition') }) ?? defaultFilename;
  return { blob, filename, response };
}
