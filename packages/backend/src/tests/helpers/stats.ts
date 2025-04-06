import * as helpers from '@tests/helpers';

export const getSpendingsByCategories = async ({ raw = false }: { raw?: boolean } = {}) => {
  const result = await helpers.makeRequest({
    method: 'get',
    url: '/stats/spendings-by-categories',
  });

  return raw ? helpers.extractResponse(result) : result;
};
