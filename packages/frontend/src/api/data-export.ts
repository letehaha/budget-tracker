import { fetchZipDownload } from '@/api/_zip-download';
import type { ExportDateRange, ExportFormat, ExportGroup } from '@bt/shared/types';

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

/** Trigger a data export and return the resulting zip as a Blob plus its row count. */
export async function exportData({ format, groups, dateRange }: ExportDataPayload): Promise<ExportDataResult> {
  const { blob, filename, response } = await fetchZipDownload({
    path: '/user/data-export',
    body: { format, groups, ...(dateRange ? { dateRange } : {}) },
    feature: 'data-export',
    defaultFilename: DEFAULT_FILENAME,
  });
  // X-Total-Rows is server-controlled so the regex guard is belt-and-braces:
  // it filters trailing garbage (`Number.parseInt('42xyz', 10)` returns 42)
  // so a malformed header surfaces as `null` instead of a quietly-truncated
  // integer the UI would treat as authoritative.
  const rowsHeader = response.headers.get('X-Total-Rows');
  const totalRows = rowsHeader && /^\d+$/.test(rowsHeader) ? Number.parseInt(rowsHeader, 10) : null;
  return { blob, filename, totalRows };
}
