import { archiveBudget as archiveBudgetApi } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { useActionFeedback } from '@/composable/use-action-feedback';
import { BUDGET_STATUSES } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-vue-next';
import { type Ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

export function useArchiveToggle({ budgetData, budgetId }: { budgetData: Ref; budgetId: Ref<number> }) {
  const queryClient = useQueryClient();
  const { addErrorNotification } = useNotificationCenter();
  const { t } = useI18n();

  const feedback = useActionFeedback();

  const isBudgetArchived = computed(() => budgetData.value?.status === BUDGET_STATUSES.archived);

  const { mutate: toggleArchive } = useMutation({
    mutationFn: archiveBudgetApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, budgetId.value] });

      feedback.trigger({ type: 'success' });
    },
    onError: () => {
      addErrorNotification(t('budgets.list.archiveError'));
      feedback.trigger({ type: 'error' });
    },
  });

  const handleToggleArchive = () => {
    toggleArchive({ budgetId: budgetId.value, isArchived: !isBudgetArchived.value });
  };

  const archiveButtonIcon = computed(() => {
    if (feedback.isActive.value) return feedback.feedbackIcon.value;
    return isBudgetArchived.value ? ArchiveRestoreIcon : ArchiveIcon;
  });

  const archiveButtonLabel = computed(() => {
    if (feedback.type.value === 'success') {
      return isBudgetArchived.value ? t('budgets.list.archived') : t('budgets.list.unarchived');
    }
    if (feedback.type.value === 'error') return t('budgets.list.archiveFailed');
    return isBudgetArchived.value ? t('budgets.list.unarchive') : t('budgets.list.archive');
  });

  const archiveButtonVariant = computed(() => {
    if (feedback.isActive.value) return feedback.buttonVariant.value;
    return 'outline' as const;
  });

  return {
    isBudgetArchived,
    handleToggleArchive,
    archiveButtonIcon,
    archiveButtonLabel,
    archiveButtonVariant,
    hasFeedback: feedback.isActive,
  };
}
