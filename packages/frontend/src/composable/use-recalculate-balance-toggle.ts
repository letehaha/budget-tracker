import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { i18n } from '@/i18n';
import { captureException } from '@/lib/sentry';
import { computed, ref } from 'vue';

/**
 * Owns the "recalculate account balances" checkbox both import wizards render on
 * their review step. The checkbox follows the persisted
 * `import.recalculateAccountBalance` user setting until the user toggles it, and
 * the chosen value is written back after a successful execute so the next import
 * remembers it.
 *
 * @param sentryScope Scope string stamped on the Sentry report when persisting
 *   the setting fails, so each wizard's failures stay distinguishable.
 */
export const useRecalculateBalanceToggle = ({ sentryScope }: { sentryScope: string }) => {
  const userSettings = useUserSettings();

  /** Persisted default for the balance-recalculation checkbox. Off when unset. */
  const persistedRecalculateBalance = computed(
    () => userSettings.data.value?.import?.recalculateAccountBalance ?? false,
  );

  /** The user's explicit checkbox choice for this wizard run; null = untouched,
   *  keep following the persisted setting (which may still be loading). */
  const recalculateBalanceOverride = ref<boolean | null>(null);

  /**
   * Whether execute should move linked-account balances by the imported rows
   * (backfill rows older than an account's latest transaction never move it).
   * Reads the persisted `import.recalculateAccountBalance` user setting until
   * the checkbox is toggled; a late-arriving settings load never clobbers an
   * explicit user toggle.
   */
  const recalculateBalance = computed<boolean>({
    get: () => recalculateBalanceOverride.value ?? persistedRecalculateBalance.value,
    set: (value) => {
      recalculateBalanceOverride.value = value;
    },
  });

  /**
   * True while the persisted setting is still loading for the first time and
   * the user has not toggled the checkbox yet. An explicit user toggle makes
   * the load state irrelevant — the checkbox already carries the user's intent.
   * Wizards disable the checkbox while this holds so the shown "off" is not
   * mistaken for a resolved preference.
   */
  const settingsLoading = computed<boolean>(
    () => recalculateBalanceOverride.value === null && userSettings.isLoading.value,
  );

  /**
   * True when the persisted setting failed to load and the user has not toggled
   * the checkbox. The value falls back to off; wizards surface a non-blocking
   * hint so the user knows their saved preference was not applied.
   */
  const settingsLoadFailed = computed<boolean>(
    () => recalculateBalanceOverride.value === null && userSettings.isError.value,
  );

  /**
   * Writes the checkbox value to user settings when it differs from the stored
   * one. Fire-and-forget: the import job is already accepted by this point, so
   * a failed write must never block or fail the import — it is reported to
   * Sentry and surfaced as a non-blocking error toast instead.
   */
  const persistRecalculateBalanceSetting = () => {
    if (recalculateBalance.value === persistedRecalculateBalance.value) return;
    userSettings.patchAsync({ import: { recalculateAccountBalance: recalculateBalance.value } }).catch((error) => {
      captureException({ error, context: { scope: sentryScope } });
      useNotificationCenter().addErrorNotification(i18n.global.t('errors.api.unexpectedError'));
    });
  };

  /** Returns the checkbox to following the persisted setting (wizard reset). */
  const resetOverride = () => {
    recalculateBalanceOverride.value = null;
  };

  return { recalculateBalance, settingsLoading, settingsLoadFailed, persistRecalculateBalanceSetting, resetOverride };
};
