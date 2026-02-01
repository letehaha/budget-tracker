<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { PlusIcon } from 'lucide-vue-next';
import { ref } from 'vue';

import BudgetCreation from './budget-creation.vue';
import BudgetList from './budget-list.vue';

const isOpen = ref(false);
const openModal = () => {
  isOpen.value = true;
  trackAnalyticsEvent({ event: 'budget_creation_opened' });
};
const isModalClosed = () => {
  isOpen.value = false;
};
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ $t('budgets.title') }}</h1>
        <p class="text-muted-foreground mt-1 text-sm">{{ $t('budgets.description') }}</p>
      </div>
      <Button @click="openModal">
        <PlusIcon class="mr-2 size-4" />
        {{ $t('budgets.newBudget') }}
      </Button>
    </div>

    <!-- Budget List -->
    <BudgetList />

    <ResponsiveDialog v-model:open="isOpen">
      <template #title> {{ $t('budgets.createBudget') }} </template>
      <BudgetCreation @create-budget="isModalClosed" />
    </ResponsiveDialog>
  </div>
</template>
