import * as Currencies from '@models/Currencies.model';

import { withTransaction } from '../common/with-transaction';

export const getAllSystemCurrencies = withTransaction(() => {
  return Currencies.getAllCurrencies();
});
