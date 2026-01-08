import { API_ERROR_CODES, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
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
      from: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), { message: t({ key: 'bankDataProviders.fromMustBeValidDate' }) }),
      to: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), { message: t({ key: 'bankDataProviders.toMustBeValidDate' }) }),
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
        message: t({ key: 'errors.connectionNotFound' }),
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
        message: t({ key: 'bankDataProviders.accountNotLinkedToConnection' }),
        code: API_ERROR_CODES.notFound,
      });
    }

    // Check if account was linked using forward-only strategy and block historical loads before linkedAt
    const accountExternalData = account.externalData || {};
    const bankConnectionMetadata = accountExternalData.bankConnection;

    if (bankConnectionMetadata?.linkedAt && bankConnectionMetadata?.linkingStrategy === 'forward-only') {
      const linkedAt = new Date(bankConnectionMetadata.linkedAt);
      const requestedFrom = new Date(from);

      if (requestedFrom < linkedAt) {
        throw new ValidationError({
          message: t({
            key: 'bankDataProviders.cannotLoadBeforeLinkDate',
            variables: { linkedAt: linkedAt.toISOString() },
          }),
        });
      }
    }

    // Validate date range (max 1 year)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const oneYearInMs = 365 * 24 * 60 * 60 * 1000;

    if (toDate.getTime() - fromDate.getTime() > oneYearInMs) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.dateRangeExceedsLimit' }),
      });
    }

    if (fromDate > toDate) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.fromAfterTo' }),
      });
    }

    // Get provider - currently only Monobank supports this feature
    const provider = bankProviderRegistry.get(connection.providerType);

    if (connection.providerType !== BANK_PROVIDER_TYPE.MONOBANK) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.onlySupportedForMonobank' }),
      });
    }

    // Call the loadTransactionsForPeriod method
    const monobankProvider = provider as MonobankProvider;
    const result = await monobankProvider.loadTransactionsForPeriod({
      connectionId,
      systemAccountId: accountId,
      userId: user.id,
      from: fromDate,
      to: toDate,
    });

    return {
      data: {
        jobGroupId: result.jobGroupId,
        totalBatches: result.totalBatches,
        estimatedMinutes: result.estimatedMinutes,
        message: t({
          key: 'bankDataProviders.transactionLoadingQueued',
          variables: { minutes: result.estimatedMinutes },
        }),
      },
    };
  },
);
