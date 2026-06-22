<script setup lang="ts">
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string | number;
  variant?: 'neutral' | 'success' | 'destructive' | 'warning';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
});

const containerClass: Record<NonNullable<Props['variant']>, string> = {
  neutral: 'bg-muted/40 border-border',
  success: 'bg-success/10 border-success/20',
  destructive: 'bg-destructive/10 border-destructive/20',
  warning: 'bg-warning/10 border-warning/20',
};

const labelClass: Record<NonNullable<Props['variant']>, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-success-text',
  destructive: 'text-destructive-text',
  warning: 'text-warning-text',
};

const valueClass: Record<NonNullable<Props['variant']>, string> = {
  neutral: 'text-foreground',
  success: 'text-success-text',
  destructive: 'text-destructive-text',
  warning: 'text-warning-text',
};
</script>

<template>
  <div :class="cn('rounded-lg border p-3', containerClass[variant])">
    <p :class="cn('text-xs font-medium', labelClass[variant])">
      {{ label }}
    </p>
    <slot>
      <p :class="cn('mt-1 text-2xl font-bold tabular-nums', valueClass[variant])">
        {{ value }}
      </p>
    </slot>
  </div>
</template>
