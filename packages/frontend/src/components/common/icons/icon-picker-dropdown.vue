<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex flex-col gap-2">
      <input
        ref="searchInputRef"
        v-model="search"
        type="text"
        :placeholder="$t('settings.tags.form.iconSearchPlaceholder')"
        class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
        @input="resetScroll"
      />

      <div ref="scrollContainerRef" class="max-h-50 overflow-y-auto rounded-md border">
        <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
          <div
            v-for="row in virtualRows"
            :key="row.index"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${row.size}px`,
              transform: `translateY(${row.start}px)`,
            }"
          >
            <div class="grid grid-cols-8 gap-1 p-1">
              <Tooltip v-for="iconName in getIconsForRow(row.index)" :key="iconName" :delay-duration="0">
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    :class="
                      cn(
                        'hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors',
                        modelValue === iconName && 'bg-accent ring-ring ring-2',
                      )
                    "
                    @click="selectIcon(iconName)"
                  >
                    <Icon :icon="`lucide:${iconName}`" class="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" :side-offset="4">
                  {{ iconName }}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      <button
        v-if="modelValue"
        type="button"
        class="text-muted-foreground hover:text-foreground w-full text-center text-xs"
        @click="clearIcon"
      >
        {{ $t('settings.tags.form.clearIcon') }}
      </button>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lib/ui/tooltip';
import lucideIcons from '@/data/lucide-icons.json';
import { cn } from '@/lib/utils';
import { Icon } from '@iconify/vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { computed, onMounted, ref } from 'vue';

const ICONS_PER_ROW = 8;
const ROW_HEIGHT = 36;

defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  close: [];
}>();

const search = ref('');
const scrollContainerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const filteredIcons = computed(() => {
  if (!search.value.trim()) return lucideIcons;
  const searchLower = search.value.toLowerCase().trim();
  return lucideIcons.filter((name: string) => name.includes(searchLower));
});

const rowCount = computed(() => Math.ceil(filteredIcons.value.length / ICONS_PER_ROW));

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rowCount.value,
    getScrollElement: () => scrollContainerRef.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  })),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

const getIconsForRow = (rowIndex: number): string[] => {
  const start = rowIndex * ICONS_PER_ROW;
  const end = Math.min(start + ICONS_PER_ROW, filteredIcons.value.length);
  return filteredIcons.value.slice(start, end);
};

const resetScroll = () => {
  virtualizer.value.scrollToIndex(0);
};

const selectIcon = (iconName: string) => {
  emit('update:modelValue', iconName);
  emit('close');
};

const clearIcon = () => {
  emit('update:modelValue', '');
  emit('close');
};

onMounted(() => {
  searchInputRef.value?.focus();
});
</script>
