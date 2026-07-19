import { API_HTTP } from '@/api/_api';
import { config } from '@/common/config';
import { ApiBaseError } from '@/common/types';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import {
  API_ERROR_CODES,
  parseFilenameFromContentDisposition,
  type ExportDateRange,
  type ExportFormat,
  type ExportGroup,
} from '@bt/shared/types';

const API_VER = config.apiVer;
const SESSION_ID_KEY = 'session-id';

export interface ExportDataPayload {
  format: ExportFormat;
  groups: ExportGroup[];
  dateRange?: ExportDateRange;
}

interface ExportDataResult {
  blob: Blob;
  filename: string;
  totalRows: number | null;
}

const DEFAULT_FILENAME = 'moneymatter-export.zip';

/**
 * Shape of the JSON error body the backend returns when the endpoint fails.
 * The standard envelope wraps the error fields under `response`; older paths
 * (and gateway middleware that emits raw JSON 413s) may put them at the top
 * level, so both layouts are accepted.
 */
type ErrorEnvelope = { response?: ApiBaseError } & Partial<ApiBaseError>;

/**
 * Trigger a data export and return the resulting zip as a Blob.
 *
 * Uses raw `fetch` instead of the shared `ApiCaller` because the response is
 * a binary zip, not the standard `{ status, response }` JSON envelope. On
 * error the server still returns the envelope; we parse it and re-throw via
 * `ApiErrorResponseError` so callers see the same shape they'd get from any
 * regular API call.
 */
export async function exportData({ format, groups, dateRange }: ExportDataPayload): Promise<ExportDataResult> {
  const url = `${API_HTTP}${API_VER}/user/data-export`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': window.sessionStorage?.getItem(SESSION_ID_KEY) || '',
      Accept: 'application/zip, application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      format,
      groups,
      ...(dateRange ? { dateRange } : {}),
    }),
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
          feature: 'data-export',
          stage: 'envelope-parse',
          status: response.status,
          statusText: response.statusText,
          bodyPreview: rawBody?.slice(0, 500) ?? null,
        },
      });
      envelope = null;
    }
    // The standard envelope wraps fields under `response`; surface either
    // shape so a gateway-level 4xx (which may omit the wrapper) still shows
    // its message and code through to the dialog's toast handling.
    const inner: Partial<ApiBaseError> = envelope?.response ?? envelope ?? {};
    const message = inner.message || `Export failed (${response.status} ${response.statusText})`;
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
    parseFilenameFromContentDisposition({ header: response.headers.get('Content-Disposition') }) ?? DEFAULT_FILENAME;
  // X-Total-Rows is server-controlled so the regex guard is belt-and-braces:
  // it filters trailing garbage (`Number.parseInt('42xyz', 10)` returns 42)
  // so a malformed header surfaces as `null` instead of a quietly-truncated
  // integer the UI would treat as authoritative.
  const rowsHeader = response.headers.get('X-Total-Rows');
  const totalRows = rowsHeader && /^\d+$/.test(rowsHeader) ? Number.parseInt(rowsHeader, 10) : null;
  return { blob, filename, totalRows };
}
