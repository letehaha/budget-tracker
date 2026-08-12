<template>
  <span v-if="readonly" data-test="planned-toggle" :class="pillClass">
    <ClockIcon class="size-3" />
    {{ $t('dialogs.manageTransaction.form.plannedLabel') }}
  </span>
  <!-- aria-disabled instead of native disabled, so the tooltip explaining why stays hoverable. -->
  <DesktopOnlyTooltip v-else :content="tooltip" content-class-name="max-w-56">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-test="planned-toggle"
      role="switch"
      :aria-checked="modelValue"
      :aria-disabled="disabled || undefined"
      :aria-label="$t('dialogs.manageTransaction.form.plannedLabel')"
      :class="
        cn(
          'h-auto hover:bg-transparent',
          pillClass,
          modelValue ? 'hover:text-primary-text' : 'hover:border-primary/50 hover:text-foreground',
          disabled && 'cursor-not-allowed opacity-50',
        )
      "
      @click="onClick"
    >
      <ClockIcon class="size-3" />
      {{ $t('dialogs.manageTransaction.form.plannedLabel') }}
    </Button>
  </DesktopOnlyTooltip>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { cn } from '@/lib/utils';
import { ClockIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  /** Renders a plain badge: the planned mode is fixed after creation but should stay visible. */
  readonly?: boolean;
  /** Replaces the default explanation when the selected account changes what toggling costs. */
  tooltipOverride?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { t } = useI18n();

const tooltip = computed(() => props.tooltipOverride ?? t('dialogs.manageTransaction.form.plannedTooltip'));

const pillClass = computed(() =>
  cn(
    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
    props.modelValue
      ? 'border-primary/60 bg-primary/20 text-primary-text font-medium'
      : 'border-border text-muted-foreground font-normal',
  ),
);

const onClick = () => {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
};
</script>
