<template>
  <slot v-if="isAllowed" />
  <div v-else-if="overlay" class="relative">
    <div inert class="pointer-events-none opacity-40 blur-[2px] select-none">
      <slot />
    </div>
    <div class="absolute inset-0 flex items-center justify-center p-4">
      <div class="bg-card flex max-w-sm flex-col items-center gap-2 rounded-lg border p-5 text-center shadow-lg">
        <LockIcon class="text-primary-text size-6" />
        <p class="font-medium">{{ $t(`billing.planRequired.${requiredPlan}`) }}</p>
        <p class="text-muted-foreground text-sm">{{ hint ?? $t('billing.planRequired.hint') }}</p>
        <RouterLink v-if="userStore.canSeeBilling" :to="{ name: ROUTES_NAMES.settingsPlanBilling }" class="mt-2">
          <Button size="sm">{{ $t('billing.seePlans') }}</Button>
        </RouterLink>
      </div>
    </div>
  </div>
  <Callout v-else variant="info" :icon="LockIcon" :title="$t(`billing.planRequired.${requiredPlan}`)">
    <p class="text-muted-foreground text-sm">{{ hint ?? $t('billing.planRequired.hint') }}</p>
    <RouterLink
      v-if="userStore.canSeeBilling"
      :to="{ name: ROUTES_NAMES.settingsPlanBilling }"
      class="mt-3 inline-block"
    >
      <Button variant="soft-primary" size="sm">{{ $t('billing.seePlans') }}</Button>
    </RouterLink>
  </Callout>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Callout } from '@/components/lib/ui/callout';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { type Feature, PLAN_FEATURES, PLANS } from '@bt/shared/types';
import { LockIcon } from '@lucide/vue';
import { computed, watchEffect } from 'vue';

const props = defineProps<{
  feature: Feature;
  /** Keep the gated content visible but inert, with the upgrade prompt floating over it. */
  overlay?: boolean;
  /** Replaces the generic "your plan lacks this" line, e.g. when free tries ran out. */
  hint?: string;
}>();

const userStore = useUserStore();

const isAllowed = computed(() => !userStore.isFeatureGated(props.feature));

const requiredPlan = computed(() =>
  PLAN_FEATURES[PLANS.essential].includes(props.feature) ? PLANS.essential : PLANS.plus,
);

watchEffect(() => {
  if (isAllowed.value) return;
  trackAnalyticsEvent({
    event: 'paywall_hit',
    properties: { feature: props.feature, required_plan: requiredPlan.value, path: window.location.pathname },
  });
});
</script>
