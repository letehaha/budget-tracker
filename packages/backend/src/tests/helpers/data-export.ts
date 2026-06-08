import { parseFilenameFromContentDisposition } from '@bt/shared/types';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import type { ExportFormat, ExportGroup, ExportManifest } from '@services/data-export/types';
import AdmZip from 'adm-zip';
import request from 'supertest';

interface ExportDataParams {
  format?: ExportFormat;
  groups?: ExportGroup[];
  withoutAuth?: boolean;
}

interface ExportDataResponse {
  statusCode: number;
  body: Buffer;
  filename: string | null;
  contentType: string | null;
  totalRows: number | null;
  errorBody: Record<string, unknown> | null;
}

/**
 * Drives the data-export endpoint in tests. Bypasses `makeRequest` because the
 * response is a binary zip, not the standard JSON envelope. Returns the raw
 * buffer plus the headers the frontend reads (filename, total-rows). Callers
 * can pipe `body` straight into `parseExportArchive` to inspect contents. The
 * `withoutAuth` flag lets tests exercise the unauthenticated path.
 */
export async function exportData(params: ExportDataParams = {}): Promise<ExportDataResponse> {
  const payload = {
    format: params.format ?? 'json',
    ...(params.groups !== undefined ? { groups: params.groups } : {}),
  };

  const base = request(app).post(`${API_PREFIX}/user/data-export`).set('Accept', 'application/zip');
  if (!params.withoutAuth && global.APP_AUTH_COOKIES) base.set('Cookie', global.APP_AUTH_COOKIES);
  const result = await base
    .send(payload)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

  const contentType = (result.headers['content-type'] as string | undefined) ?? null;
  let errorBody: Record<string, unknown> | null = null;
  if (contentType?.includes('application/json')) {
    try {
      errorBody = JSON.parse((result.body as Buffer).toString('utf8')) as Record<string, unknown>;
    } catch {
      errorBody = null;
    }
  }

  return {
    statusCode: result.status,
    body: result.body as Buffer,
    filename: parseFilenameFromContentDisposition({
      header: (result.headers['content-disposition'] as string | undefined) ?? null,
    }),
    contentType,
    totalRows: result.headers['x-total-rows'] ? Number(result.headers['x-total-rows']) : null,
    errorBody,
  };
}

export interface ParsedExportArchive {
  files: Map<string, Buffer>;
  manifest: ExportManifest;
  json: Record<string, unknown> | null;
}

/**
 * Unzip a `body` returned by `exportData` and return the file index plus the
 * parsed manifest. If the archive contains `data-export.json` (the JSON-format
 * case) it's parsed and returned as `json` for direct assertion.
 */
export function parseExportArchive({ buffer }: { buffer: Buffer }): ParsedExportArchive {
  const zip = new AdmZip(buffer);
  const files = new Map<string, Buffer>();
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) files.set(entry.entryName, entry.getData());
  }

  const manifestBuf = files.get('manifest.json');
  if (!manifestBuf) {
    throw new Error('Export archive is missing manifest.json – should be impossible.');
  }
  const manifest = JSON.parse(manifestBuf.toString('utf8')) as ExportManifest;

  let json: Record<string, unknown> | null = null;
  const jsonBuf = files.get('data-export.json');
  if (jsonBuf) {
    json = JSON.parse(jsonBuf.toString('utf8')) as Record<string, unknown>;
  }

  return { files, manifest, json };
}

function parseLine({ line }: { line: string }): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse a CSV buffer into a list of objects keyed by the header row. Strips
 * the UTF-8 BOM if present. Intentionally simple – handles only the row
 * shapes the export writer produces (no embedded newlines, csv-stringify's
 * canonical quoting).
 */
export function parseExportCsv({ buffer }: { buffer: Buffer }): Array<Record<string, string>> {
  const BOM = '﻿';
  let text = buffer.toString('utf8');
  if (text.startsWith(BOM)) text = text.slice(BOM.length);

  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = parseLine({ line: lines[0]! });
  return lines.slice(1).map((line) => {
    const cells = parseLine({ line });
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = cells[idx] ?? '';
    });
    return row;
  });
}
