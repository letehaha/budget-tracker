<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import { GroupIcon, ListOrderedIcon, Pencil, PlusIcon, ListPlusIcon, ChevronDownIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  selectedCount: number;
  isLoading: boolean;
  isAllSelected: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  edit: [];
  delete: [];
  'create-group': [];
  'add-to-group': [];
  'select-all': [checked: boolean];
}>();

const hasSelection = computed(() => props.selectedCount > 0);

const handleSelectAllClick = () => {
  emit('select-all', !props.isAllSelected);
};

const handleCreateGroup = () => {
  emit('create-group');
};

const handleAddToGroup = () => {
  emit('add-to-group');
};

const handleEdit = () => {
  emit('edit');
};
</script>

<template>
  <div
    class="bg-card/95 sticky top-(--header-height) z-10 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur sm:gap-4"
  >
    <div class="flex items-center gap-1 sm:gap-4">
      <!-- Select all / deselect all checkbox -->
      <div class="flex cursor-pointer items-center gap-2 whitespace-nowrap" @click="handleSelectAllClick">
        <Checkbox :model-value="isAllSelected" />
        <span class="text-sm">{{ t('transactions.bulkEdit.selectAll') }}</span>
      </div>

      <!-- Selection count (desktop only) -->
      <span v-if="hasSelection" class="text-muted-foreground text-sm">
        {{ t('transactions.bulkEdit.selectedCount', { count: selectedCount }) }}
      </span>
    </div>

    <!-- Mobile: compact dropdown with all actions -->
    <div class="sm:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading">
            <ListOrderedIcon class="mr-1.5 size-4" />
            <ChevronDownIcon class="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-48">
          <DropdownMenuItem @select="handleEdit">
            <Pencil class="mr-2 size-4" />
            {{ t('transactions.bulkEdit.editButton') }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="selectedCount < 2" @select="handleCreateGroup">
            <PlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.createNewGroup') }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="handleAddToGroup">
            <ListPlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.addToExistingGroup') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Desktop: full action buttons -->
    <div class="hidden items-center justify-center gap-2 sm:flex">
      <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading" @click="emit('edit')">
        <Pencil class="size-4" />
        {{ t('transactions.bulkEdit.editButton') }}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading">
            <GroupIcon class="size-4" />
            {{ t('transactions.transactionGroups.bulkActions.groupButton') }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-48">
          <DropdownMenuItem :disabled="selectedCount < 2" @select="handleCreateGroup">
            <PlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.createNewGroup') }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="handleAddToGroup">
            <ListPlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.addToExistingGroup') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
