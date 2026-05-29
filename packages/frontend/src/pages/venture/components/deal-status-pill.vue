<script setup lang="ts">
import { VENTURE_DEAL_STATUS_META } from '@/common/const/venture-deal-status';
import { type VENTURE_DEAL_STATUS } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    status: VENTURE_DEAL_STATUS;
    size?: 'sm' | 'md';
    showDot?: boolean;
  }>(),
  {
    size: 'md',
    showDot: false,
  },
);

const { t } = useI18n();

const meta = computed(() => VENTURE_DEAL_STATUS_META[props.status]);
</script>

<template>
  <span
    :class="[
      'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium tracking-wide uppercase',
      size === 'sm' ? 'text-[10px]' : 'text-xs',
      meta.cls,
    ]"
  >
    <span v-if="showDot" :class="['size-1.5 rounded-full', meta.dot]" />
    {{ t(meta.label) }}
  </span>
</template>
