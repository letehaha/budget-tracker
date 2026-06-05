<template>
  <div>
    <div class="mb-4 flex items-center gap-2">
      <InputField v-model="searchQuery" :placeholder="$t('payees.searchPlaceholder')" class="flex-1">
        <template #iconLeading>
          <SearchIcon class="text-muted-foreground size-4" />
        </template>
      </InputField>
      <UiButton variant="outline" size="sm" class="shrink-0 gap-1.5" @click="openCreateDialog">
        <PlusIcon class="size-4" />
        {{ $t('payees.newPayeeButton') }}
      </UiButton>
    </div>

    <PayeesTable :search-query="debouncedQuery" />

    <PayeeFormDialog v-model:open="dialogState.isOpen" :payee="dialogState.payee" />
  </div>
</template>

<script setup lang="ts">
import { Button as UiButton } from '@/components/lib/ui/button';
import InputField from '@/components/fields/input-field.vue';
import { PlusIcon, SearchIcon } from '@lucide/vue';
import { useDebounce } from '@vueuse/core';
import { computed, reactive, ref } from 'vue';

import PayeeFormDialog from './payee-form-dialog.vue';
import PayeesTable from './payees-table.vue';

const DEBOUNCE_MS = 200;

const searchQuery = ref('');
const searchQueryDebounced = useDebounce(searchQuery, DEBOUNCE_MS);
const debouncedQuery = computed(() => searchQueryDebounced.value.trim());

const dialogState = reactive<{ isOpen: boolean; payee: null }>({ isOpen: false, payee: null });
const openCreateDialog = () => {
  dialogState.payee = null;
  dialogState.isOpen = true;
};
</script>
