<template>
  <div v-if="hasTags" class="flex items-center gap-1">
    <span
      v-for="tag in visibleTags"
      :key="tag.id"
      class="inline-flex max-w-12.5 items-center gap-0.5 truncate rounded-full px-1.5 py-0 text-[10px] font-medium text-white/90"
      :style="{ backgroundColor: tag.color }"
    >
      {{ tag.name }}
    </span>
    <span v-if="hiddenTagsCount > 0" class="text-muted-foreground text-[10px]"> +{{ hiddenTagsCount }} </span>
  </div>
</template>

<script lang="ts" setup>
import { TransactionModel } from '@bt/shared/types';
import { computed } from 'vue';

const props = defineProps<{
  transaction: TransactionModel;
}>();

const hasTags = computed(() => props.transaction.tags && props.transaction.tags.length > 0);

const visibleTags = computed(() => {
  if (!props.transaction.tags) return [];
  return props.transaction.tags.slice(0, 2);
});

const hiddenTagsCount = computed(() => {
  if (!props.transaction.tags || props.transaction.tags.length <= 2) return 0;
  return props.transaction.tags.length - 2;
});
</script>
