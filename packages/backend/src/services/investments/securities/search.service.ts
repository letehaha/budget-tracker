import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common';
import { Op, literal } from 'sequelize';

interface SearchOptions {
  query: string;
  limit?: number;
}

const searchSecuritiesImpl = async ({ query, limit = 20 }: SearchOptions) => {
  return Securities.findAll({
    where: {
      // Search by symbol (case-insensitive) OR name (case-insensitive)
      [Op.or]: [{ symbol: { [Op.iLike]: `${query}%` } }, { name: { [Op.iLike]: `%${query}%` } }],
    },
    limit,
    order: [
      // Order by firstly showing exact match, and then case-insensitive match
      [
        literal(
          `CASE
            WHEN "symbol" = '${query}' THEN 1
            WHEN "name" = '${query}' THEN 2
            WHEN "symbol" ILIKE '${query}%' THEN 3
            WHEN "name" ILIKE '${query}%' THEN 4
            ELSE 5
          END`,
        ),
        'ASC',
      ],
      ['name', 'ASC'],
      ['symbol', 'ASC'],
    ],
  });
};

export const searchSecurities = withTransaction(searchSecuritiesImpl);
