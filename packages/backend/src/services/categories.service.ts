import * as Categories from '@models/Categories.model';

import { withTransaction } from './common/with-transaction';

export const bulkCreate = withTransaction(
  (
    { data }: { data: unknown },
    {
      validate,
      returning,
    }: {
      validate?: boolean;
      returning?: boolean;
    } = {},
  ) => {
    return Categories.bulkCreate({ data }, { validate, returning });
  },
);

export const getCategories = withTransaction(async (payload: { userId: number }) => {
  const result = await Categories.getCategories(payload);

  return result;
});
