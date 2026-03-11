<script lang="ts" setup>
import { format } from 'date-fns';
import { GroupIcon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

export interface GroupRowData {
  type: 'group';
  groupId: number;
  groupName: string;
  transactionCount: number;
  dateFrom: Date;
  dateTo: Date;
}

const props = defineProps<{
  group: GroupRowData;
}>();

const emit = defineEmits<{
  click: [groupId: number];
}>();

const dateRange = computed(() => {
  const from = format(props.group.dateFrom, 'd MMM');
  const to = format(props.group.dateTo, 'd MMM yyyy');
  const fromFull = format(props.group.dateFrom, 'd MMM yyyy');
  if (fromFull === to) return to;
  return `${from} – ${to}`;
});
</script>

<template>
  <div
    class="bg-primary/5 border-primary/20 hover:bg-primary/10 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_max-content] items-center gap-2 rounded-md border border-dashed px-2 py-2 transition-colors"
    @click="emit('click', group.groupId)"
  >
    <div class="flex items-center gap-2 overflow-hidden">
      <div class="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
        <GroupIcon class="text-primary size-4" />
      </div>
      <div class="min-w-0 text-left">
        <p class="truncate text-sm font-medium">{{ group.groupName }}</p>
        <p class="text-muted-foreground text-xs">
          {{ group.transactionCount }}
          {{ t('transactions.transactionGroups.transactionGroupRecord.transactionCountLabel') }}
        </p>
      </div>
    </div>
    <div class="text-muted-foreground text-right text-xs whitespace-nowrap">
      {{ dateRange }}
    </div>
  </div>
</template>
