<template>
  <div class="flex min-h-[220px] flex-col items-center justify-center opacity-70">
    <slot></slot>
    <p class="mt-4 text-center text-sm">{{ t('dashboard.widgets.emptyState') }}</p>
  </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>
