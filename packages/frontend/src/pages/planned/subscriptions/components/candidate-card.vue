<script setup lang="ts">
import type { SubscriptionCandidate } from '@/api/subscription-candidates';
import Button from '@/components/lib/ui/button/Button.vue';
import { useFormatCurrency } from '@/composable/formatters';
import { CheckIcon, LinkIcon, RepeatIcon, XIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

import { formatFrequency } from '../utils';
import SubscriptionServiceLogo from './subscription-service-logo.vue';

defineProps<{
  candidate: SubscriptionCandidate;
  isAccepting?: boolean;
  isDismissing?: boolean;
  isLinking?: boolean;
}>();

const emit = defineEmits<{
  accept: [candidate: SubscriptionCandidate];
  dismiss: [candidate: SubscriptionCandidate];
  link: [candidate: SubscriptionCandidate];
  'view-transactions': [transactionIds: number[]];
}>();

const { t } = useI18n();
const { formatAmountByCurrencyCode } = useFormatCurrency();
</script>

<template>
  <div class="border-border flex flex-col gap-3 rounded-lg border p-4">
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-start gap-2.5">
        <SubscriptionServiceLogo :name="candidate.suggestedName" class="mt-0.5 size-8" size="md" />
        <div class="min-w-0">
          <h4 class="truncate font-medium">{{ candidate.suggestedName }}</h4>
          <div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span class="text-foreground font-medium">
              {{ formatAmountByCurrencyCode(candidate.averageAmount, candidate.currencyCode) }}
            </span>
            <span class="flex items-center gap-1">
              <RepeatIcon class="size-3.5" />
              {{ formatFrequency({ frequency: candidate.detectedFrequency, t }) }}
            </span>
            <button
              v-if="candidate.sampleTransactionIds.length"
              class="hover:text-foreground cursor-pointer underline decoration-dotted underline-offset-2"
              :title="t('planned.subscriptions.candidates.viewTransactions')"
              @click.stop="emit('view-transactions', candidate.sampleTransactionIds)"
            >
              {{ t('planned.subscriptions.candidates.occurrences', { count: candidate.occurrenceCount }) }}
            </button>
            <span v-else>
              {{ t('planned.subscriptions.candidates.occurrences', { count: candidate.occurrenceCount }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Confidence indicator -->
      <div
        class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          candidate.confidenceScore >= 0.7
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : candidate.confidenceScore >= 0.4
              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
        "
      >
        {{ Math.round(candidate.confidenceScore * 100) }}%
      </div>
    </div>

    <!-- Possible match indicator -->
    <div
      v-if="candidate.possibleMatch"
      class="flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
    >
      <LinkIcon class="size-3 shrink-0" />
      {{ t('planned.subscriptions.candidates.possibleMatch', { name: candidate.possibleMatch.name }) }}
    </div>

    <div class="flex gap-2">
      <!-- Link to existing (shown when there's a possible match) -->
      <Button
        v-if="candidate.possibleMatch"
        size="sm"
        class="flex-1"
        :disabled="isAccepting || isDismissing || isLinking"
        @click="emit('link', candidate)"
      >
        <LinkIcon class="mr-1 size-3.5" />
        {{ t('planned.subscriptions.candidates.linkToExisting') }}
      </Button>
      <Button
        :variant="candidate.possibleMatch ? 'outline' : 'default'"
        size="sm"
        class="flex-1"
        :disabled="isAccepting || isDismissing || isLinking"
        @click="emit('accept', candidate)"
      >
        <CheckIcon class="mr-1 size-3.5" />
        {{ t('planned.subscriptions.candidates.accept') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="flex-1"
        :disabled="isAccepting || isDismissing || isLinking"
        @click="emit('dismiss', candidate)"
      >
        <XIcon class="mr-1 size-3.5" />
        {{ t('planned.subscriptions.candidates.dismiss') }}
      </Button>
    </div>
  </div>
</template>
