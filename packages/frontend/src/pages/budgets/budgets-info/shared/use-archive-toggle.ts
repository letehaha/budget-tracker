import { archiveBudget as archiveBudgetApi } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { BUDGET_STATUSES } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ArchiveIcon, ArchiveRestoreIcon, CheckIcon, XIcon } from 'lucide-vue-next';
import { type Ref, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

type FeedbackState = 'archived' | 'unarchived' | 'error' | null;

const FEEDBACK_DISPLAY_DURATION = 2000;

export function useArchiveToggle({ budgetData, budgetId }: { budgetData: Ref; budgetId: Ref<number> }) {
  const queryClient = useQueryClient();
  const { addErrorNotification } = useNotificationCenter();
  const { t } = useI18n();

  const feedbackState = ref<FeedbackState>(null);
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  const setFeedback = (state: FeedbackState) => {
    feedbackState.value = state;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedbackState.value = null;
    }, FEEDBACK_DISPLAY_DURATION);
  };

  const isBudgetArchived = computed(() => budgetData.value?.status === BUDGET_STATUSES.archived);

  const { mutate: toggleArchive } = useMutation({
    mutationFn: archiveBudgetApi,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, budgetId.value] });

      setFeedback(variables.isArchived ? 'archived' : 'unarchived');
    },
    onError: () => {
      addErrorNotification(t('budgets.list.archiveError'));
      setFeedback('error');
    },
  });

  const handleToggleArchive = () => {
    toggleArchive({ budgetId: budgetId.value, isArchived: !isBudgetArchived.value });
  };

  const archiveButtonIcon = computed(() => {
    if (feedbackState.value === 'error') return XIcon;
    if (feedbackState.value) return CheckIcon;
    return isBudgetArchived.value ? ArchiveRestoreIcon : ArchiveIcon;
  });

  const archiveButtonLabel = computed(() => {
    if (feedbackState.value === 'archived') return t('budgets.list.archived');
    if (feedbackState.value === 'unarchived') return t('budgets.list.unarchived');
    if (feedbackState.value === 'error') return t('budgets.list.archiveFailed');
    return isBudgetArchived.value ? t('budgets.list.unarchive') : t('budgets.list.archive');
  });

  const archiveButtonVariant = computed(() => {
    if (feedbackState.value === 'error') return 'soft-destructive' as const;
    if (feedbackState.value) return 'outline-success' as const;
    return 'outline' as const;
  });

  const hasFeedback = computed(() => feedbackState.value !== null);

  return {
    isBudgetArchived,
    handleToggleArchive,
    archiveButtonIcon,
    archiveButtonLabel,
    archiveButtonVariant,
    hasFeedback,
  };
}
