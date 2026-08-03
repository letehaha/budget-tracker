<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { useDateLocale } from '@/composable/use-date-locale';
import { useScrollMemory } from '@/composable/use-scroll-memory';
import { ChevronRightIcon, HistoryIcon, Loader2Icon, TriangleAlertIcon } from '@lucide/vue';
import { useIntersectionObserver } from '@vueuse/core';
import { ref } from 'vue';

import { CATEGORIZATION_TRIGGER } from '@bt/shared/types';

import { RUN_DATE_FORMAT } from '../run-date-format';
import { useCategorizationHistory } from '../use-categorization-history';
import RunTransactions from './run-transactions.vue';

const SKELETON_ROW_COUNT = 6;

const props = defineProps<{ isMobileMode: boolean; openedRunAt: string | null }>();

const emit = defineEmits<{ 'open-run': [{ categorizedAt: string }]; back: [] }>();

const { format } = useDateLocale();
const { runs, isFetched, isLoadingError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
  useCategorizationHistory();

const formatRunDate = ({ categorizedAt }: { categorizedAt: string }) => format(categorizedAt, RUN_DATE_FORMAT);

const TRIGGER_BADGE_CLASSES: Record<CATEGORIZATION_TRIGGER, string> = {
  [CATEGORIZATION_TRIGGER.manual]: 'bg-loan-student/15 text-loan-student',
  [CATEGORIZATION_TRIGGER.import]: 'bg-loan-auto/15 text-loan-auto',
  [CATEGORIZATION_TRIGGER.sync]: 'bg-loan-personal/15 text-loan-personal',
};
const UNKNOWN_TRIGGER_BADGE_CLASSES = 'bg-loan-other/15 text-loan-other';

const triggerBadgeClasses = ({ trigger }: { trigger: CATEGORIZATION_TRIGGER | null }) =>
  trigger ? TRIGGER_BADGE_CLASSES[trigger] : UNKNOWN_TRIGGER_BADGE_CLASSES;

// The ScrollArea clips the sentinel, so the default viewport root still only
// reports it intersecting once it is scrolled into the visible list area.
const sentinelRef = ref<HTMLElement | null>(null);
useIntersectionObserver(sentinelRef, ([entry]) => {
  if (entry?.isIntersecting && hasNextPage.value && !isFetchingNextPage.value) fetchNextPage();
});

// Opening a run unmounts the list; the rows come back from the vue-query cache,
// the scroll offset comes back from here.
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);
useScrollMemory({
  element: () => scrollAreaRef.value?.viewportRef?.viewportElement ?? null,
  isAway: () => props.openedRunAt,
});
</script>

<template>
  <RunTransactions
    v-if="openedRunAt"
    :categorized-at="openedRunAt"
    :is-mobile-mode="isMobileMode"
    @back="emit('back')"
  />

  <Card v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div v-if="isLoadingError" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <TriangleAlertIcon class="text-destructive-text size-8" />
      <p class="text-destructive-text text-sm">{{ $t('optimizations.aiCategorization.history.loadError') }}</p>
      <Button variant="outline" size="sm" @click="refetch()">{{ $t('common.actions.retry') }}</Button>
    </div>

    <div v-else-if="!isFetched" class="flex flex-col gap-2 p-3">
      <div v-for="index in SKELETON_ROW_COUNT" :key="index" class="bg-muted h-14 animate-pulse rounded-md" />
    </div>

    <div v-else-if="runs.length === 0" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div class="bg-muted flex size-12 items-center justify-center rounded-full">
        <HistoryIcon class="text-muted-foreground size-6" />
      </div>
      <p class="font-medium">{{ $t('optimizations.aiCategorization.history.emptyTitle') }}</p>
      <p class="text-muted-foreground max-w-sm text-sm">
        {{ $t('optimizations.aiCategorization.history.emptyDescription') }}
      </p>
    </div>

    <ScrollArea v-else ref="scrollAreaRef" class="min-h-0 flex-1">
      <ul class="divide-y">
        <li v-for="run in runs" :key="run.categorizedAt">
          <Button
            variant="ghost"
            class="h-auto w-full justify-between gap-3 rounded-none px-4 py-3"
            @click="emit('open-run', { categorizedAt: run.categorizedAt })"
          >
            <span class="flex min-w-0 flex-col items-start gap-0.5">
              <span class="flex max-w-full min-w-0 items-center gap-2">
                <span class="min-w-0 truncate text-sm font-medium">
                  {{ formatRunDate({ categorizedAt: run.categorizedAt }) }}
                </span>
                <ResponsiveTooltip
                  content-class-name="max-w-60"
                  :content="$t(`optimizations.aiCategorization.history.triggerTooltip.${run.trigger ?? 'unknown'}`)"
                >
                  <!-- click.stop: on touch the tap opens the tooltip popover and must not
                       also open the run; the rest of the row still does. -->
                  <span
                    :class="['shrink-0 rounded px-1.5 py-0.5 text-xs', triggerBadgeClasses({ trigger: run.trigger })]"
                    @click.stop
                  >
                    {{ $t(`optimizations.aiCategorization.history.trigger.${run.trigger ?? 'unknown'}`) }}
                  </span>
                </ResponsiveTooltip>
              </span>
              <span class="text-muted-foreground text-xs tabular-nums">
                {{
                  $t(
                    'optimizations.aiCategorization.history.transactionCount',
                    { count: run.transactionCount.toLocaleString() },
                    run.transactionCount,
                  )
                }}
              </span>
            </span>
            <ChevronRightIcon class="text-muted-foreground size-4 shrink-0" />
          </Button>
        </li>
      </ul>

      <div v-if="hasNextPage" ref="sentinelRef" class="flex justify-center p-3">
        <Loader2Icon v-if="isFetchingNextPage" class="text-muted-foreground size-4 animate-spin" />
      </div>
    </ScrollArea>
  </Card>
</template>
