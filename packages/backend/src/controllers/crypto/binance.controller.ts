import { API_ERROR_CODES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import axios from 'axios';
import crypto from 'crypto';
import { z } from 'zod';

import * as BinanceUserSettings from '../../models/binance/UserSettings.model';

const createSignedGETRequestURL = ({ url, params, secretKey }) => {
  const localUrl = new URL(url);
  const localParams = params;

  localUrl.search = new URLSearchParams(localParams).toString();

  localParams.signature = crypto.createHmac('sha256', secretKey).update(localUrl.search.substr(1)).digest('hex');

  localUrl.search = new URLSearchParams(localParams).toString();

  return localUrl;
};

const setSettingsSchema = z.object({
  body: z.object({
    apiKey: z.string(),
    secretKey: z.string(),
  }),
});

export const setSettings = createController(setSettingsSchema, async ({ user, body }) => {
  const { id } = user;
  const { apiKey, secretKey } = body;

  let settings = await BinanceUserSettings.addSettings({
    userId: id,
    apiKey,
    secretKey,
  });

  if (Array.isArray(settings)) {
    // eslint-disable-next-line prefer-destructuring
    settings = settings[0];
  }

  return { data: settings };
});

const getAccountDataSchema = z.object({
  query: z.object({
    timestamp: z.string().optional(),
  }),
});

export const getAccountData = createController(getAccountDataSchema, async ({ user, query }) => {
  const { id } = user;
  const timestamp = query.timestamp || new Date().getTime().toString();

  const userSettings = await BinanceUserSettings.getByUserId({
    userId: id,
  });

  if (!userSettings || (!userSettings.apiKey && !userSettings.secretKey)) {
    throw {
      statusCode: 403,
      message: 'Secret and public keys do not exist!',
      code: API_ERROR_CODES.cryptoBinanceBothAPIKeysDoesNotexist,
    };
  }
  if (!userSettings.apiKey) {
    throw {
      statusCode: 403,
      message: 'Api key does not exist!',
      code: API_ERROR_CODES.cryptoBinancePublicAPIKeyNotDefined,
    };
  }
  if (!userSettings.secretKey) {
    throw {
      statusCode: 403,
      message: 'Secret key does not exist!',
      code: API_ERROR_CODES.cryptoBinanceSecretAPIKeyNotDefined,
    };
  }

  const url = createSignedGETRequestURL({
    url: 'https://api.binance.com/api/v3/account',
    params: { timestamp },
    secretKey: userSettings.secretKey,
  });

  try {
    const response = await axios({
      url: url.href,
      headers: {
        'X-MBX-APIKEY': userSettings.apiKey,
      },
      responseType: 'json',
      method: 'GET',
    });

    const notNullBalances = response.data.balances.filter((item) => Number(item.free) + Number(item.locked) > 0);

    const defaultAssetQuote = 'USDT';
    const blackList = ['USDT', 'NFT'];
    const zeroPrice = ['NFT'];

    // TODO: replace it with allSettled
    // TODO: add check "if rejected use BTC as default quote asset"
    const dollars = (
      await Promise.all(
        notNullBalances
          .filter((balance) => !blackList.includes(balance.asset))
          .map((balance) =>
            axios({
              url: `https://api.binance.com/api/v3/ticker/price?symbol=${balance.asset}${defaultAssetQuote}`,
              method: 'GET',
              responseType: 'json',
            }),
          ),
      )
    ).map((item) => item.data);

    dollars.forEach((dollar) => {
      const index = response.data.balances.findIndex(
        (item) => item.asset === dollar.symbol.replace(defaultAssetQuote, ''),
      );
      response.data.balances[index].usdPrice = dollar.price;
    });

    zeroPrice.forEach((value) => {
      const index = response.data.balances.findIndex((item) => item.asset === value);

      response.data.balances[index].usdPrice = 0;
    });

    return { data: response.data };
  } catch (err) {
    // @ts-expect-error TODO: add proper `err` interface
    if (err.response?.data?.code === -2014) {
      throw {
        statusCode: 400,
        // @ts-expect-error TODO: add proper `err` interface
        message: err.response.data.msg,
      };
    }
    throw {
      statusCode: 500,
      code: 1,
      message: 'Unexpected server error!',
    };
  }
});
