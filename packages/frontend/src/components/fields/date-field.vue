<template>
  <div
    :class="{
      'date-field--error': errorMessage,
      'date-field--disabled': disabled,
    }"
    class="date-field w-full"
  >
    <Popover.Popover>
      <FieldLabel :label="label">
        <div class="relative">
          <input
            :value="inputValue"
            type="datetime-local"
            :disabled="disabled"
            :class="
              cn(
                'datetime-local-raw-input',
                'border-input bg-background ring-offset-background flex h-10 w-full rounded-md border px-3 py-2 text-sm',
                'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-muted-foreground',
                'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'appearance-none', // fixes Safari width issues
                $attrs.class ?? '',
              )
            "
            @input="handleLocalInputUpdate"
            @blur="handleBlur"
          />
          <template v-if="isSafariMobile">
            <Button
              class="absolute right-0 top-0 flex h-10 w-16 items-center justify-center"
              variant="ghost"
              size="icon"
              disabled
            >
              <CalendarClockIcon class="size-6 text-white" />
            </Button>
          </template>
          <template v-else>
            <Popover.PopoverTrigger as-child>
              <Button
                class="absolute right-0 top-0 flex h-10 w-16 items-center justify-center"
                variant="ghost"
                size="icon"
                :disabled="disabled"
              >
                <CalendarClockIcon :size="24" />
              </Button>
            </Popover.PopoverTrigger>
          </template>
        </div>
        <FieldError :error-message="errorMessage" />
        <Popover.PopoverContent class="w-[350px]">
          <Calendar v-model="localValue" v-bind="calendarOptions" mode="dateTime" is24hr type="single" />
        </Popover.PopoverContent>
      </FieldLabel>
    </Popover.Popover>
  </div>
</template>

<script setup lang="ts">
import { FieldError, FieldLabel } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Calendar } from '@/components/lib/ui/calendar';
import * as Popover from '@/components/lib/ui/popover';
import { useSafariDetection } from '@/composable/detect-safari';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarClockIcon } from 'lucide-vue-next';
import { ref, watch } from 'vue';

interface InputChangeEvent extends InputEvent {
  target: HTMLInputElement;
}

interface InputFocusEvent extends FocusEvent {
  target: HTMLInputElement;
}

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue?: Date;
    type?: string;
    tabindex?: string;
    errorMessage?: string;
    inputFieldStyles?: Record<string, string>;
    disabled?: boolean;
    calendarOptions?: {
      minDate?: Date;
      maxDate?: Date;
    };
  }>(),
  {
    label: undefined,
    modelValue: undefined,
    type: undefined,
    tabindex: undefined,
    errorMessage: undefined,
    inputFieldStyles: undefined,
    disabled: false,
    calendarOptions: undefined,
  },
);

const { isSafariMobile } = useSafariDetection();

const formatToInput = (value: Date) => format(value, 'yyyy-MM-dd HH:mm');

const inputValue = ref(props.modelValue ? formatToInput(props.modelValue) : '');

const emit = defineEmits<{
  (e: 'update:modelValue', payload: Date): void;
}>();
const localValue = ref<Date>(props.modelValue);

const handleLocalInputUpdate = (event: InputChangeEvent) => {
  const inputVal = event.target.value;
  
  // Always update the displayed input value so user can see what they're typing
  inputValue.value = inputVal;
  
  // Only emit the date if it's a valid date string
  if (inputVal && !isNaN(new Date(inputVal).getTime())) {
    emit('update:modelValue', new Date(inputVal));
  }
  // For invalid intermediate states, don't emit anything
  // This prevents validation errors during typing
};

const handleBlur = (event: InputFocusEvent) => {
  const inputVal = event.target.value;
  
  // On blur, validate the final input value
  if (inputVal && !isNaN(new Date(inputVal).getTime())) {
    // Valid date - emit it
    emit('update:modelValue', new Date(inputVal));
  } else if (inputVal) {
    // Invalid date - revert to last valid value
    inputValue.value = props.modelValue ? formatToInput(props.modelValue) : '';
  }
  // If empty, keep it empty
};

watch(
  () => props.modelValue,
  (value) => {
    inputValue.value = value ? formatToInput(value) : '';
    localValue.value = value;
  },
);

watch(localValue, () => {
  emit('update:modelValue', localValue.value);
});
</script>

<style lang="scss">
.date-field {
  position: relative;
  width: 100%;
  flex: 1;
}
.date-fields__sublabel {
  position: absolute;
  right: 0;
  top: 0;
  font-size: 16px;
  font-weight: 400;

  a {
    color: #ffffff;
    text-decoration: none;
  }
}
</style>
