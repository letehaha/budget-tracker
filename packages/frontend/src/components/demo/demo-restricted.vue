<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
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
    /** Stable snake_case name of what the demo user is being refused, e.g. `bank_connect_monobank`. */
    feature?: string;
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

// A disabled button swallows its own pointer events, so this span is the first node
// that sees the attempt. Reporting it gives us what demo users reach for and cannot
// have, which no server-side event can capture because the request never goes out.
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
    <span class="inline-block" @pointerdown="reportBlockedAttempt">
      <slot />
    </span>
  </ResponsiveTooltip>
  <slot v-else />
</template>
