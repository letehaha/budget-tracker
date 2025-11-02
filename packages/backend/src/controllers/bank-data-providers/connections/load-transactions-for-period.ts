import { API_ERROR_CODES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { BankProviderType } from '@root/services/bank-data-providers';
import { MonobankProvider } from '@root/services/bank-data-providers/monobank/monobank.provider';
import { bankProviderRegistry } from '@root/services/bank-data-providers/registry';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: recordId(),
    }),
    body: z.object({
      accountId: recordId(),
      from: z.string().refine((val) => !isNaN(Date.parse(val)), { message: '"from" must be a valid date string' }),
      to: z.string().refine((val) => !isNaN(Date.parse(val)), { message: '"to" must be a valid date string' }),
    }),
  }),
  async ({ user, params, body }) => {
    const { connectionId } = params;
    const { accountId, from, to } = body;

    // Verify connection belongs to user
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: connectionId,
        userId: user.id,
      },
    });

    if (!connection) {
      throw new NotFoundError({
        message: 'Connection not found',
        code: API_ERROR_CODES.notFound,
      });
    }

    // Verify account belongs to user and is linked to this connection
    const account = await Accounts.findOne({
      where: {
        id: accountId,
        userId: user.id,
        bankDataProviderConnectionId: connectionId,
      },
    });

    if (!account) {
      throw new NotFoundError({
        message: 'Account not found or not linked to this connection',
        code: API_ERROR_CODES.notFound,
      });
    }

    // Validate date range (max 1 year)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const oneYearInMs = 365 * 24 * 60 * 60 * 1000;

    if (toDate.getTime() - fromDate.getTime() > oneYearInMs) {
      return {
        statusCode: 400,
        data: {
          message: 'Date range cannot exceed 1 year',
          code: API_ERROR_CODES.BadRequest,
        },
      };
    }

    if (fromDate > toDate) {
      return {
        statusCode: 400,
        data: {
          message: '"from" date must be before "to" date',
          code: API_ERROR_CODES.BadRequest,
        },
      };
    }

    // Get provider - currently only Monobank supports this feature
    const provider = bankProviderRegistry.get(connection.providerType);

    if (connection.providerType !== BankProviderType.MONOBANK) {
      return {
        statusCode: 400,
        data: {
          message: 'Loading transactions for period is only supported for Monobank',
          code: API_ERROR_CODES.BadRequest,
        },
      };
    }

    // Call the loadTransactionsForPeriod method
    const monobankProvider = provider as MonobankProvider;
    const result = await monobankProvider.loadTransactionsForPeriod({
      connectionId,
      systemAccountId: accountId,
      from: fromDate,
      to: toDate,
    });

    return {
      data: {
        jobGroupId: result.jobGroupId,
        totalBatches: result.totalBatches,
        estimatedMinutes: result.estimatedMinutes,
        message: `Transaction loading queued. Estimated time: ${result.estimatedMinutes} minute(s)`,
      },
    };
  },
);
