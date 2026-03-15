import type { ExternalMonobankClientInfoResponse } from '@bt/shared/types';
import { asCents } from '@bt/shared/types';

export const getMockedClientData = (): ExternalMonobankClientInfoResponse => ({
  clientId: 'sdfsdfsdf',
  name: 'Test User',
  webHookUrl: '',
  permissions: '',
  accounts: [
    {
      id: 'test-account-1',
      sendId: 'test-send-id-1',
      balance: asCents(2500000),
      creditLimit: asCents(200000),
      type: 'black',
      currencyCode: 980,
      cashbackType: 'Miles',
      maskedPan: [],
      iban: 'test iban 1',
    },
    {
      id: 'test-account-2',
      sendId: 'test-send-id-2',
      balance: asCents(1000),
      creditLimit: asCents(0),
      type: 'black',
      currencyCode: 840,
      cashbackType: 'Miles',
      maskedPan: [],
      iban: 'test iban 2',
    },
  ],
  jars: [],
});
