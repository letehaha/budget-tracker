<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Pencil } from 'lucide-vue-next';
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
  'select-all': [checked: boolean];
}>();

const hasSelection = computed(() => props.selectedCount > 0);

const handleSelectAllClick = () => {
  emit('select-all', !props.isAllSelected);
};
</script>

<template>
  <div
    class="bg-card/95 sticky top-(--header-height) z-10 flex items-center justify-between gap-4 border-b px-3 py-3 backdrop-blur"
  >
    <div class="flex items-center gap-1 sm:gap-4">
      <!-- Select all checkbox -->
      <div class="flex cursor-pointer items-center gap-2 whitespace-nowrap" @click="handleSelectAllClick">
        <Checkbox :model-value="isAllSelected" />
        <span class="text-sm">{{ t('transactions.bulkEdit.selectAll') }}</span>
      </div>

      <!-- Selection count and cancel -->
      <span v-if="hasSelection" class="text-muted-foreground text-sm">
        <span class="max-sm:hidden">
          {{ t('transactions.bulkEdit.selectedCount', { count: selectedCount }) }}
        </span>
        <span class="sm:hidden"> ({{ selectedCount }}) </span>
      </span>
    </div>

    <!-- Action buttons in center -->
    <div class="flex items-center justify-center gap-2">
      <Button variant="outline" size="sm" :disabled="!hasSelection || isLoading" @click="emit('edit')">
        <Pencil class="mr-2 size-4" />
        {{ t('transactions.bulkEdit.editButton') }}
      </Button>
      <!-- <Button variant="destructive" size="sm" :disabled="!hasSelection || isLoading" @click="emit('delete')">
        <Trash2 class="mr-2 size-4" />
        {{ t('transactions.bulkEdit.deleteButton') }}
      </Button> -->
    </div>
  </div>
</template>
