<script setup lang="ts">
import { useRegisterDescription } from '@/components/lib/ui/dialog/described-by';
import { cn } from '@/lib/utils';
import { DialogDescription, type DialogDescriptionProps } from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _, ...delegated } = props;

  return delegated;
});

useRegisterDescription();
</script>

<template>
  <DialogDescription :class="cn('text-muted-foreground text-sm', props.class)" v-bind="delegatedProps">
    <slot />
  </DialogDescription>
</template>
