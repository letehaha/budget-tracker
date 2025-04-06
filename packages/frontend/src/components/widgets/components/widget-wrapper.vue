<template>
  <Card
    class="max-h-[350px] flex flex-col"
    :class="{
      'max-h-[724px]': higher,
    }"
  >
    <CardHeader>
      <slot name="header">
        <div class="grid grid-cols-[minmax(0,1fr),max-content,20px] gap-1 items-center justify-between">
          <h3>
            <slot name="title" />
          </h3>

          <div>
            <slot name="action" />
          </div>

          <template v-if="isFetching">
            <Loader2Icon class="text-white opacity-50 size-5 animate-spin" />
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
