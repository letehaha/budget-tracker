<template>
  <span v-if="readonly" data-test="planned-toggle" :class="rootClass">
    <ClockIcon :class="iconClass" />
    {{ $t('dialogs.manageTransaction.form.plannedLabel') }}
  </span>
  <!-- aria-disabled instead of native disabled, so the tooltip explaining why stays hoverable. -->
  <DesktopOnlyTooltip v-else :content="tooltip" content-class-name="max-w-64">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-test="planned-toggle"
      role="switch"
      :aria-checked="modelValue"
      :aria-disabled="disabled || undefined"
      :aria-label="$t('dialogs.manageTransaction.form.plannedLabel')"
      :class="cn(rootClass, hoverClass, disabled && 'cursor-not-allowed opacity-50')"
      @click="onClick"
    >
      <ClockIcon :class="iconClass" />
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

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    /** Renders a plain badge: the planned mode is fixed after creation but should stay visible. */
    readonly?: boolean;
    /** Replaces the default explanation when the selected account changes what toggling costs. */
    tooltipOverride?: string;
    /**
     * `addon` attaches the toggle flush to the right edge of a field rendered with its
     * right border/rounding stripped (the field's `field-right` slot); `pill` is the
     * standalone label-row chip.
     */
    variant?: 'pill' | 'addon';
  }>(),
  { tooltipOverride: undefined, variant: 'pill' },
);

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { t } = useI18n();

const tooltip = computed(() => props.tooltipOverride ?? t('dialogs.manageTransaction.form.plannedTooltip'));

const isOn = computed(() => props.modelValue || props.readonly);

const rootClass = computed(() => {
  if (props.variant === 'addon') {
    return cn(
      'group flex h-auto items-center gap-1.5 self-stretch rounded-l-none rounded-r-md border border-input bg-muted px-3 text-xs font-medium transition-colors',
      isOn.value && 'border-primary/60 bg-primary/20 text-primary-text',
    );
  }
  return cn(
    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors',
    isOn.value
      ? 'border-primary/60 bg-primary/20 text-primary-text font-medium'
      : 'border-border text-muted-foreground font-normal',
  );
});

const hoverClass = computed(() => {
  if (props.variant === 'addon') {
    return props.modelValue
      ? 'hover:bg-primary/30 hover:text-primary-text'
      : 'hover:border-primary/50 hover:bg-muted hover:text-primary-text';
  }
  return cn(
    'h-auto hover:bg-transparent',
    props.modelValue ? 'hover:text-primary-text' : 'hover:border-primary/50 hover:text-foreground',
  );
});

const iconClass = computed(() =>
  cn(
    props.variant === 'addon' ? 'size-3.5' : 'size-3',
    props.variant === 'addon' && !isOn.value && 'text-muted-foreground transition-colors group-hover:text-primary-text',
  ),
);

const onClick = () => {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
};
</script>
