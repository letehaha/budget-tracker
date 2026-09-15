<template>
  <div
    v-if="banner"
    :class="
      cn(
        'flex items-center justify-center gap-2 border-b px-4 py-2 text-sm',
        banner.tone === 'warning' ? 'bg-warning-text/10 border-warning-text/20' : 'bg-primary/10 border-primary/20',
      )
    "
  >
    <AlertCircleIcon :class="cn('size-4 shrink-0', toneText)" />
    <i18n-t :keypath="banner.keypath" :plural="banner.plural" tag="span" :class="cn(toneText, 'opacity-90')">
      <template #link>
        <RouterLink
          :to="{ name: ROUTES_NAMES.settingsPlanBilling }"
          :class="cn('font-semibold underline underline-offset-2', toneText)"
        >
          {{ $t(banner.linkKey) }}
        </RouterLink>
      </template>
    </i18n-t>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { AlertCircleIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const { canSeeBilling, isReadOnly, isPastDue, hasSubscriptions, trialDaysLeft } = storeToRefs(useUserStore());

interface Banner {
  keypath: string;
  tone: 'warning' | 'primary';
  linkKey: string;
  plural?: number;
}

const banner = computed<Banner | null>(() => {
  // Every message here links to the plan page, so it has nothing to say where that page is hidden.
  if (!canSeeBilling.value) return null;
  if (isReadOnly.value)
    return {
      keypath: hasSubscriptions.value ? 'billing.banner.subscriptionEnded' : 'billing.banner.readOnly',
      tone: 'warning',
      linkKey: 'billing.seePlans',
    };
  if (isPastDue.value)
    return { keypath: 'billing.banner.pastDue', tone: 'warning', linkKey: 'billing.updatePaymentMethod' };
  if (trialDaysLeft.value !== null)
    return {
      keypath: 'billing.banner.trial',
      tone: 'primary',
      linkKey: 'billing.seePlans',
      plural: trialDaysLeft.value,
    };
  return null;
});

const toneText = computed(() => (banner.value?.tone === 'warning' ? 'text-warning-text' : 'text-primary-text'));
</script>
