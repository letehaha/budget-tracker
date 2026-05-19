<script setup lang="ts">
import { searchSecurities } from '@/api/securities';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import InputField from '@/components/fields/input-field.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import FeedbackDialog from '@/components/sidebar/feedback-dialog.vue';
import { useCreateHolding } from '@/composable/data-queries/holdings';
import { cn } from '@/lib/utils';
import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { useQuery } from '@tanstack/vue-query';
import { AlertTriangleIcon, CheckCheckIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ portfolioId: string }>();
const emit = defineEmits(['updated']);

const isOpen = ref(false);
const isFeedbackOpen = ref(false);
const tooltipKey = ref(0);
const searchTerm = ref('');

const openFeedback = () => {
  // Force-remount the tooltip so it dismisses immediately instead of lingering
  // over the feedback dialog until the cursor moves.
  tooltipKey.value += 1;
  isFeedbackOpen.value = true;
};

const debounced = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchTerm, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounced.value = v.trim();
  }, 300);
});

const key = computed(() => ['sec-search', debounced.value, props.portfolioId] as const);

const query = useQuery({
  queryKey: key,
  queryFn: () => searchSecurities(debounced.value, props.portfolioId),
  enabled: () => debounced.value.length >= 1,
});

const createHolding = useCreateHolding();
const { addNotification } = useNotificationCenter();

async function addSymbol(sec: SecuritySearchResult) {
  try {
    await createHolding.mutateAsync({
      portfolioId: props.portfolioId,
      searchResult: sec,
      quantity: 0,
      costBasis: 0,
    });
    addNotification({ text: t('dialogs.addSymbols.notifications.success'), type: NotificationType.success });
    isOpen.value = false;
    searchTerm.value = '';
    emit('updated');
  } catch {
    addNotification({ text: t('dialogs.addSymbols.notifications.error'), type: NotificationType.error });
  }
}
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      <span class="inline-flex items-center gap-2">
        {{ $t('dialogs.addSymbols.title') }}

        <ResponsiveTooltip :key="tooltipKey" content-class-name="max-w-72" :delay-duration="100">
          <AlertTriangleIcon class="text-warning size-4 cursor-help" />
          <template #content>
            <i18n-t keypath="dialogs.createPortfolio.assetSupportNotice" tag="p">
              <template #roadmapLink>
                <a
                  href="https://moneymatter.featurebase.app/dashboard/roadmap"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium underline underline-offset-2 hover:no-underline"
                >
                  {{ $t('dialogs.createPortfolio.assetSupportRoadmapLink') }}
                </a>
              </template>
              <template #feedbackLink>
                <button
                  type="button"
                  class="font-medium underline underline-offset-2 hover:no-underline"
                  @click="openFeedback"
                >
                  {{ $t('dialogs.createPortfolio.assetSupportFeedbackLink') }}
                </button>
              </template>
            </i18n-t>
          </template>
        </ResponsiveTooltip>

        <FeedbackDialog v-model:open="isFeedbackOpen" triggerless default-type="feature_request" />
      </span>
    </template>

    <template #default>
      <div class="grid gap-4">
        <InputField
          v-model="searchTerm"
          :label="$t('dialogs.addSymbols.searchLabel')"
          :placeholder="$t('dialogs.addSymbols.searchPlaceholder')"
          class="max-w-[calc(100%-50px)]"
        />

        <div v-if="query.isLoading.value" class="text-muted-foreground text-sm">
          {{ $t('dialogs.addSymbols.searching') }}
        </div>
        <div v-else-if="query.error.value" class="text-destructive-text text-sm">
          {{ $t('dialogs.addSymbols.searchError') }}
        </div>
        <div v-else>
          <ul class="max-h-60 overflow-y-auto">
            <li
              v-for="sec in query.data.value || []"
              :key="sec.symbol"
              :class="
                cn(
                  'grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 px-2 py-1',
                  sec.isInPortfolio ? 'cursor-not-allowed opacity-80' : 'hover:bg-muted/40 cursor-pointer',
                )
              "
              @click="!sec.isInPortfolio && addSymbol(sec)"
            >
              <span class="flex items-center gap-2 font-medium">
                <span v-if="sec.isInPortfolio" class="text-muted-foreground text-xs">
                  <CheckCheckIcon class="text-success-text size-3" />
                </span>

                {{ sec.symbol }}
              </span>

              <span class="text-muted-foreground truncate text-xs">
                {{ sec.name }}

                <span v-if="sec.isInPortfolio"> {{ $t('dialogs.addSymbols.addedIndicator') }} </span>
              </span>

              <span class="text-muted-foreground text-right text-xs">{{ sec.exchangeName }}</span>

              <span class="text-muted-foreground text-right text-xs">{{ sec.currencyCode.toUpperCase() }}</span>
            </li>
          </ul>
          <div v-if="debounced && (query.data.value?.length ?? 0) === 0" class="text-muted-foreground text-sm">
            {{ $t('dialogs.addSymbols.noResults') }}
          </div>
        </div>
      </div>
    </template>
  </ResponsiveDialog>
</template>
