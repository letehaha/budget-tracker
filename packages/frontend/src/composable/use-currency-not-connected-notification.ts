import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { isApiErrorWithCode } from '@/js/errors';
import { API_ERROR_CODES, type CurrencyNotConnectedDetails } from '@bt/shared/types';
import { type Ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Fixed id so every consumer of the subscriptions summary (page + dashboard
// widget) dedupes into a single notification.
const NOTIFICATION_ID = 'subscriptions-summary-currency-not-connected';

/**
 * Watches a subscriptions-summary query error and raises a persistent
 * notification when the backend refuses the summary with
 * CURRENCY_NOT_CONNECTED, naming the currencies the user has to connect in
 * Settings → Currencies. Persistent because the summary stays broken until the
 * user acts — an auto-hiding toast would vanish before they can read the fix.
 */
export const useCurrencyNotConnectedNotification = ({ error }: { error: Ref<unknown> }) => {
  const { t } = useI18n();
  const { addNotification } = useNotificationCenter();

  watch(
    error,
    (err) => {
      if (!isApiErrorWithCode(err, API_ERROR_CODES.currencyNotConnected)) return;
      const details = err.data.details as CurrencyNotConnectedDetails | undefined;
      const currencies = details?.currencyCodes?.join(', ') ?? '';
      addNotification({
        id: NOTIFICATION_ID,
        persistent: true,
        type: NotificationType.error,
        text: t('common.notifications.subscriptionCurrencyNotConnected', { currencies }),
      });
    },
    { immediate: true },
  );
};
