import { type AiCategorizationRunSummary, CATEGORIZATION_SOURCE, type CATEGORIZATION_TRIGGER } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import { type Includeable, type WhereOptions, col, fn, literal } from 'sequelize';

import { ownedAccountsInclude } from './categorization-candidates';

const CATEGORIZED_AT = `"Transactions"."categorizationMeta"->>'categorizedAt'`;

function buildRunScope({ userId }: { userId: number }): {
  where: WhereOptions<Transactions>;
  include: Includeable[];
} {
  return {
    where: literal(
      `"Transactions"."categorizationMeta"->>'source' = '${CATEGORIZATION_SOURCE.ai}' AND ${CATEGORIZED_AT} IS NOT NULL`,
    ),
    include: [ownedAccountsInclude({ userId })],
  };
}

async function countCategorizationRuns({ userId }: { userId: number }): Promise<number> {
  const [row] = (await Transactions.findAll({
    ...buildRunScope({ userId }),
    attributes: [[fn('COUNT', literal(`DISTINCT (${CATEGORIZED_AT})`)), 'runCount']],
    raw: true,
  })) as unknown as { runCount: string | number }[];

  return Number(row?.runCount ?? 0);
}

/**
 * One entry per distinct `categorizationMeta.categorizedAt` stamp the AI wrote. A row the
 * user re-categorized carries a different source and drops out, so the counts describe the
 * current state rather than what the run originally decided.
 *
 * The total is only counted for the first page — later pages of an infinite scroll get
 * `null` rather than paying for a COUNT that cannot have changed meaning for them.
 */
export async function listCategorizationRuns({
  userId,
  limit,
  offset,
}: {
  userId: number;
  limit: number;
  offset: number;
}): Promise<{ items: AiCategorizationRunSummary[]; totalCount: number | null }> {
  const isFirstPage = offset === 0;

  const [rows, totalCount] = await Promise.all([
    Transactions.findAll({
      ...buildRunScope({ userId }),
      attributes: [
        [literal(CATEGORIZED_AT), 'categorizedAt'],
        [fn('COUNT', col('Transactions.id')), 'transactionCount'],
        // One run = one job = one trigger value, so MIN just picks the shared one
        // (NULL for rows stamped before triggers were recorded).
        [literal(`MIN("Transactions"."categorizationMeta"->>'trigger')`), 'trigger'],
      ],
      // Postgres resolves both against the `categorizedAt` output column above.
      group: ['categorizedAt'],
      order: literal(`"categorizedAt" DESC`),
      limit,
      offset,
      subQuery: false,
      raw: true,
    }) as unknown as Promise<
      { categorizedAt: string; transactionCount: string | number; trigger: CATEGORIZATION_TRIGGER | null }[]
    >,
    isFirstPage ? countCategorizationRuns({ userId }) : null,
  ]);

  return {
    items: rows.map((row) => ({
      categorizedAt: row.categorizedAt,
      transactionCount: Number(row.transactionCount),
      trigger: row.trigger,
    })),
    totalCount,
  };
}
