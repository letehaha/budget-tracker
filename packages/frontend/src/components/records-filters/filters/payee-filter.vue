<template>
  <Combobox.Combobox
    :model-value="undefined"
    v-model:searchTerm="searchTerm"
    v-model:open="isOpen"
    :multiple="true"
    class="w-full"
  >
    <Combobox.ComboboxAnchor>
      <Combobox.ComboboxTrigger
        class="border-input bg-input-background ring-offset-background focus-visible:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-sm font-medium"
          >
            {{ selectedPayeeIds.length }}
          </span>
          <span class="font-medium">
            {{
              selectedPayeeIds.length === 0
                ? $t('transactions.filters.payees.label')
                : selectedPayeeIds.length === 1
                  ? $t('transactions.filters.payees.selectedOne')
                  : $t('transactions.filters.payees.selectedMany', { n: selectedPayeeIds.length })
            }}
          </span>
        </div>

        <template v-if="selectedPayeeIds.length > 0">
          <DesktopOnlyTooltip :content="$t('common.actions.clear')">
            <Button
              variant="ghost"
              size="icon"
              class="size-6"
              :aria-label="$t('common.actions.clear')"
              @click.stop="clearSelection"
            >
              <XIcon class="text-muted-foreground size-4" />
            </Button>
          </DesktopOnlyTooltip>
        </template>
        <template v-else>
          <div class="size-6 p-1">
            <ChevronDownIcon class="text-muted-foreground size-4" />
          </div>
        </template>
      </Combobox.ComboboxTrigger>
    </Combobox.ComboboxAnchor>

    <Combobox.ComboboxList
      class="max-h-100 w-(--reka-combobox-trigger-width) lg:max-h-75"
      :side="dropdownSide"
      :avoid-collisions="false"
    >
      <div class="relative w-full items-center p-2 pb-0">
        <Combobox.ComboboxInput
          class="h-9 w-full rounded-md border pl-9 focus-visible:ring-0"
          :placeholder="$t('transactions.filters.payees.searchPlaceholder')"
        />
        <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-5 -translate-y-1/2" />
      </div>
      <div class="max-h-85 overflow-y-auto p-1.25 lg:max-h-60">
        <template v-if="isFetching && displayedPayees.length === 0">
          <div class="text-muted-foreground py-3 text-center text-xs">
            {{ $t('common.loading') }}
          </div>
        </template>
        <template v-else-if="displayedPayees.length === 0">
          <Combobox.ComboboxEmpty class="text-mauve8 py-2 text-center text-xs font-medium" />
        </template>

        <Combobox.ComboboxGroup>
          <Combobox.ComboboxItem
            v-for="payee in displayedPayees"
            :key="payee.id"
            :value="payee"
            class="hover:bg-accent hover:text-accent-foreground flex-start flex cursor-pointer items-center justify-between rounded-md px-2 py-1"
            @select.prevent="pickPayee(payee)"
          >
            <span class="truncate">{{ payee.name }}</span>
            <CheckIcon v-if="isPayeeSelected(payee.id)" />
          </Combobox.ComboboxItem>
        </Combobox.ComboboxGroup>
      </div>
    </Combobox.ComboboxList>
  </Combobox.Combobox>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import * as Combobox from '@/components/lib/ui/combobox';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { usePayees } from '@/composable/data-queries/payees';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import type { RecordId } from '@bt/shared/types';
import { isEqual } from 'lodash-es';
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from '@lucide/vue';
import { useDebounce } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

const DEBOUNCE_MS = 200;

interface SelectedPayee {
  id: RecordId;
  name: string;
}

const props = defineProps<{
  payeeIds: string[];
}>();

const emit = defineEmits<{
  'update:payeeIds': [value: string[]];
}>();

const searchTerm = ref('');
const searchTermDebounced = useDebounce(searchTerm, DEBOUNCE_MS);
const debouncedQuery = computed(() => (searchTermDebounced.value ?? '').trim());
const isOpen = ref(false);

const { list: serverPayees, isFetching } = usePayees({
  q: computed(() => (debouncedQuery.value.length > 0 ? debouncedQuery.value : undefined)),
  enabled: isOpen,
});

const selectedPayees = ref<SelectedPayee[]>([]);

watch(
  () => props.payeeIds,
  (newIds) => {
    if (isEqual([...newIds].sort(), selectedPayees.value.map((p) => p.id).sort())) return;
    const byId = new Map<string, SelectedPayee>([
      ...selectedPayees.value.map((p) => [p.id, p] as const),
      ...serverPayees.value.map((p) => [p.id, { id: p.id, name: p.name }] as const),
    ]);
    selectedPayees.value = newIds.map((id) => byId.get(id) ?? { id: id as RecordId, name: id });
  },
  { immediate: true },
);

watch(serverPayees, (rows) => {
  if (selectedPayees.value.length === 0) return;
  const lookup = new Map(rows.map((p) => [p.id, p.name] as const));
  let dirty = false;
  selectedPayees.value = selectedPayees.value.map((sel) => {
    const fresh = lookup.get(sel.id);
    if (fresh && fresh !== sel.name) {
      dirty = true;
      return { id: sel.id, name: fresh };
    }
    return sel;
  });
  if (!dirty) return;
});

const selectedPayeeIds = computed(() => selectedPayees.value.map((p) => p.id));

const isMobile = useWindowBreakpoints(1024);
const dropdownSide = computed(() => (isMobile.value ? 'top' : 'bottom'));

const displayedPayees = computed<SelectedPayee[]>(() => {
  const selected = selectedPayees.value;
  const selectedIds = new Set(selected.map((p) => p.id));
  const rest = serverPayees.value
    .filter((p) => !selectedIds.has(p.id))
    .map<SelectedPayee>((p) => ({ id: p.id, name: p.name }));
  return [...selected, ...rest];
});

const isPayeeSelected = (payeeId: RecordId) => selectedPayees.value.some((p) => p.id === payeeId);

const pickPayee = (payee: SelectedPayee) => {
  if (isPayeeSelected(payee.id)) {
    selectedPayees.value = selectedPayees.value.filter((p) => p.id !== payee.id);
  } else {
    selectedPayees.value = [...selectedPayees.value, { id: payee.id, name: payee.name }];
  }
  emit('update:payeeIds', selectedPayeeIds.value);
};

const clearSelection = () => {
  selectedPayees.value = [];
  emit('update:payeeIds', []);
};
</script>
