import type { ExternalMonobankClientInfoResponse } from '@bt/shared/types';

export const getMockedClientData = (): ExternalMonobankClientInfoResponse => ({
  clientId: 'sdfsdfsdf',
  name: 'Test User',
  webHookUrl: '',
  permissions: '',
  accounts: [
    {
      id: 'test-account-1',
      sendId: 'test-send-id-1',
      balance: 2500000,
      creditLimit: 200000,
      type: 'black',
      currencyCode: 980,
      cashbackType: 'Miles',
      maskedPan: [],
      iban: 'test iban 1',
    },
    {
      id: 'test-account-2',
      sendId: 'test-send-id-2',
      balance: 1000,
      creditLimit: 0,
      type: 'black',
      currencyCode: 840,
      cashbackType: 'Miles',
      maskedPan: [],
      iban: 'test iban 2',
    },
  ],
  jars: [],
});
