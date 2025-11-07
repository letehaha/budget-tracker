import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, TransactionModel, type endpointsTypes } from '@bt/shared/types';
import Accounts from '@models/Accounts.model';
import Currencies from '@models/Currencies.model';
import { updateAccount as apiUpdateAccount } from '@root/services/accounts.service';
import { Response } from 'express';

import { makeRequest } from './common';
import { addUserCurrencies, getCurrenciesRates } from './currencies';

export const buildAccountPayload = (
  overrides: Partial<endpointsTypes.CreateAccountBody> = {},
): endpointsTypes.CreateAccountBody => ({
  accountCategory: ACCOUNT_CATEGORIES.general,
  currencyCode: global.BASE_CURRENCY.code,
  name: 'test',
  type: ACCOUNT_TYPES.system,
  initialBalance: 0,
  creditLimit: 0,
  ...overrides,
});
type BuildAccountPayload = ReturnType<typeof buildAccountPayload>;

export function getAccount({ id, raw }: { id: number; raw: false }): Promise<Response>;
export function getAccount({ id, raw }: { id: number; raw: true }): Promise<Accounts>;
export function getAccount({ id, raw = false }: { id: number; raw?: boolean }) {
  return makeRequest({
    method: 'get',
    url: `/accounts/${id}`,
    raw,
  });
}

export function getAccounts(): Promise<Accounts[]> {
  return makeRequest({
    method: 'get',
    url: `/accounts`,
    raw: true,
  });
}

/**
 * Creates an account. By default for base currency, but any payload can be passed
 */
export function createAccount(): Promise<Response>;
export function createAccount({ payload, raw }: { payload?: BuildAccountPayload; raw: false }): Promise<Response>;
export function createAccount({ payload, raw }: { payload?: BuildAccountPayload; raw: true }): Promise<Accounts>;
export function createAccount({ payload = buildAccountPayload(), raw = false } = {}) {
  return makeRequest({
    method: 'post',
    url: '/accounts',
    payload,
    raw,
  });
}

export function updateAccount<
  T = Awaited<ReturnType<typeof apiUpdateAccount>>,
  R extends boolean | undefined = undefined,
>({ id, payload = {}, raw }: { id: number; payload?: Partial<BuildAccountPayload>; raw?: R }) {
  return makeRequest<T, R>({
    method: 'put',
    url: `/accounts/${id}`,
    payload,
    raw,
  });
}

export function deleteAccount({ id, raw }: { id: number; raw: false }): Promise<Response>;
export function deleteAccount({ id, raw }: { id: number; raw: true }): Promise<void>;
export function deleteAccount({ id, raw = false }: { id: number; raw?: boolean }) {
  return makeRequest({
    method: 'delete',
    url: `/accounts/${id}`,
    raw,
  });
}

export function unlinkAccountFromBankConnection({ id, raw }: { id: number; raw: false }): Promise<Response>;
export function unlinkAccountFromBankConnection({ id, raw }: { id: number; raw: true }): Promise<Accounts>;
export function unlinkAccountFromBankConnection({ id, raw = false }: { id: number; raw?: boolean }) {
  return makeRequest({
    method: 'post',
    url: `/accounts/${id}/unlink`,
    raw,
  });
}

export function linkAccountToBankConnection<R extends boolean | undefined = undefined>({
  id,
  connectionId,
  externalAccountId,
  raw,
}: {
  id: number;
  connectionId: number;
  externalAccountId: string;
  raw?: R;
}) {
  return makeRequest<
    {
      account: Accounts;
      balanceDifference: number;
      balanceAdjustmentTransaction: TransactionModel | null;
      message: string;
    },
    R
  >({
    method: 'post',
    url: `/accounts/${id}/link`,
    payload: {
      connectionId,
      externalAccountId,
    },
    raw,
  });
}

export const createAccountWithNewCurrency = async ({ currency }: { currency: string }) => {
  const currencyA: Currencies = global.MODELS_CURRENCIES.find((item: Currencies) => item.code === currency);
  await addUserCurrencies({ currencyCodes: [currencyA.code] });

  const account = await createAccount({
    payload: {
      ...buildAccountPayload(),
      currencyCode: currencyA.code,
    },
    raw: true,
  });

  const currencies = await getCurrenciesRates({ codes: [currency] });

  return { account, currency: currencyA, currencyRate: currencies[0] };
};
