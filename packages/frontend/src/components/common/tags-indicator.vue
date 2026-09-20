<template>
  <div v-if="tags.length > 0" class="flex items-center gap-1">
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
import { TagModel } from '@bt/shared/types';
import { computed } from 'vue';

const MAX_VISIBLE_TAGS = 2;

const props = defineProps<{
  tags: TagModel[];
}>();

const visibleTags = computed(() => props.tags.slice(0, MAX_VISIBLE_TAGS));

const hiddenTagsCount = computed(() => Math.max(props.tags.length - MAX_VISIBLE_TAGS, 0));
</script>
