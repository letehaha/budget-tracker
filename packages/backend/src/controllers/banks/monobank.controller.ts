import {
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  AccountModel,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import {
  ExternalMonobankClientInfoResponse,
  ExternalMonobankTransactionResponse,
} from '@bt/shared/types/external-services';
import { redisKeyFormatter } from '@common/lib/redis';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { ERROR_CODES } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as MerchantCategoryCodes from '@models/MerchantCategoryCodes.model';
import * as UserMerchantCategoryCodes from '@models/UserMerchantCategoryCodes.model';
import * as Users from '@models/Users.model';
import { connection } from '@models/index';
import { API_PREFIX } from '@root/config';
import { redisClient } from '@root/redis-client';
import * as accountsService from '@services/accounts.service';
import * as monobankUsersService from '@services/banks/monobank/users';
import * as transactionsService from '@services/transactions';
import * as usersService from '@services/user.service';
import axios from 'axios';
import { addMonths, differenceInCalendarMonths, endOfMonth, startOfMonth } from 'date-fns';
import PQueue from 'p-queue';
import { z } from 'zod';

export const usersQuery = new Map();

const hostWebhooksCallback = 'http://d8d75e719def.ngrok.io';
const hostname = 'https://api.monobank.ua';

function dateRange({ from, to }: { from: number; to: number }): { start: number; end: number }[] {
  const difference = differenceInCalendarMonths(new Date(to), new Date(from));
  const dates: { start: number; end: number }[] = [];

  for (let i = 0; i <= difference; i++) {
    const start = startOfMonth(addMonths(new Date(from), i));
    const end = endOfMonth(addMonths(new Date(from), i));

    dates.push({
      start: Number((new Date(start).getTime() / 1000).toFixed(0)),
      end: Number((new Date(end).getTime() / 1000).toFixed(0)),
    });
  }

  return dates;
}

async function updateWebhookAxios({ userToken }: { userToken?: string } = {}) {
  await axios({
    method: 'POST',
    url: `${hostname}/personal/webhook`,
    responseType: 'json',
    headers: {
      'X-Token': userToken,
    },
    data: {
      webHookUrl: `${hostWebhooksCallback}${API_PREFIX}/banks/monobank/webhook`,
    },
  });
}

async function createMonoTransaction({
  data,
  account,
  userId,
}: {
  data: ExternalMonobankTransactionResponse;
  account: AccountModel;
  userId: number;
}) {
  const isTransactionExists = await transactionsService.getTransactionBySomeId({
    originalId: data.id,
    userId,
  });

  if (isTransactionExists) return;

  const userData = (await usersService.getUser(account.userId))!;

  let mccId = await MerchantCategoryCodes.getByCode({ code: data.mcc });

  // check if mcc code exist. If not, create a new with name 'Unknown'
  if (!mccId) {
    mccId = await MerchantCategoryCodes.addCode({ code: data.mcc });
  }

  const userMcc = await UserMerchantCategoryCodes.getByPassedParams({
    mccId: mccId.get('id'),
    userId: userData.id,
  });

  let categoryId: number;

  if (userMcc.length) {
    categoryId = userMcc[0]!.get('categoryId');
  } else {
    categoryId = (await Users.getUserDefaultCategory({ id: userData.id }))!.get('defaultCategoryId');

    await UserMerchantCategoryCodes.createEntry({
      mccId: mccId.get('id'),
      userId: userData.id,
      categoryId,
    });
  }

  await transactionsService.createTransaction({
    originalId: data.id,
    note: data.description,
    amount: Math.abs(data.amount),
    time: new Date(data.time * 1000),
    externalData: {
      operationAmount: data.operationAmount,
      receiptId: data.receiptId,
      balance: data.balance,
      hold: data.hold,
    },
    commissionRate: data.commissionRate,
    cashbackAmount: data.cashbackAmount,
    accountId: account.id,
    userId: userData.id,
    transactionType: data.amount > 0 ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    paymentType: PAYMENT_TYPES.creditCard,
    categoryId,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    accountType: ACCOUNT_TYPES.monobank,
  });

  // eslint-disable-next-line no-console
  logger.info(`New MONOBANK transaction! Amount is ${data.amount}`);
}

export const pairAccount = createController(
  z.object({
    body: z.object({
      token: z.string().min(1, '"token" (Monobank API token) field is required'),
    }),
  }),
  async ({ user, body }) => {
    const { token } = body;
    const systemUserId = Number(user.id);

    const result = await accountsService.pairMonobankAccount({
      token,
      userId: systemUserId,
    });

    if (result && 'connected' in result && result.connected) {
      return {
        statusCode: 404,
        data: {
          message: 'Account already connected',
          code: API_ERROR_CODES.monobankUserAlreadyConnected,
        },
      };
    }

    return { data: result };
  },
);

export const getUser = createController(z.object({}), async ({ user }) => {
  const monobankUser = await monobankUsersService.getUserBySystemId({
    systemUserId: Number(user.id),
  });

  if (!monobankUser) {
    return {
      statusCode: 404,
      data: {
        message: 'Current user does not have any paired monobank user.',
        code: API_ERROR_CODES.monobankUserNotPaired,
      },
    };
  }

  return { data: monobankUser };
});

export const updateUser = createController(
  z.object({
    body: z.object({
      apiToken: z.string().optional(),
      name: z.string().optional(),
      webHookUrl: z.string().optional(),
      clientId: z.string().optional(),
    }),
  }),
  async ({ user, body }) => {
    const { apiToken, name, webHookUrl, clientId } = body;

    const updatedUser = await monobankUsersService.updateUser({
      systemUserId: user.id,
      apiToken,
      name,
      webHookUrl,
      clientId,
    });

    return { data: updatedUser };
  },
);

// TODO:
// export const monobankWebhook = async (req, res: CustomResponse) => {
//   const { data } = req.body;

//   try {
//     const monobankAccounts = await monobankAccountsService.getAccountsById({
//       accountId: data.account,
//     });
//     if (!monobankAccounts.length) {
//       return res.status(404).json({
//         status: API_RESPONSE_STATUS.error,
//         response: {
//           message: 'Monobank account does not exist!',
//         },
//       });
//     }

//     for (const account of monobankAccounts) {
//       const user = await monobankUsersService.getUserById({ id: account.monoUserId });

//       await createMonoTransaction({
//         data: data.statementItem,
//         account,
//         userId: user.systemUserId,
//       });
//     }

//     return res.status(200).json({
//       status: API_RESPONSE_STATUS.success,
//     });
//   } catch (err) {
//     return res.status(500).json({
//       status: API_RESPONSE_STATUS.error,
//       response: {
//         message: 'Unexpected error.',
//         code: API_ERROR_CODES.unexpected,
//       },
//     });
//   }
// };

export const updateWebhook = createController(
  z.object({
    body: z.object({
      clientId: z.string(),
    }),
  }),
  async ({ user, body }) => {
    const { clientId } = body;
    const token = redisKeyFormatter(`monobank-${user.id}-update-webhook`);
    const tempToken = await redisClient.get(token);

    if (tempToken !== 'true') {
      await monobankUsersService.updateUser({
        systemUserId: user.id,
        clientId,
        webHookUrl: `${hostWebhooksCallback}${API_PREFIX}/banks/monobank/webhook`,
      });

      // TODO: why here we don't pass userToken?
      await updateWebhookAxios();

      await redisClient.set(token, 'true', { EX: 60 });

      return {};
    }

    return {
      statusCode: ERROR_CODES.TooManyRequests,
      data: {
        message: 'Too many requests! Request cannot be called more that once a minute!',
      },
    };
  },
);

export const loadTransactions = createController(
  z.object({
    query: z.object({
      from: z.string().refine((val) => Number(val) > 0, { message: '"from" field is not valid number' }),
      to: z.string().refine((val) => Number(val) > 0, { message: '"to" field is not valid number' }),
      accountId: z.string().transform((val) => recordId().parse(val)),
    }),
  }),
  async ({ user, query }) => {
    const { from, to, accountId } = query;
    const systemUserId = Number(user.id);

    const redisToken = redisKeyFormatter(`monobank-${systemUserId}-load-transactions`);
    const tempRedisToken = await redisClient.get(redisToken);

    if (tempRedisToken === 'true') {
      return {
        statusCode: ERROR_CODES.TooManyRequests,
        data: {
          message:
            'There were too many requests earlier. Please wait at least one minute from when you first saw this message.',
          code: API_ERROR_CODES.tooManyRequests,
        },
      };
    }

    const monobankUser = await monobankUsersService.getUserBySystemId({
      systemUserId,
    });

    if (!monobankUser) {
      return {
        statusCode: ERROR_CODES.NotFoundError,
        data: {
          message: 'Monobank user does not exist.',
          code: API_ERROR_CODES.notFound,
        },
      };
    }

    // Check mono account exist
    const account = await accountsService.getAccountById({
      id: accountId,
      userId: systemUserId,
    });

    if (!account) {
      return {
        statusCode: ERROR_CODES.NotFoundError,
        data: {
          message: 'Monobank account does not exist.',
          code: API_ERROR_CODES.notFound,
        },
      };
    }

    // Check is there already created query for data retrieve
    const existQuery = usersQuery.get(`query-${systemUserId}`);

    if (existQuery) {
      logger.error('[Monobank controller]: Query already exists');

      return {
        statusCode: ERROR_CODES.TooManyRequests,
        data: {
          message: `
            Query already exist and should be fulfilled first. Number of left
            requests is ${existQuery.size}. Try to request a bit later
            (approximately in ${existQuery.size} minutes, since each request
            will take about 60 seconds)
          `,
          code: API_ERROR_CODES.tooManyRequests,
        },
      };
    }

    // Create queue on data retrieving, get months and add queue to global map
    const queue = new PQueue({
      concurrency: 1,
      interval: 60000,
      intervalCap: 1,
    });
    const months = dateRange({ from: Number(from), to: Number(to) });

    usersQuery.set(`query-${systemUserId}`, queue);

    for (const month of months) {
      queue.add(async () => {
        try {
          const { data }: { data: ExternalMonobankTransactionResponse[] } = await axios({
            method: 'GET',
            url: `${hostname}/personal/statement/${account.externalId}/${month.start}/${month.end}`,
            responseType: 'json',
            headers: {
              'X-Token': monobankUser.apiToken,
            },
          });

          for (const item of data) {
            await createMonoTransaction({
              data: item,
              account,
              userId: systemUserId,
            });
          }
        } catch (err) {
          // @ts-expect-error TODO: add proper `err` interface
          if (err?.response?.status === ERROR_CODES.TooManyRequests) {
            await redisClient.set(redisToken, 'true', { EX: 60 });
          } else {
            logger.error(err as Error);
          }
        }
      });
    }

    // When all requests are done – delete it from the map
    queue.on('idle', () => {
      logger.info(
        `[Monobank controller]: All load transactions tasks are done. Size: ${queue.size}  Pending: ${queue.pending}`,
      );
      usersQuery.delete(`query-${systemUserId}`);
    });
    queue.on('add', () => {
      logger.info(
        `[Monobank controller]: Task to load transactions is added. Size: ${queue.size}  Pending: ${queue.pending}`,
      );
    });
    queue.on('next', () => {
      logger.info(
        `[Monobank controller]: One of load transactions task is completed. Size: ${queue.size}  Pending: ${queue.pending}`,
      );
    });

    return {
      data: {
        minutesToFinish: months.length - 1,
      },
    };
  },
);

export const refreshAccounts = createController(z.object({}), async ({ user }) => {
  const systemUserId = user.id;

  return connection.sequelize.transaction(async () => {
    const monoUser = await monobankUsersService.getUserBySystemId({
      systemUserId,
    });

    if (!monoUser) {
      return {
        statusCode: ERROR_CODES.NotFoundError,
        data: {
          message: 'Current user does not have any paired monobank user.',
          code: API_ERROR_CODES.monobankUserNotPaired,
        },
      };
    }

    const token = redisKeyFormatter(`monobank-${systemUserId}-client-info`);
    const tempToken = await redisClient.get(token);

    if (tempToken !== 'true') {
      let clientInfo: ExternalMonobankClientInfoResponse;
      try {
        clientInfo = (
          await axios({
            method: 'GET',
            url: `${hostname}/personal/client-info`,
            responseType: 'json',
            headers: {
              'X-Token': monoUser.apiToken,
            },
          })
        ).data;
      } catch (e) {
        // @ts-expect-error TODO: add proper `err` interface
        if (e.response) {
          // @ts-expect-error TODO: add proper `err` interface
          if (e.response.data.errorDescription === "Unknown 'X-Token'") {
            // Set user token to empty, since it is already invalid. In that way
            // we can let BE/FE know that last token was invalid and now it
            // needs to be updated
            await monobankUsersService.updateUser({
              systemUserId,
              apiToken: '',
            });

            return {
              statusCode: 403,
              data: {
                code: API_ERROR_CODES.monobankTokenInvalid,
                message: "User's token is invalid!",
              },
            };
          }
        }
        return {
          statusCode: 500,
          data: {
            message: 'Something bad happened while trying to contact Monobank!',
          },
        };
      }

      await redisClient.set(token, 'true', { EX: 60 });

      const existingAccounts = await accountsService.getAccountsByExternalIds({
        userId: monoUser.systemUserId,
        externalIds: clientInfo.accounts.map((item) => item.id),
      });

      const promises: Promise<unknown>[] = [];
      clientInfo.accounts.forEach((account) => {
        const existingAccount = existingAccounts.find((acc) => acc.externalId === account.id);

        if (existingAccount) {
          promises.push(
            accountsService.updateAccount({
              id: existingAccount.id,
              currentBalance: account.balance,
              creditLimit: account.creditLimit,
              userId: monoUser.systemUserId,
              // TODO: update externalData
              // maskedPan: JSON.stringify(item.maskedPan),
              // cashbackType: item.cashbackType,
              // type: item.type,
              // iban: item.iban,
            }),
          );
        } else {
          promises.push(
            accountsService.createSystemAccountsFromMonobankAccounts({
              userId: systemUserId,
              monoAccounts: [account],
            }),
          );
        }
      });

      await Promise.all(promises);

      const accounts = await accountsService.getAccounts({
        userId: monoUser.systemUserId,
        type: ACCOUNT_TYPES.monobank,
      });

      return { data: accounts };
    }

    return {
      statusCode: ERROR_CODES.TooManyRequests,
      data: {
        code: API_ERROR_CODES.tooManyRequests,
        message: 'Too many requests! Request cannot be called more that once a minute!',
      },
    };
  });
});
