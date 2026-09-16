import { ValidationError } from '@js/errors';
import { Op, WhereOptions, literal } from 'sequelize';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StatsScopeFilters {
  accountId?: string;
  accountIds?: string[];
  payeeIds?: string[];
  excludedPayeeIds?: string[];
  tagIds?: string[];
  excludedTagIds?: string[];
}

/** Throws on non-UUID ids: they are interpolated into a literal that cannot bind parameters. */
const tagIdList = ({ tagIds, field }: { tagIds: string[]; field: string }): string => {
  if (tagIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new ValidationError({ message: `"${field}" must contain valid record ids` });
  }

  return tagIds.map((id) => `'${id}'`).join(', ');
};

/**
 * `accountIds` wins over `accountId`. Include and exclude lists on one dimension are ANDed.
 * Tags use correlated subqueries: a join through TransactionTags repeats a row per tag and double-counts money.
 * Exclusions keep payee-less and untagged rows. Postgres NOT IN drops NULLs, hence the explicit IS NULL branch.
 */
export const buildStatsScopeWhere = ({
  accountId,
  accountIds,
  payeeIds,
  excludedPayeeIds,
  tagIds,
  excludedTagIds,
}: StatsScopeFilters): WhereOptions[] => {
  const fragments: WhereOptions[] = [];

  if (accountIds?.length) {
    fragments.push({ accountId: { [Op.in]: accountIds } });
  } else if (accountId) {
    fragments.push({ accountId });
  }

  if (payeeIds?.length) fragments.push({ payeeId: { [Op.in]: payeeIds } });

  if (excludedPayeeIds?.length) {
    fragments.push({ [Op.or]: [{ payeeId: null }, { payeeId: { [Op.notIn]: excludedPayeeIds } }] });
  }

  const junction = `SELECT 1 FROM "TransactionTags" tt WHERE tt."transactionId" = "Transactions"."id"`;

  if (tagIds?.length) {
    fragments.push(literal(`EXISTS (${junction} AND tt."tagId" IN (${tagIdList({ tagIds, field: 'tagIds' })}))`));
  }

  if (excludedTagIds?.length) {
    fragments.push(
      literal(
        `NOT EXISTS (${junction} AND tt."tagId" IN (${tagIdList({ tagIds: excludedTagIds, field: 'excludedTagIds' })}))`,
      ),
    );
  }

  return fragments;
};
