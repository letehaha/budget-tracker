import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Budgets from '@models/Budget.model';
import Transactions from '@models/Transactions.model';
import UserSettings, {
  DEFAULT_ONBOARDING_STATE,
  DEFAULT_SETTINGS,
  type OnboardingStateSchema,
} from '@models/UserSettings.model';
import UsersCurrencies from '@models/UsersCurrencies.model';

import { withTransaction } from '../common/with-transaction';

/**
 * Get the current onboarding state for a user
 */
export const getOnboardingState = withTransaction(
  async ({ userId }: { userId: number }): Promise<OnboardingStateSchema> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    return userSettings?.settings?.onboarding ?? DEFAULT_ONBOARDING_STATE;
  },
);

/**
 * Update the onboarding state for a user
 */
export const updateOnboardingState = withTransaction(
  async ({
    userId,
    onboardingState,
  }: {
    userId: number;
    onboardingState: Partial<OnboardingStateSchema>;
  }): Promise<OnboardingStateSchema> => {
    const [settings, created] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: {
          ...DEFAULT_SETTINGS,
          onboarding: { ...DEFAULT_ONBOARDING_STATE, ...onboardingState },
        },
      },
    });

    if (!created) {
      const currentOnboarding = settings.settings.onboarding ?? DEFAULT_ONBOARDING_STATE;
      settings.settings = {
        ...settings.settings,
        onboarding: { ...currentOnboarding, ...onboardingState },
      };
      settings.changed('settings', true);
      await settings.save();
    }

    return settings.settings.onboarding ?? DEFAULT_ONBOARDING_STATE;
  },
);

/**
 * Mark a specific onboarding task as complete.
 * This is called from other services when user performs certain actions.
 */
export const markTaskComplete = withTransaction(
  async ({ userId, taskId }: { userId: number; taskId: string }): Promise<void> => {
    const [settings, created] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: {
          ...DEFAULT_SETTINGS,
          onboarding: {
            ...DEFAULT_ONBOARDING_STATE,
            completedTasks: [taskId],
          },
        },
      },
    });

    if (!created) {
      const currentOnboarding = settings.settings.onboarding ?? DEFAULT_ONBOARDING_STATE;
      const completedTasks = currentOnboarding.completedTasks ?? [];

      // Only add if not already completed
      if (!completedTasks.includes(taskId)) {
        settings.settings = {
          ...settings.settings,
          onboarding: {
            ...currentOnboarding,
            completedTasks: [...completedTasks, taskId],
          },
        };
        settings.changed('settings', true);
        await settings.save();
      }
    }
  },
);

/**
 * Auto-detect completed onboarding tasks based on user's data.
 * This queries the database to check if the user has completed certain actions.
 *
 * Note: Some tasks (create-category, create-tag) are NOT auto-detected here because
 * default categories/tags are assigned on registration. These are marked complete
 * when the user explicitly creates them via the API.
 */
export const detectCompletedTasks = withTransaction(async ({ userId }: { userId: number }): Promise<string[]> => {
  const completedTasks: string[] = [];

  // Run all checks in parallel for efficiency
  const [baseCurrency, accountCount, transactionCount, budgetCount, bankConnectionCount, userSettings] =
    await Promise.all([
      // Check if base currency is set
      UsersCurrencies.findOne({
        where: { userId, isDefaultCurrency: true },
        attributes: ['id'],
      }),

      // Check if user has created any accounts
      Accounts.count({ where: { userId } }),

      // Check if user has added any transactions
      Transactions.count({ where: { userId } }),

      // Check if user has created any budgets
      Budgets.count({ where: { userId } }),

      // Check if user has connected any bank accounts
      BankDataProviderConnections.count({ where: { userId } }),

      // Get user settings to check AI configuration
      UserSettings.findOne({
        where: { userId },
        attributes: ['settings'],
      }),
    ]);

  // Map results to task IDs
  if (baseCurrency) {
    completedTasks.push('set-base-currency');
  }

  if (accountCount > 0) {
    completedTasks.push('create-account');
  }

  if (transactionCount > 0) {
    completedTasks.push('add-transaction');
  }

  if (budgetCount > 0) {
    completedTasks.push('create-budget');
  }

  if (bankConnectionCount > 0) {
    completedTasks.push('connect-bank');
  }

  // Note: import-csv is NOT auto-detected because externalData is used for both
  // bank connections and imports. It's marked complete manually from the import stores.

  // Check if AI is configured (has API keys)
  const aiApiKeys = userSettings?.settings?.ai?.apiKeys;
  if (aiApiKeys && aiApiKeys.length > 0) {
    completedTasks.push('configure-ai');
  }

  return completedTasks;
});
