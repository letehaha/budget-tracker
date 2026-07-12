<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { ChevronDownIcon } from '@lucide/vue';
import { type Component, computed } from 'vue';

import { filterPillClass } from './filter-pill.helpers';

const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    active?: boolean;
    icon?: Component;
  }>(),
  { active: false, icon: undefined },
);

const pillClass = computed(() => filterPillClass({ active: props.active }));
</script>

<template>
  <Button type="button" variant="outline" :class="pillClass">
    <component :is="icon" v-if="icon" class="size-3.5 shrink-0 opacity-70" />
    <span class="text-muted-foreground shrink-0 text-xs">{{ label }}</span>
    <span class="text-foreground min-w-0 truncate font-medium">{{ value }}</span>
    <ChevronDownIcon class="size-3.5 shrink-0 opacity-50" />
  </Button>
</template>
