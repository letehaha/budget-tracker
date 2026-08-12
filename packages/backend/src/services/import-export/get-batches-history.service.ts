import { type ImportBatchesHistoryResponse, type ImportSource } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import { type WhereOptions, col, fn, literal } from 'sequelize';

const BATCH_ID_EXPR = `"externalData"->'importDetails'->>'batchId'`;
const SOURCE_EXPR = `"externalData"->'importDetails'->>'source'`;
const IMPORTED_AT_EXPR = `"externalData"->'importDetails'->>'importedAt'`;

function buildBatchScope({ userId }: { userId: number }): WhereOptions<Transactions> {
  return literal(`"Transactions"."userId" = ${userId} AND ${BATCH_ID_EXPR} IS NOT NULL`);
}

async function countBatches({ userId }: { userId: number }): Promise<number> {
  const [row] = (await Transactions.findAll({
    where: buildBatchScope({ userId }),
    attributes: [[fn('COUNT', literal(`DISTINCT (${BATCH_ID_EXPR})`)), 'batchCount']],
    raw: true,
  })) as unknown as { batchCount: string | number }[];

  return Number(row?.batchCount ?? 0);
}

/**
 * One entry per distinct `importDetails.batchId` stamp any import wrote onto
 * `Transactions.externalData`. Derived entirely from existing transaction rows — no
 * dedicated batch table — per the scoped-down approach agreed in issue #90.
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
    Transactions.findAll({
      where: buildBatchScope({ userId }),
      attributes: [
        [literal(BATCH_ID_EXPR), 'batchId'],
        [literal(`MIN(${SOURCE_EXPR})`), 'source'],
        [fn('MAX', literal(`(${IMPORTED_AT_EXPR})::timestamptz`)), 'importedAt'],
        [fn('COUNT', col('Transactions.id')), 'transactionCount'],
        [fn('array_agg', fn('DISTINCT', col('accountId'))), 'accountIds'],
      ],
      // Postgres resolves both against the `batchId` output column above.
      group: ['batchId'],
      order: literal(`"importedAt" DESC`),
      limit,
      offset,
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
