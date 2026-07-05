<template>
  <div class="flex items-center gap-2">
    <span class="text-muted-foreground text-xs font-medium">{{ label }}</span>
    <!-- Wide: segmented pill tabs. Narrow: a compact Select with the same items. -->
    <div class="hidden @6xl/pivot-report:block">
      <PillTabs
        :model-value="modelValue"
        :items="items"
        size="sm"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <div class="@6xl/pivot-report:hidden">
      <Select.Select
        :model-value="modelValue"
        @update:model-value="(value) => emit('update:modelValue', value as string)"
      >
        <Select.SelectTrigger class="h-8 min-h-8 w-auto min-w-28 gap-1 py-0">
          <Select.SelectValue />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <Select.SelectItem v-for="item in items" :key="item.value" :value="item.value">
            {{ item.label }}
          </Select.SelectItem>
        </Select.SelectContent>
      </Select.Select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PillTabs, type PillTabItem } from '@/components/lib/ui/pill-tabs';
import * as Select from '@/components/lib/ui/select';

// Value is a plain string here; the host casts it back to its specific pivot union on update.
defineProps<{ label: string; items: PillTabItem[]; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
