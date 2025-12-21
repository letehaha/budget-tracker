<template>
  <div class="grid gap-3">
    <Tabs v-model="mode" class="w-full">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="range">Range</TabsTrigger>
        <TabsTrigger value="single">Single</TabsTrigger>
      </TabsList>
    </Tabs>

    <template v-if="mode === 'range'">
      <Popover.Popover v-model:open="isPopoverOpen">
        <Popover.PopoverTrigger as-child>
          <Button
            variant="outline"
            :class="cn('w-full justify-start text-left font-normal', !hasDateRange && 'text-muted-foreground')"
          >
            <CalendarIcon class="mr-2 size-4" />
            <template v-if="hasDateRange">
              {{ formatDateRange }}
            </template>
            <template v-else> Select date range </template>
          </Button>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent class="w-auto p-0" align="start">
          <div class="flex flex-col sm:flex-row">
            <div class="flex max-w-svw flex-row flex-wrap gap-1 border-b p-3 sm:flex-col sm:border-r sm:border-b-0">
              <Button
                v-for="preset in presets"
                :key="preset.label"
                variant="ghost"
                size="sm"
                class="justify-start"
                @click="applyPreset(preset)"
              >
                {{ preset.label }}
              </Button>
              <Button
                v-if="hasDateRange"
                variant="ghost"
                size="sm"
                class="text-destructive-text hover:text-destructive-text hover:bg-destructive/20 justify-start gap-1 sm:mt-auto"
                @click="clearRange"
              >
                <XIcon class="mr-1 size-3" />
                Clear
              </Button>
            </div>
            <div>
              <Calendar
                v-model.range="rangeValue"
                :columns="calendarColumns"
                type="range"
                :max-date="today"
                @update:model-value="handleRangeUpdate"
              />
            </div>
          </div>
        </Popover.PopoverContent>
      </Popover.Popover>
    </template>

    <template v-else>
      <DateField
        :model-value="start"
        :calendar-options="{
          maxDate: end ?? today,
        }"
        label="From date"
        @update:model-value="$emit('update:start', $event)"
      />
      <DateField
        :model-value="end"
        :calendar-options="{
          minDate: start,
          maxDate: today,
        }"
        label="To date"
        @update:model-value="$emit('update:end', $event)"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import DateField from '@/components/fields/date-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Calendar } from '@/components/lib/ui/calendar';
import * as Popover from '@/components/lib/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { endOfDay, format, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

interface DateRange {
  start: Date;
  end: Date;
}

interface Preset {
  label: string;
  getValue: () => DateRange;
}

const props = defineProps({
  start: {
    type: Date,
    default: null,
  },
  end: {
    type: Date,
    default: null,
  },
});

const emit = defineEmits(['update:start', 'update:end', 'update:range']);

const mode = ref<'range' | 'single'>('range');
const isPopoverOpen = ref(false);
const today = new Date();
const isMobile = useWindowBreakpoints(640);
const calendarColumns = computed(() => (isMobile.value ? 1 : 2));

const rangeValue = ref<DateRange | null>(props.start && props.end ? { start: props.start, end: props.end } : null);

const presets: Preset[] = [
  {
    label: 'This month',
    getValue: () => ({
      start: startOfMonth(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 3 months',
    getValue: () => ({
      start: startOfDay(subMonths(new Date(), 3)),
      end: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 6 months',
    getValue: () => ({
      start: startOfDay(subMonths(new Date(), 6)),
      end: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 12 months',
    getValue: () => ({
      start: startOfDay(subMonths(new Date(), 12)),
      end: endOfDay(new Date()),
    }),
  },
];

const hasDateRange = computed(() => props.start && props.end);

const formatDateRange = computed(() => {
  if (!props.start || !props.end) return '';
  return `${format(props.start, 'MMM d, yyyy')} - ${format(props.end, 'MMM d, yyyy')}`;
});

const applyPreset = (preset: Preset) => {
  const { start, end } = preset.getValue();
  rangeValue.value = { start, end };
  emit('update:range', { start, end });
  isPopoverOpen.value = false;
};

const handleRangeUpdate = (value: DateRange | null) => {
  if (value?.start && value?.end) {
    const start = startOfDay(value.start);
    const end = endOfDay(value.end);
    emit('update:range', { start, end });
    isPopoverOpen.value = false;
  }
};

const clearRange = () => {
  rangeValue.value = null;
  emit('update:range', { start: null, end: null });
  isPopoverOpen.value = false;
};

watch(
  () => [props.start, props.end],
  ([newStart, newEnd]) => {
    if (newStart && newEnd) {
      rangeValue.value = { start: newStart, end: newEnd };
    } else {
      rangeValue.value = null;
    }
  },
);
</script>
