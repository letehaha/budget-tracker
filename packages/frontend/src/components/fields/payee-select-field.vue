<script setup lang="ts">
import { useAccountPayees, useCreatePayee, usePayees } from '@/composable/data-queries/payees';
import { useNotificationCenter } from '@/components/notification-center';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { Button } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { PlusIcon, SearchIcon, XIcon } from '@lucide/vue';
import { useDebounce } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import FieldLabel from './components/field-label.vue';

const DEBOUNCE_MS = 200;

interface Props {
  modelValue: string | null | undefined;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** When set, this Payee id is filtered out of the dropdown (e.g. the source of a merge). */
  excludeId?: string | null;
  /**
   * Account context for the picker. When provided AND the account is shared
   * with the caller, swap to the owner-scoped list so the picker matches the
   * payee namespace the backend write paths validate against. When the
   * account is owned by the caller, it's the caller's own list (same as
   * undefined). Owner-scoped fetch is enabled by `ownerScoped`.
   */
  accountId?: string | null;
  /**
   * Set by the parent when `accountId` resolves to a shared account, telling
   * this component to route through `useAccountPayees` instead of `usePayees`.
   * Inline create is hidden in this mode (recipient can't create payees in the
   * owner's namespace from a transaction form).
   */
  ownerScoped?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  placeholder: undefined,
  disabled: false,
  excludeId: null,
  accountId: null,
  ownerScoped: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  /**
   * Fires only on user-driven selection; payload carries the Payee's
   * `defaultCategoryId` (explicit user setting) and `topCategoryId` (the
   * most-used category derived from past transactions). Callers use the
   * default first and fall back to the top when no default is set.
   */
  (
    e: 'payee-selected',
    payload: { payeeId: string; defaultCategoryId: string | null; topCategoryId: string | null },
  ): void;
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isOpen = ref(false);
const inputValue = ref('');
const debouncedRaw = useDebounce(inputValue, DEBOUNCE_MS);
const debouncedQuery = computed(() => debouncedRaw.value.trim());

// Sort by last-seen so the most recently used payees lead — that's what the
// user typically reaches for when entering a new transaction. The backend
// default is `transactionCount`, which would surface lifetime favourites
// instead of "what I just paid".
//
// On a shared account we swap to `useAccountPayees` so the dropdown shows
// the account owner's payees (matching the backend write-path validation).
// The inactive composable is left disabled to keep cache keys distinct and
// avoid double fetches.
const ownerFetch = useAccountPayees({
  accountId: () => props.accountId ?? undefined,
  q: computed(() => (debouncedQuery.value.length > 0 ? debouncedQuery.value : undefined)),
  sortBy: 'lastSeen',
  sortDir: 'desc',
  enabled: computed(() => props.ownerScoped && props.accountId !== null),
});
const callerFetch = usePayees({
  q: computed(() => (debouncedQuery.value.length > 0 ? debouncedQuery.value : undefined)),
  sortBy: 'lastSeen',
  sortDir: 'desc',
  enabled: computed(() => !props.ownerScoped),
});
const allPayees = computed(() => (props.ownerScoped ? ownerFetch.list.value : callerFetch.list.value));
const isFetching = computed(() => (props.ownerScoped ? ownerFetch.isFetching.value : callerFetch.isFetching.value));

const displayPayees = computed(() =>
  props.excludeId ? allPayees.value.filter((p) => p.id !== props.excludeId) : allPayees.value,
);

const exactMatch = computed(() => {
  if (debouncedQuery.value.length === 0) return null;
  const lowered = debouncedQuery.value.toLowerCase();
  return allPayees.value.find((p) => p.name.toLowerCase() === lowered) ?? null;
});

// Inline create is disabled in owner-scoped mode — the caller can't create
// payees in the account owner's namespace from the transaction form.
const canCreateInline = computed(
  () => !props.ownerScoped && debouncedQuery.value.length > 0 && exactMatch.value === null,
);

const selectedLabel = computed(() => {
  if (!props.modelValue) return '';
  const fromCache = allPayees.value.find((p) => p.id === props.modelValue);
  return fromCache?.name ?? '';
});

const placeholderResolved = computed(() => props.placeholder ?? t('fields.payeeSelect.placeholder'));

function selectPayee(payee: {
  id: string;
  defaultCategoryId: string | null;
  stats?: { topCategoryId: string | null } | null;
}) {
  emit('update:modelValue', payee.id);
  emit('payee-selected', {
    payeeId: payee.id,
    defaultCategoryId: payee.defaultCategoryId,
    topCategoryId: payee.stats?.topCategoryId ?? null,
  });
  isOpen.value = false;
  inputValue.value = '';
}

function clearSelection() {
  emit('update:modelValue', null);
}

const createMutation = useCreatePayee();

async function createInline() {
  const name = debouncedQuery.value;
  if (!name) return;
  try {
    const created = await createMutation.mutateAsync({ name });
    addSuccessNotification(t('fields.payeeSelect.createdToast', { name: created.name }));
    selectPayee({ id: created.id, defaultCategoryId: created.defaultCategoryId });
  } catch (error) {
    addErrorNotification(t('fields.payeeSelect.createFailed'));
  }
}
</script>

<template>
  <FieldLabel :label="label" only-template>
    <Popover.Popover :open="isOpen" @update:open="(open: boolean) => (isOpen = open)">
      <Popover.PopoverTrigger as-child>
        <button
          type="button"
          :disabled="disabled"
          :class="
            cn(
              'border-input bg-input-background ring-offset-background flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
              disabled && 'cursor-not-allowed opacity-50',
            )
          "
          data-test="payee-select-field"
        >
          <span
            class="text-muted-foreground min-w-0 flex-1 truncate text-left"
            :class="{ 'text-foreground': selectedLabel }"
          >
            {{ selectedLabel || placeholderResolved }}
          </span>
          <span
            v-if="modelValue && !disabled"
            role="button"
            tabindex="0"
            class="text-muted-foreground hover:text-foreground inline-flex shrink-0 cursor-pointer"
            :aria-label="t('common.actions.clear')"
            @click.stop="clearSelection"
            @keydown.enter.stop="clearSelection"
            @keydown.space.stop.prevent="clearSelection"
          >
            <XIcon class="size-4" />
          </span>
        </button>
      </Popover.PopoverTrigger>

      <Popover.PopoverContent class="w-(--reka-popover-trigger-width) p-0" align="start" :side-offset="4">
        <div class="border-input border-b p-2">
          <div class="relative">
            <SearchIcon class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <input
              v-model="inputValue"
              type="text"
              class="border-input bg-input-background h-9 w-full rounded-md border pr-2 pl-8 text-sm focus:outline-none"
              :placeholder="t('fields.payeeSelect.searchPlaceholder')"
              data-test="payee-select-search"
            />
          </div>
        </div>

        <ScrollArea :class="canCreateInline ? 'max-h-72' : 'max-h-64'">
          <div role="listbox">
            <button
              v-for="item in displayPayees"
              :key="item.id"
              type="button"
              role="option"
              :aria-selected="modelValue === item.id"
              class="hover:bg-popover-foreground/10 flex w-full items-center gap-2 border-none p-2 text-left text-sm"
              :class="{ 'bg-primary/15 hover:bg-primary/20': modelValue === item.id }"
              @click="selectPayee(item)"
            >
              <span class="min-w-0 grow truncate">{{ item.name }}</span>
            </button>

            <div
              v-if="displayPayees.length === 0 && !isFetching && !canCreateInline"
              class="text-muted-foreground p-4 text-center text-sm"
            >
              {{ $t('fields.payeeSelect.empty') }}
            </div>

            <Button
              v-if="canCreateInline"
              variant="ghost"
              class="w-full justify-start gap-2 rounded-none border-t"
              :disabled="createMutation.isPending.value"
              data-test="payee-select-create"
              @click="createInline"
            >
              <PlusIcon class="size-4" />
              {{ $t('fields.payeeSelect.createAffordance', { name: debouncedQuery }) }}
            </Button>
          </div>
        </ScrollArea>
      </Popover.PopoverContent>
    </Popover.Popover>
  </FieldLabel>
</template>
