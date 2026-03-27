<template>
  <div class="flex flex-col gap-6 p-4 md:p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ $t('optimizations.tagSuggestions.title') }}
        </h1>
        <p class="text-muted-foreground mt-1 text-sm">
          {{ $t('optimizations.tagSuggestions.description') }}
        </p>
      </div>

      <div v-if="suggestions.length > 0" class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="bulkRejectMutation.isPending.value"
          :loading="bulkRejectMutation.isPending.value"
          @click="handleBulkReject"
        >
          {{ $t('optimizations.tagSuggestions.rejectAll') }}
        </Button>
        <Button
          size="sm"
          :disabled="bulkApproveMutation.isPending.value"
          :loading="bulkApproveMutation.isPending.value"
          @click="handleBulkApprove"
        >
          {{ $t('optimizations.tagSuggestions.approveAll') }}
        </Button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="space-y-4">
      <Card v-for="i in 3" :key="i" class="p-4">
        <div class="mb-3 flex items-center gap-3">
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="bg-muted h-5 w-48 animate-pulse rounded" />
            <div class="bg-muted h-3.5 w-32 animate-pulse rounded" />
          </div>
        </div>
        <div class="space-y-2">
          <div v-for="j in 2" :key="j" class="bg-muted/50 flex items-center gap-3 rounded-lg p-2.5">
            <div class="bg-muted size-6 animate-pulse rounded-full" />
            <div class="bg-muted h-4 w-24 animate-pulse rounded" />
          </div>
        </div>
      </Card>
    </div>

    <!-- Empty state -->
    <div v-else-if="suggestions.length === 0" class="flex flex-col items-center gap-3 py-12">
      <TagsIcon class="text-muted-foreground size-12" />
      <h3 class="text-lg font-semibold">{{ $t('optimizations.tagSuggestions.emptyTitle') }}</h3>
      <p class="text-muted-foreground text-sm">{{ $t('optimizations.tagSuggestions.emptyDescription') }}</p>
    </div>

    <!-- Suggestions grouped by transaction -->
    <div v-else class="space-y-4">
      <Card v-for="group in suggestions" :key="group.transaction.id" class="p-4">
        <div class="mb-3 flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ group.transaction.note || $t('common.noDescription') }}</p>
            <p class="text-muted-foreground text-xs">
              {{ formatDate(new Date(group.transaction.time), 'MMM d, yyyy') }}
              &middot;
              {{ formatAmountByCurrencyCode(group.transaction.amount, group.transaction.currencyCode) }}
            </p>
          </div>
        </div>

        <div class="space-y-2">
          <div
            v-for="suggestion in group.suggestions"
            :key="`${group.transaction.id}-${suggestion.tagId}`"
            class="bg-muted/50 flex items-center gap-3 rounded-lg p-2.5"
          >
            <div
              class="flex size-6 shrink-0 items-center justify-center rounded-full"
              :style="{ backgroundColor: suggestion.tag.color }"
            >
              <TagIcon v-if="suggestion.tag.icon" :name="suggestion.tag.icon" class="size-3 text-white" />
            </div>
            <span class="flex-1 text-sm font-medium">{{ suggestion.tag.name }}</span>
            <span
              class="text-muted-foreground text-xs"
              :class="suggestion.source === 'code' ? 'text-primary' : 'text-warning-text'"
            >
              {{ suggestion.source === 'code' ? $t('settings.tags.ruleTypeCode') : $t('settings.tags.ruleTypeAi') }}
            </span>
            <div class="flex gap-1">
              <DesktopOnlyTooltip :content="$t('optimizations.tagSuggestions.reject')">
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  :disabled="isMutating"
                  @click="handleReject(group.transaction.id, suggestion.tagId)"
                >
                  <XIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('optimizations.tagSuggestions.approve')">
                <Button
                  variant="ghost-success"
                  size="icon-sm"
                  :disabled="isMutating"
                  @click="handleApprove(group.transaction.id, suggestion.tagId)"
                >
                  <CheckIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import TagIcon from '@/components/common/icons/tag-icon.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import {
  loadTagSuggestions,
  approveTagSuggestion,
  rejectTagSuggestion,
  bulkApproveTagSuggestions,
  bulkRejectTagSuggestions,
} from '@/api/tag-suggestions';
import { useQuery, useQueryClient, useMutation } from '@tanstack/vue-query';
import { CheckIcon, TagsIcon, XIcon } from 'lucide-vue-next';
import { format as formatDate } from 'date-fns';
import { computed } from 'vue';

defineOptions({
  name: 'optimizations-tag-suggestions',
});

const queryClient = useQueryClient();
const { addSuccessNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const { data: suggestionsData, isLoading } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.tagSuggestions,
  queryFn: () => loadTagSuggestions(),
});
const suggestions = computed(() => suggestionsData.value ?? []);

const invalidateQueries = () => {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.tagSuggestions });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.tagSuggestionsCount });
};

const approveMutation = useMutation({
  mutationFn: approveTagSuggestion,
  onSuccess: () => {
    invalidateQueries();
    addSuccessNotification('Tag applied');
  },
  onError: () => {
    invalidateQueries();
  },
});

const rejectMutation = useMutation({
  mutationFn: rejectTagSuggestion,
  onSuccess: () => {
    invalidateQueries();
  },
  onError: () => {
    invalidateQueries();
  },
});

const handleApprove = (transactionId: number, tagId: number) => {
  approveMutation.mutate({ transactionId, tagId });
};

const handleReject = (transactionId: number, tagId: number) => {
  rejectMutation.mutate({ transactionId, tagId });
};

const bulkApproveMutation = useMutation({
  mutationFn: bulkApproveTagSuggestions,
  onSuccess: (result) => {
    invalidateQueries();
    addSuccessNotification(`${result.approvedCount} tags applied`);
  },
  onError: () => {
    invalidateQueries();
  },
});

const bulkRejectMutation = useMutation({
  mutationFn: bulkRejectTagSuggestions,
  onSuccess: () => {
    invalidateQueries();
  },
  onError: () => {
    invalidateQueries();
  },
});

const isMutating = computed(
  () =>
    approveMutation.isPending.value ||
    rejectMutation.isPending.value ||
    bulkApproveMutation.isPending.value ||
    bulkRejectMutation.isPending.value,
);

const handleBulkApprove = () => {
  const items = suggestions.value.flatMap((group) =>
    group.suggestions.map((s) => ({ transactionId: group.transaction.id, tagId: s.tagId })),
  );
  bulkApproveMutation.mutate({ items });
};

const handleBulkReject = () => {
  const items = suggestions.value.flatMap((group) =>
    group.suggestions.map((s) => ({ transactionId: group.transaction.id, tagId: s.tagId })),
  );
  bulkRejectMutation.mutate({ items });
};
</script>
