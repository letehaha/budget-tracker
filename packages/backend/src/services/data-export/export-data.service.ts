import { authPool } from '@config/auth';
import { captureException } from '@js/utils/sentry';
import { getBaseCurrency } from '@models/users-currencies.model';
import Users from '@models/users.model';
import JSZip from 'jszip';

import { buildExportTables } from './build-export-tables.service';
import { buildManifest, serializeManifest } from './build-manifest';
import { resolveEnabledFiles } from './registry';
import { totalRowCount } from './transformers/utils';
import * as exportTypes from './types';
import { type ExportFormat, type ExportGroup } from './types';
import { WRITERS } from './writers';

interface ExportDataResult {
  buffer: Buffer;
  filename: string;
  contentType: 'application/zip';
  totalRows: number;
}

export class ExportTooLargeError extends Error {
  public readonly rowCount: number;
  public readonly limit: number;
  constructor({ rowCount, limit }: { rowCount: number; limit: number }) {
    super(`Export would contain ${rowCount} rows which exceeds the ${limit} row limit.`);
    this.name = 'ExportTooLargeError';
    this.rowCount = rowCount;
    this.limit = limit;
  }
}

function buildFilename({ exportedAt }: { exportedAt: Date }): string {
  const datePart = exportedAt.toISOString().slice(0, 10);
  return `moneymatter-export-${datePart}.zip`;
}

async function fetchUserHeader({ userId }: { userId: number }): Promise<{
  username: string;
  email: string | null;
  baseCurrency: string;
}> {
  // No defensive catch on getBaseCurrency: most other transformers (budgets,
  // transactions) depend on the same data, so a DB failure here is a real
  // export failure – masking it with `null` would emit an inconsistent
  // export. The legitimate "user has no base currency yet" case still
  // returns null from the model and surfaces as an empty string below.
  const [user, baseCurrencyRecord] = await Promise.all([
    Users.findOne({ where: { id: userId } }),
    getBaseCurrency({ userId }),
  ]);

  let email: string | null = user?.email ?? null;
  if (!email && user?.authUserId) {
    try {
      const result = await authPool.query('SELECT email FROM ba_user WHERE id = $1', [user.authUserId]);
      if (result.rows.length > 0) email = result.rows[0].email;
    } catch (err) {
      // Email is informational only – a transient auth-pool failure should
      // not block the export. The export carries an explicit `email: null`
      // so the consumer can tell apart "absent" from "user with no email".
      // Route through Sentry (not logger.warn) so a chronic auth-pool flake
      // surfaces in the issue tracker; a warn channel alone makes a steady
      // background failure invisible.
      captureException({
        error: err instanceof Error ? err : new Error(String(err)),
        context: {
          feature: 'data-export',
          stage: 'fetchUserHeader-email-fallback',
          userId,
        },
      });
    }
  }

  return {
    username: user?.username ?? '',
    email,
    baseCurrency: baseCurrencyRecord?.currencyCode ?? '',
  };
}

/**
 * End-to-end Data Export orchestrator.
 *
 * 1. Resolve which output files the user requested via the group selection.
 * 2. Run all transformers concurrently (each is a pure read against Postgres).
 * 3. Enforce MAX_EXPORT_ROWS to guard the API process against a multi-year power
 *    user accidentally streaming a gigabyte zip down a sync HTTP handler.
 * 4. Format and zip. Manifest is built LAST so it can include the SHA-256 of every
 *    other file (chicken-and-egg: the manifest's own checksum doesn't appear in
 *    itself).
 */
export async function exportUserData({
  userId,
  format,
  groups,
}: {
  userId: number;
  format: ExportFormat;
  groups: ExportGroup[];
}): Promise<ExportDataResult> {
  const exportedAt = new Date();
  const enabledFiles = resolveEnabledFiles({ groups });

  // Only the JSON writer renders the user-header block; CSV/XLSX consumers
  // never see it, so don't pay for the two extra queries (Users + base
  // currency + optional auth-pool email round-trip).
  const wantsUserHeader = format === 'json';
  const [tables, userHeader] = await Promise.all([
    buildExportTables({ userId, enabledFiles }),
    wantsUserHeader ? fetchUserHeader({ userId }) : Promise.resolve(null),
  ]);

  const rowCount = totalRowCount({ tables });
  // Read MAX_EXPORT_ROWS through the namespace so tests can swap it at
  // runtime via jest.replaceProperty without rebuilding the module graph.
  const maxRows = exportTypes.MAX_EXPORT_ROWS;
  if (rowCount > maxRows) {
    throw new ExportTooLargeError({ rowCount, limit: maxRows });
  }

  const dataFiles = await WRITERS[format].write({ tables, exportedAt, user: userHeader ?? undefined });

  const manifest = buildManifest({ files: dataFiles, format, groups, exportedAt });
  const manifestBuffer = serializeManifest({ manifest });

  // STORE compression: the inputs are textual CSV/JSON that compress at the
  // HTTP layer anyway (Express+gzip), and STORE keeps memory predictable for
  // the preflight row-count cap.
  const zip = new JSZip();
  for (const file of dataFiles) {
    zip.file(file.filename, file.buffer, { compression: 'STORE' });
  }
  zip.file('manifest.json', manifestBuffer, { compression: 'STORE' });
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

  return {
    buffer: zipBuffer,
    filename: buildFilename({ exportedAt }),
    contentType: 'application/zip',
    totalRows: rowCount,
  };
}
