import TransactionGroups from '@models/transaction-groups.model';
import type Transactions from '@models/transactions.model';
import { literal } from 'sequelize';

import { INCLUDE_GROUP_TRANSACTIONS } from './constants';

interface GetTransactionGroupsPayload {
  userId: number;
  includeTransactions?: boolean;
}

export interface TransactionGroupWithTransactions extends TransactionGroups {
  transactions: Transactions[];
}

export interface TransactionGroupWithAggregates {
  id: number;
  name: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
  transactionCount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export type TransactionGroupResult = TransactionGroupWithTransactions[] | TransactionGroupWithAggregates[];

const AGGREGATE_COUNT = literal(`(
  SELECT COUNT(*)
  FROM "TransactionGroupItems"
  WHERE "TransactionGroupItems"."groupId" = "TransactionGroups"."id"
)`);

const AGGREGATE_DATE_FROM = literal(`(
  SELECT MIN("Transactions"."time")
  FROM "TransactionGroupItems"
  INNER JOIN "Transactions" ON "Transactions"."id" = "TransactionGroupItems"."transactionId"
  WHERE "TransactionGroupItems"."groupId" = "TransactionGroups"."id"
)`);

const AGGREGATE_DATE_TO = literal(`(
  SELECT MAX("Transactions"."time")
  FROM "TransactionGroupItems"
  INNER JOIN "Transactions" ON "Transactions"."id" = "TransactionGroupItems"."transactionId"
  WHERE "TransactionGroupItems"."groupId" = "TransactionGroups"."id"
)`);

export const getTransactionGroups = async ({
  userId,
  includeTransactions,
}: GetTransactionGroupsPayload): Promise<TransactionGroupResult> => {
  if (includeTransactions) {
    return TransactionGroups.findAll({
      where: { userId },
      include: [INCLUDE_GROUP_TRANSACTIONS],
      order: [[AGGREGATE_DATE_TO, 'DESC']],
    }) as Promise<TransactionGroupWithTransactions[]>;
  }

  // Return groups with computed aggregates. Uses 3 correlated subqueries (COUNT, MIN, MAX)
  // which are efficient because TransactionGroupItems has a PK on (groupId, transactionId).
  // ORDER BY reuses the dateTo alias instead of repeating the MAX subquery.
  const groups = (await TransactionGroups.findAll({
    where: { userId },
    attributes: {
      include: [
        [AGGREGATE_COUNT, 'transactionCount'],
        [AGGREGATE_DATE_FROM, 'dateFrom'],
        [AGGREGATE_DATE_TO, 'dateTo'],
      ],
    },
    order: [[AGGREGATE_DATE_TO, 'DESC']],
    raw: true,
  })) as unknown as (TransactionGroups & { transactionCount: string; dateFrom: string; dateTo: string })[];

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    note: group.note,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    userId: group.userId,
    transactionCount: Number(group.transactionCount),
    dateFrom: group.dateFrom,
    dateTo: group.dateTo,
  }));
};
