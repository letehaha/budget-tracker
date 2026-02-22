<script lang="ts" setup>
import { useI18n } from 'vue-i18n';

import Button from '../button/Button.vue';

defineProps<{
  applyDisabled?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  apply: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="max-md:bg-background sticky bottom-0 flex items-center gap-2 border-t pt-3 pb-1">
    <div class="min-w-0 flex-1">
      <slot />
    </div>
    <div class="flex shrink-0 gap-2">
      <Button size="sm" variant="outline" @click="emit('cancel')">{{ t('common.actions.cancel') }}</Button>
      <Button size="sm" :disabled="applyDisabled" @click="emit('apply')">{{ t('common.dateSelector.apply') }}</Button>
    </div>
  </div>
</template>
