import type { LoanApi } from '@/api/loans';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { captureException } from '@/lib/sentry';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Restores an archived loan to `active` status and syncs every place the loan is rendered
 * (loans list, loan detail, shared accounts store). Shared by the actions menu, the archived
 * list row and the detail-page banner so they can't drift apart in behavior.
 */
export const useUnarchiveLoan = () => {
  const { t } = useI18n();
  const { addNotification } = useNotificationCenter();
  const accountsStore = useAccountsStore();
  const queryClient = useQueryClient();

  const isPending = ref(false);

  const unarchive = async ({ loan }: { loan: LoanApi }) => {
    isPending.value = true;
    try {
      // Restore also clears excludeFromStats: archive auto-enables it (dialog checkbox, default on),
      // and a loan whose tracking just resumed should count in stats again. The flag carries no
      // set-by-archive-vs-user provenance, so a manually-set flag is cleared too — re-enable it
      // from the actions menu if the loan should stay out of stats.
      await accountsStore.editAccount({ id: loan.id, status: ACCOUNT_STATUSES.active, excludeFromStats: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.loansList }),
        queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.loanDetail, loan.id] }),
      ]);
      addNotification({ text: t('loans.settings.unarchiveSuccess'), type: NotificationType.success });
    } catch (error) {
      addNotification({ text: t('loans.settings.archiveError'), type: NotificationType.error });
      captureException({ error, context: { source: 'loanSettings.unarchive' } });
    } finally {
      isPending.value = false;
    }
  };

  return { unarchive, isPending };
};
