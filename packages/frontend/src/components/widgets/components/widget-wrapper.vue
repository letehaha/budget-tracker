<template>
  <Card
    :class="[
      cn('flex max-h-87.5 flex-col', $attrs.class),
      {
        'max-h-181': higher,
      },
    ]"
  >
    <CardHeader>
      <slot name="header">
        <div class="grid grid-cols-[minmax(0,1fr)_max-content_20px] items-center justify-between gap-1">
          <h3>
            <slot name="title" />
          </h3>

          <div>
            <slot name="action" />
          </div>

          <template v-if="isFetching">
            <Loader2Icon class="size-5 animate-spin text-white opacity-50" />
          </template>
        </div>
      </slot>
    </CardHeader>

    <CardContent class="h-full">
      <slot />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    higher?: boolean;
    isFetching?: boolean;
  }>(),
  {
    isFetching: false,
  },
);
</script>
