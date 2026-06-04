import { connection } from '@models/connection';
import { QueryTypes } from 'sequelize';

export interface PayeeStatsRow {
  payeeId: string;
  transactionCount: number;
  netFlowRefCents: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  topCategoryId: string | null;
}

/**
 * Computes per-Payee stats in a single SQL pass:
 *   - transaction count
 *   - net flow in ref currency (signed: income positive, expense negative)
 *   - first / last seen timestamps
 *   - the single most-frequent category id ("top category")
 *
 * Pulled at query time straight off the `(userId, payeeId, time DESC)` index;
 * there are no denormalized counters to keep in sync. Restricted to the caller's
 * Payees by `userId` on `Transactions`.
 *
 * When `payeeIds` is empty, returns `[]` without hitting the DB.
 */
async function getPayeeStats({ userId, payeeIds }: { userId: number; payeeIds: string[] }): Promise<PayeeStatsRow[]> {
  if (payeeIds.length === 0) return [];

  interface RawStatRow {
    payeeId: string;
    transactionCount: string;
    netFlowRefCents: string | null;
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
    topCategoryId: string | null;
  }
  const rows: RawStatRow[] = await connection.sequelize.query(
    `
    WITH per_tx AS (
      SELECT "payeeId", "categoryId", "refAmount", "time", "transactionType"
        FROM "Transactions"
       WHERE "userId" = :userId
         AND "payeeId" IN (:payeeIds)
    ),
    base AS (
      SELECT "payeeId",
             COUNT(*) AS "transactionCount",
             SUM(
               CASE WHEN "transactionType" = 'expense'
                    THEN -"refAmount"
                    ELSE "refAmount"
               END
             ) AS "netFlowRefCents",
             MIN("time") AS "firstSeenAt",
             MAX("time") AS "lastSeenAt"
        FROM per_tx
       GROUP BY "payeeId"
    ),
    cat_counts AS (
      SELECT "payeeId", "categoryId", COUNT(*) AS c
        FROM per_tx
       WHERE "categoryId" IS NOT NULL
       GROUP BY "payeeId", "categoryId"
    ),
    top_cat AS (
      SELECT DISTINCT ON ("payeeId") "payeeId", "categoryId"
        FROM cat_counts
       ORDER BY "payeeId", c DESC, "categoryId"
    )
    SELECT b."payeeId",
           b."transactionCount",
           b."netFlowRefCents",
           b."firstSeenAt",
           b."lastSeenAt",
           tc."categoryId" AS "topCategoryId"
      FROM base b
      LEFT JOIN top_cat tc ON tc."payeeId" = b."payeeId"
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { userId, payeeIds },
    },
  );

  return rows.map((r) => ({
    payeeId: r.payeeId,
    transactionCount: Number(r.transactionCount),
    netFlowRefCents: Number(r.netFlowRefCents ?? 0),
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    topCategoryId: r.topCategoryId,
  }));
}

/**
 * Compact map keyed by `payeeId` for joining stats onto a list of Payees in a
 * single pass without N+1 lookups.
 */
export async function getPayeeStatsMap({
  userId,
  payeeIds,
}: {
  userId: number;
  payeeIds: string[];
}): Promise<Map<string, PayeeStatsRow>> {
  const rows = await getPayeeStats({ userId, payeeIds });
  const map = new Map<string, PayeeStatsRow>();
  for (const row of rows) map.set(row.payeeId, row);
  return map;
}
