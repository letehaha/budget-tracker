import { SetupServerApi } from 'msw/node';

declare global {
  // eslint-disable-next-line no-var
  var mswMockServer: SetupServerApi;
}
