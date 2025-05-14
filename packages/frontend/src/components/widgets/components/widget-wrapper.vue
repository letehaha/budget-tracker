<template>
  <Card
    class="flex max-h-[350px] flex-col"
    :class="{
      'max-h-[724px]': higher,
    }"
  >
    <CardHeader>
      <slot name="header">
        <div class="grid grid-cols-[minmax(0,1fr),max-content,20px] items-center justify-between gap-1">
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
