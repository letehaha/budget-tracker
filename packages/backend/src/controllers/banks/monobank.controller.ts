import {
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  API_RESPONSE_STATUS,
  AccountModel,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  endpointsTypes,
} from '@bt/shared/types';
import {
  ExternalMonobankClientInfoResponse,
  ExternalMonobankTransactionResponse,
} from '@bt/shared/types/external-services';
import { redisKeyFormatter } from '@common/lib/redis';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { ERROR_CODES, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as MerchantCategoryCodes from '@models/MerchantCategoryCodes.model';
import * as UserMerchantCategoryCodes from '@models/UserMerchantCategoryCodes.model';
import * as Users from '@models/Users.model';
import { connection } from '@models/index';
import { API_PREFIX } from '@root/config';
import { redisClient } from '@root/redis';
import * as accountsService from '@services/accounts.service';
import * as monobankUsersService from '@services/banks/monobank/users';
import * as transactionsService from '@services/transactions';
import * as usersService from '@services/user.service';
import axios from 'axios';
import { addMonths, differenceInCalendarMonths, endOfMonth, startOfMonth } from 'date-fns';
import PQueue from 'p-queue';

export const usersQuery = new Map();

// TODO: for now dumb value
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

export const pairAccount = async (req, res: CustomResponse) => {
  const { token }: endpointsTypes.PairMonobankAccountBody = req.body;
  let { id: systemUserId }: { id: number } = req.user;
  systemUserId = Number(systemUserId);

  try {
    if (!token || typeof token !== 'string') {
      throw new ValidationError({
        message: '"token" (Monobank API token) field is required and should be a string',
      });
    }

    const result = await accountsService.pairMonobankAccount({
      token,
      userId: systemUserId,
    });

    if (result && 'connected' in result && result.connected) {
      return res.status(404).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Account already connected',
          code: API_ERROR_CODES.monobankUserAlreadyConnected,
        },
      });
    }

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getUser = async (req, res: CustomResponse) => {
  const { id } = req.user;

  try {
    const user = await monobankUsersService.getUserBySystemId({
      systemUserId: Number(id),
    });

    if (!user) {
      return res.status(404).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Current user does not have any paired monobank user.',
          code: API_ERROR_CODES.monobankUserNotPaired,
        },
      });
    }

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: user,
    });
  } catch (err) {
    return res.status(500).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Unexpected error.',
        code: API_ERROR_CODES.unexpected,
      },
    });
  }
};

export const updateUser = async (req, res: CustomResponse) => {
  const { id: systemUserId } = req.user;
  const { apiToken, name, webHookUrl, clientId }: endpointsTypes.UpdateMonobankUserBody = req.body;

  try {
    const user = await monobankUsersService.updateUser({
      systemUserId,
      apiToken,
      name,
      webHookUrl,
      clientId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: user,
    });
  } catch (err) {
    return res.status(500).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Unexpected error.',
        code: API_ERROR_CODES.unexpected,
      },
    });
  }
};

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

// TODO:
export const updateWebhook = async (req, res: CustomResponse) => {
  try {
    const { clientId }: endpointsTypes.UpdateWebhookBody = req.body;
    const { id } = req.user;

    const token = redisKeyFormatter(`monobank-${id}-update-webhook`);
    const tempToken = await redisClient.get(token);

    if (tempToken !== 'true') {
      await monobankUsersService.updateUser({
        systemUserId: id,
        clientId,
        webHookUrl: `${hostWebhooksCallback}${API_PREFIX}/banks/monobank/webhook`,
      });

      // TODO: why here we don't pass userToken?
      await updateWebhookAxios();

      await redisClient.set(token, 'true');
      await redisClient.expire(token, 60);

      return res.status(200).json({ status: API_RESPONSE_STATUS.success });
    }

    return res.status(ERROR_CODES.TooManyRequests).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Too many requests! Request cannot be called more that once a minute!',
      },
    });
  } catch (err) {
    return res.status(500).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Unexpected error.',
        code: API_ERROR_CODES.unexpected,
      },
    });
  }
};

export const loadTransactions = async (req, res: CustomResponse) => {
  try {
    const { from, to, accountId }: endpointsTypes.LoadMonoTransactionsQuery = req.query;
    const { id: systemUserId } = req.user;

    if (!from || !Number(from)) throw new ValidationError({ message: '"from" field is invalid' });
    if (!to || !Number(to)) throw new ValidationError({ message: '"to" field is invalid' });
    if (!accountId) throw new ValidationError({ message: '"accountId" field is required' });

    const redisToken = redisKeyFormatter(`monobank-${systemUserId}-load-transactions`);
    const tempRedisToken = await redisClient.get(redisToken);

    if (tempRedisToken === 'true') {
      return res.status(ERROR_CODES.TooManyRequests).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message:
            'There were too many requests earlier. Please wait at least one minute from when you first saw this message.',
          code: API_ERROR_CODES.tooManyRequests,
        },
      });
    }

    const monobankUser = await monobankUsersService.getUserBySystemId({
      systemUserId,
    });

    if (!monobankUser) {
      return res.status(ERROR_CODES.NotFoundError).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Monobank user does not exist.',
          code: API_ERROR_CODES.notFound,
        },
      });
    }

    // Check mono account exist
    const account = await accountsService.getAccountById({
      id: Number(accountId),
      userId: Number(systemUserId),
    });

    if (!account) {
      return res.status(ERROR_CODES.NotFoundError).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Monobank account does not exist.',
          code: API_ERROR_CODES.notFound,
        },
      });
    }

    // Check is there already created query for data retrieve
    const existQuery = usersQuery.get(`query-${systemUserId}`);

    if (existQuery) {
      logger.error('[Monobank controller]: Query already exists');

      return res.status(ERROR_CODES.TooManyRequests).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: `
            Query already exist and should be fulfilled first. Number of left
            requests is ${existQuery.size}. Try to request a bit later
            (approximately in ${existQuery.size} minutes, since each request
            will take about 60 seconds)
          `,
          code: API_ERROR_CODES.tooManyRequests,
        },
      });
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
            await redisClient.set(redisToken, 'true');
            await redisClient.expire(redisToken, 60);
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

    return res.status(200).json<endpointsTypes.LoadMonoTransactionsResponse>({
      status: API_RESPONSE_STATUS.success,
      response: {
        minutesToFinish: months.length - 1,
      },
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const refreshAccounts = async (req, res) => {
  const { id: systemUserId } = req.user;

  return connection.sequelize.transaction(async () => {
    try {
      const monoUser = await monobankUsersService.getUserBySystemId({
        systemUserId,
      });

      if (!monoUser) {
        return res.status(ERROR_CODES.NotFoundError).json({
          status: API_RESPONSE_STATUS.error,
          response: {
            message: 'Current user does not have any paired monobank user.',
            code: API_ERROR_CODES.monobankUserNotPaired,
          },
        });
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

              return res.status(403).json({
                status: API_RESPONSE_STATUS.error,
                response: {
                  code: API_ERROR_CODES.monobankTokenInvalid,
                  message: "User's token is invalid!",
                },
              });
            }
          }
          return res.status(500).json({
            status: API_RESPONSE_STATUS.error,
            response: {
              message: 'Something bad happened while trying to contact Monobank!',
            },
          });
        }

        await redisClient.set(token, 'true');
        await redisClient.expire(token, 60);

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

        return res.status(200).json({
          status: API_RESPONSE_STATUS.success,
          response: accounts,
        });
      }

      return res.status(ERROR_CODES.TooManyRequests).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          code: API_ERROR_CODES.tooManyRequests,
          message: 'Too many requests! Request cannot be called more that once a minute!',
        },
      });
    } catch (err) {
      errorHandler(res, err as Error);
    }
  });
};
