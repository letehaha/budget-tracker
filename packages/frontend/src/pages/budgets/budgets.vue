<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import CardContent from '@/components/lib/ui/card/CardContent.vue';
import CardHeader from '@/components/lib/ui/card/CardHeader.vue';
import { PlusIcon } from 'lucide-vue-next';
import { ref } from 'vue';

import BudgetCreation from './budget-creation.vue';
import BudgetList from './budget-list.vue';

const isOpen = ref(false);
const openModal = () => {
  isOpen.value = true;
};
const isModalClosed = () => {
  isOpen.value = false;
};
</script>

<template>
  <div class="p-4">
    <Card class="@container/budgets-card max-w-[700px]">
      <CardHeader
        :class="[
          'border-b flex justify-between gap-4',
          '@[450px]/budgets-card:flex-row @[450px]/budgets-card:items-center',
        ]"
      >
        <h3 class="text-xl">Budgets</h3>

        <Button class="w-min" @click="openModal">
          Create budget
          <PlusIcon class="size-4" />
        </Button>
      </CardHeader>
      <CardContent class="!pt-4">
        <BudgetList />
      </CardContent>
    </Card>

    <ResponsiveDialog v-model:open="isOpen">
      <template #title> Create budget </template>
      <BudgetCreation @create-budget="isModalClosed" />
    </ResponsiveDialog>
  </div>
</template>
