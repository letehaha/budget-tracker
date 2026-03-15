<script setup lang="ts">
import * as transactionGroupsApi from '@/api/transaction-groups';
import type { TransactionGroupResponse } from '@/api/transaction-groups';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import InputField from '@/components/fields/input-field.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { invalidateTransactionGroupQueries } from '@/composable/data-queries/transaction-groups';
import { useQueryClient, useQuery } from '@tanstack/vue-query';
import { Trash2Icon, CalendarIcon, HashIcon } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { format } from 'date-fns';

import TransactionGroupDialog from './transaction-group-dialog.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const queryClient = useQueryClient();

const { data: groups, isLoading } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.transactionGroupsList,
  queryFn: () => transactionGroupsApi.loadTransactionGroups(),
  initialData: [],
});

const searchQuery = ref('');

const filteredGroups = computed(() => {
  if (!searchQuery.value) return groups.value;
  const query = searchQuery.value.toLowerCase();
  return groups.value.filter((g) => g.name.toLowerCase().includes(query) || g.note?.toLowerCase().includes(query));
});

// Dialog state
const dialogState = reactive({
  isOpen: false,
  key: 0,
  groupId: undefined as number | undefined,
});

const openGroupDialog = ({ groupId }: { groupId: number }) => {
  dialogState.groupId = groupId;
  dialogState.key++;
  dialogState.isOpen = true;
};

// Delete confirmation
const deleteState = reactive({
  isOpen: false,
  groupId: undefined as number | undefined,
  groupName: '',
});

const confirmDelete = ({ group }: { group: TransactionGroupResponse }) => {
  deleteState.groupId = group.id;
  deleteState.groupName = group.name;
  deleteState.isOpen = true;
};

const handleDelete = async () => {
  if (!deleteState.groupId) return;
  await transactionGroupsApi.deleteTransactionGroup({ id: deleteState.groupId });
  deleteState.isOpen = false;
  invalidateTransactionGroupQueries({ queryClient });
};

const formatDateRange = ({ group }: { group: TransactionGroupResponse }) => {
  if (!group.dateFrom && !group.dateTo) return '';
  const from = group.dateFrom ? format(new Date(group.dateFrom), 'd MMM yyyy') : '';
  const to = group.dateTo ? format(new Date(group.dateTo), 'd MMM yyyy') : '';
  if (from === to) return from;
  return `${from} – ${to}`;
};
</script>

<template>
  <div class="flex flex-col gap-6 p-4 md:px-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t('transactions.transactionGroups.groupsPage.title') }}</h1>
    </div>

    <!-- Search -->
    <div class="max-w-sm">
      <InputField
        v-model="searchQuery"
        :placeholder="t('transactions.transactionGroups.groupsPage.searchPlaceholder')"
      />
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="grid gap-3">
      <div v-for="i in 3" :key="i" class="bg-muted h-20 animate-pulse rounded-lg" />
    </div>

    <!-- Empty state -->
    <Card v-else-if="filteredGroups.length === 0" class="flex flex-col items-center justify-center py-12">
      <p class="text-muted-foreground text-sm">
        {{
          searchQuery ? 'No groups match your search.' : t('transactions.transactionGroups.groupsPage.noGroupsMessage')
        }}
      </p>
      <p class="text-muted-foreground mt-1 text-xs">
        {{ t('transactions.transactionGroups.groupsPage.emptyStateHint') }}
      </p>
    </Card>

    <!-- Groups list -->
    <div v-else class="grid gap-3">
      <Card
        v-for="group in filteredGroups"
        :key="group.id"
        class="hover:bg-accent/50 cursor-pointer p-4 transition-colors"
        @click="openGroupDialog({ groupId: group.id })"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <h3 class="font-medium">{{ group.name }}</h3>
            <p v-if="group.note" class="text-muted-foreground mt-0.5 line-clamp-1 text-sm">
              {{ group.note }}
            </p>
            <div class="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
              <span v-if="group.transactionCount !== undefined" class="flex items-center gap-1">
                <HashIcon class="size-3" />
                {{ group.transactionCount }} {{ t('transactions.transactionGroups.groupsPage.transactionCountLabel') }}
              </span>
              <span v-if="group.dateFrom" class="flex items-center gap-1">
                <CalendarIcon class="size-3" />
                {{ formatDateRange({ group }) }}
              </span>
            </div>
          </div>

          <Button variant="soft-destructive" size="icon" @click.stop="confirmDelete({ group })">
            <Trash2Icon class="size-4" />
          </Button>
        </div>
      </Card>
    </div>

    <!-- Group detail dialog -->
    <TransactionGroupDialog
      v-model:open="dialogState.isOpen"
      :key="dialogState.key"
      :group-id="dialogState.groupId"
      @deleted="invalidateTransactionGroupQueries({ queryClient })"
      @updated="invalidateTransactionGroupQueries({ queryClient })"
    />

    <!-- Delete confirmation dialog -->
    <ResponsiveAlertDialog
      v-model:open="deleteState.isOpen"
      confirm-label="Delete"
      confirm-variant="destructive"
      @confirm="handleDelete"
    >
      <template #title>{{ t('transactions.transactionGroups.groupDialog.deleteGroupTitle') }}</template>
      <template #description>
        {{
          t('transactions.transactionGroups.groupDialog.deleteGroupDescription', { groupName: deleteState.groupName })
        }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
