<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { GroupIcon, ListOrderedIcon, Pencil, PlusIcon, ListPlusIcon, ChevronDownIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
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
const isGroupPopoverOpen = ref(false);
const isMobileActionsOpen = ref(false);

const handleSelectAllClick = () => {
  emit('select-all', !props.isAllSelected);
};

const handleCreateGroup = () => {
  isGroupPopoverOpen.value = false;
  isMobileActionsOpen.value = false;
  emit('create-group');
};

const handleAddToGroup = () => {
  isGroupPopoverOpen.value = false;
  isMobileActionsOpen.value = false;
  emit('add-to-group');
};

const handleEdit = () => {
  isMobileActionsOpen.value = false;
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

    <!-- Mobile: compact popover with all actions -->
    <div class="sm:hidden">
      <Popover v-model:open="isMobileActionsOpen">
        <PopoverTrigger as-child>
          <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading">
            <ListOrderedIcon class="mr-1.5 size-4" />
            <ChevronDownIcon class="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class="flex w-auto min-w-48 flex-col gap-1 p-1">
          <Button variant="ghost" size="sm" class="w-full justify-start" @click="handleEdit">
            <Pencil class="mr-2 size-4" />
            {{ t('transactions.bulkEdit.editButton') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start"
            :disabled="selectedCount < 2"
            @click="handleCreateGroup"
          >
            <PlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.createNewGroup') }}
          </Button>
          <Button variant="ghost" size="sm" class="w-full justify-start" @click="handleAddToGroup">
            <ListPlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.addToExistingGroup') }}
          </Button>
        </PopoverContent>
      </Popover>
    </div>

    <!-- Desktop: full action buttons -->
    <div class="hidden items-center justify-center gap-2 sm:flex">
      <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading" @click="emit('edit')">
        <Pencil class="mr-2 size-4" />
        {{ t('transactions.bulkEdit.editButton') }}
      </Button>

      <Popover v-model:open="isGroupPopoverOpen">
        <PopoverTrigger as-child>
          <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading">
            <GroupIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.groupButton') }}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class="flex w-auto min-w-48 flex-col gap-1 p-1">
          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start"
            :disabled="selectedCount < 2"
            @click="handleCreateGroup"
          >
            <PlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.createNewGroup') }}
          </Button>
          <Button variant="ghost" size="sm" class="w-full justify-start" @click="handleAddToGroup">
            <ListPlusIcon class="mr-2 size-4" />
            {{ t('transactions.transactionGroups.bulkActions.addToExistingGroup') }}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  </div>
</template>
