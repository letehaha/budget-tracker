<script setup lang="ts">
import type { DemoBlockedFeature } from '@/common/const/demo';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

const props = withDefaults(
  defineProps<{
    /** Custom message to show. If not provided, uses default i18n key */
    message?: string;
    /** Whether to show tooltip even if not in demo mode (for other restricted states) */
    forceShow?: boolean;
    /** Stable name of what the demo user is being refused, e.g. `bank_connect_monobank`. */
    feature?: DemoBlockedFeature;
  }>(),
  {
    message: undefined,
    forceShow: false,
    feature: undefined,
  },
);

const { t } = useI18n();
const route = useRoute();
const userStore = useUserStore();
const { isDemo } = storeToRefs(userStore);

const shouldShowTooltip = computed(() => props.forceShow || isDemo.value);
const tooltipMessage = computed(() => props.message || t('demo.featureNotAvailable'));

// A disabled control isn't a hit target, so a click on it reaches nothing, not even this span.
// Making the child inert to pointer events turns the span into the target instead.
// Demo-only: `forceShow` states leave the child interactive, so pointer events stay on there.
const wrapperClass = computed(() => cn('inline-block', isDemo.value && '*:pointer-events-none'));

// The refusal never leaves the browser, so this is the only place it can be counted.
function reportBlockedAttempt() {
  if (!isDemo.value || !props.feature) return;

  trackAnalyticsEvent({
    event: 'demo_feature_blocked',
    properties: { feature: props.feature, surface: 'restricted_control', path: route.path },
  });
}
</script>

<template>
  <ResponsiveTooltip v-if="shouldShowTooltip" :delay-duration="100" :content="tooltipMessage">
    <span :class="wrapperClass" @pointerdown="reportBlockedAttempt">
      <slot />
    </span>
  </ResponsiveTooltip>
  <slot v-else />
</template>
