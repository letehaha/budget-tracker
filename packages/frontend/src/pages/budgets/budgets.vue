<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
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
  <div class="p-6">
    <!-- Page Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Budgets</h1>
        <p class="text-muted-foreground mt-1 text-sm">Track spending and monitor financial events</p>
      </div>
      <Button @click="openModal">
        <PlusIcon class="mr-2 size-4" />
        New Budget
      </Button>
    </div>

    <!-- Budget List -->
    <BudgetList />

    <ResponsiveDialog v-model:open="isOpen">
      <template #title> Create budget </template>
      <BudgetCreation @create-budget="isModalClosed" />
    </ResponsiveDialog>
  </div>
</template>
