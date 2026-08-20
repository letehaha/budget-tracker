import { type ImportBatchesHistoryResponse, type ImportSource } from '@bt/shared/types';
import { findTransactions } from '@models/transactions-query';
import { col, fn, literal } from 'sequelize';

const BATCH_ID_EXPR = `"Transactions"."externalData"->'importDetails'->>'batchId'`;
const SOURCE_EXPR = `"Transactions"."externalData"->'importDetails'->>'source'`;
const IMPORTED_AT_EXPR = `"Transactions"."externalData"->'importDetails'->>'importedAt'`;

/**
 * Policy declared once and shared by both queries below. A batch history entry
 * must cover every row an import actually created, so nothing is narrowed:
 * `planned: 'exclude'` because imports only ever write real transactions;
 * `balanceAdjustments: 'include'` and no `transfers` constraint keep every
 * transfer leg an import created.
 */
function buildBatchScope({ userId }: { userId: number }) {
  return {
    planned: 'exclude' as const,
    access: { creator: userId } as const,
    balanceAdjustments: 'include' as const,
    where: literal(`${BATCH_ID_EXPR} IS NOT NULL`),
  };
}

async function countBatches({ userId }: { userId: number }): Promise<number> {
  const [row] = (await findTransactions({
    ...buildBatchScope({ userId }),
    completeness: 'all',
    attributes: [[fn('COUNT', literal(`DISTINCT (${BATCH_ID_EXPR})`)), 'batchCount']],
    raw: true,
  })) as unknown as { batchCount: string | number }[];

  return Number(row?.batchCount ?? 0);
}

/**
 * One entry per distinct `importDetails.batchId` stamp any import wrote onto
 * `Transactions.externalData`. Derived entirely from existing transaction rows —
 * there is no dedicated batch table.
 *
 * `source`/`importedAt` are identical across every row of a batch, so MIN/MAX just
 * pick the shared value. The total is only counted for the first page — later pages
 * of an infinite scroll get `null` rather than paying for a COUNT that cannot have
 * changed meaning for them.
 */
export async function listBatchesHistory({
  userId,
  limit,
  offset,
}: {
  userId: number;
  limit: number;
  offset: number;
}): Promise<ImportBatchesHistoryResponse> {
  const isFirstPage = offset === 0;

  const [rows, totalCount] = await Promise.all([
    findTransactions({
      ...buildBatchScope({ userId }),
      completeness: { page: { offset, limit } },
      attributes: [
        [literal(BATCH_ID_EXPR), 'batchId'],
        [literal(`MIN(${SOURCE_EXPR})`), 'source'],
        // Kept as text (ISO-8601 `Z` strings sort identically to their chronological
        // order), not cast to timestamptz — a cast would make node-postgres parse this
        // into a JS Date at runtime while the field is typed/serialized as a string.
        [fn('MAX', literal(IMPORTED_AT_EXPR)), 'importedAt'],
        [fn('COUNT', col('Transactions.id')), 'transactionCount'],
        [fn('array_agg', fn('DISTINCT', col('accountId'))), 'accountIds'],
      ],
      // GROUP BY resolves against the `batchId` output column above; ORDER BY
      // against the `importedAt` one. `batchId` is a tiebreaker for imports that
      // land in the same millisecond, so paging stays stable.
      group: ['batchId'],
      order: literal(`"importedAt" DESC, "batchId" DESC`),
      subQuery: false,
      raw: true,
    }) as unknown as Promise<
      {
        batchId: string;
        source: ImportSource;
        importedAt: string;
        transactionCount: string | number;
        accountIds: string[];
      }[]
    >,
    isFirstPage ? countBatches({ userId }) : null,
  ]);

  return {
    items: rows.map((row) => ({
      batchId: row.batchId,
      source: row.source,
      importedAt: row.importedAt,
      transactionCount: Number(row.transactionCount),
      accountIds: row.accountIds,
    })),
    totalCount,
  };
}
