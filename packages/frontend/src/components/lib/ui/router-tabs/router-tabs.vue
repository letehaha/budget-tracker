<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { cn } from '@/lib/utils';
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import type { RouterTabItem } from '.';

const props = defineProps<{
  items: RouterTabItem[];
  class?: string;
}>();

defineSlots<{
  /** Optional element rendered after the label, scoped per item (e.g. badges, status dots). */
  trailing?: (props: { item: RouterTabItem }) => unknown;
}>();

const route = useRoute();
const router = useRouter();

const activeValue = computed(() => {
  const name = String(route.name ?? '');
  return props.items.some((i) => i.value === name) ? name : (props.items[0]?.value ?? '');
});

const onTabChange = (value: string | number) => {
  const name = String(value);
  if (route.name === name) return;
  const item = props.items.find((i) => i.value === name);
  router.push(item?.to ?? { name });
};
</script>

<template>
  <Tabs :model-value="activeValue" :class="props.class" @update:model-value="onTabChange">
    <TabsList variant="underline">
      <TabsTrigger v-for="item in items" :key="item.value" :value="item.value" as-child>
        <RouterLink :to="item.to ?? { name: item.value }">
          <component :is="item.icon" v-if="item.icon" :class="cn('size-4', item.iconClass)" />
          {{ item.label }}
          <slot name="trailing" :item="item" />
        </RouterLink>
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
