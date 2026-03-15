<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { useUserStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    /** Custom message to show. If not provided, uses default i18n key */
    message?: string;
    /** Whether to show tooltip even if not in demo mode (for other restricted states) */
    forceShow?: boolean;
  }>(),
  {
    message: undefined,
    forceShow: false,
  },
);

const { t } = useI18n();
const userStore = useUserStore();
const { isDemo } = storeToRefs(userStore);

const shouldShowTooltip = computed(() => props.forceShow || isDemo.value);
const tooltipMessage = computed(() => props.message || t('demo.featureNotAvailable'));
</script>

<template>
  <ResponsiveTooltip v-if="shouldShowTooltip" :delay-duration="100" :content="tooltipMessage">
    <span class="inline-block">
      <slot />
    </span>
  </ResponsiveTooltip>
  <slot v-else />
</template>
