<template>
  <Card class="w-screen max-w-full rounded-md px-2 py-4 sm:max-w-[450px] sm:p-6">
    <div>
      <template v-if="isFetched && transactionsPages">
        <TransactionsList :transactions="transactionsPages.pages.flat()" />
      </template>
    </div>
    <template v-if="hasNextPage">
      <UiButton type="button" variant="secondary" class="mt-8 w-full" @click="$emit('fetch-next-page')">
        Load more
      </UiButton>
    </template>
    <template v-else>
      <p>No more data to load</p>
    </template>
  </Card>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card } from '@/components/lib/ui/card';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';

defineProps({
  transactionsPages: {
    type: Object,
    default: null,
  },
  isFetched: {
    type: Boolean,
    required: true,
  },
  hasNextPage: {
    type: Boolean,
    required: true,
  },
});

defineEmits(['fetch-next-page']);
</script>
