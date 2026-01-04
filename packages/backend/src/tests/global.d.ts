import { Currencies } from '@bt/shared/types';
import { SetupServerApi } from 'msw/node';

declare global {
  // eslint-disable-next-line no-var
  var mswMockServer: SetupServerApi;
  // eslint-disable-next-line no-var
  var BASE_CURRENCY: Currencies | null;
  // eslint-disable-next-line no-var
  var BASE_CURRENCY_CODE: string;
  // eslint-disable-next-line no-var
  var MODELS_CURRENCIES: Currencies[] | null;
  // eslint-disable-next-line no-var
  var APP_AUTH_COOKIES: string | null;
}
