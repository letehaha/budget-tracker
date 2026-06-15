<script setup lang="ts">
import AsyncLogo from '@/components/common/async-logo.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import {
  useResetPayeeLogo,
  useSearchPayeeLogo,
  useUpdatePayee,
  type PayeeLogoSearchResult,
} from '@/composable/data-queries/payees';
import { captureException } from '@/lib/sentry';
import { RotateCcwIcon, SearchIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  payeeId: string;
  payeeName: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n({ useScope: 'global' });
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});

const searchQuery = ref('');
const searchResults = ref<PayeeLogoSearchResult[]>([]);
const hasSearched = ref(false);

// Pre-fill the search input with the payee name when the dialog opens.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    searchQuery.value = props.payeeName;
    searchResults.value = [];
    hasSearched.value = false;
  },
);

const searchMut = useSearchPayeeLogo();
const updateMut = useUpdatePayee();
const resetMut = useResetPayeeLogo();

async function handleFind() {
  const q = searchQuery.value.trim();
  if (!q || searchMut.isPending.value) return;
  try {
    const { results } = await searchMut.mutateAsync({ q });
    searchResults.value = results;
    hasSearched.value = true;
  } catch (error) {
    captureException({ error, context: { flow: 'searchPayeeLogo' } });
    addErrorNotification(t('payees.errors.generic'));
  }
}

async function handlePickResult({ domain }: PayeeLogoSearchResult) {
  try {
    await updateMut.mutateAsync({ id: props.payeeId, payload: { logoDomain: domain } });
    addSuccessNotification(t('payees.logo.updatedToast'));
    isOpen.value = false;
  } catch (error) {
    captureException({ error, context: { flow: 'setPayeeLogo' } });
    addErrorNotification(t('payees.errors.generic'));
  }
}

async function handleReset() {
  try {
    await resetMut.mutateAsync({ id: props.payeeId });
    addSuccessNotification(t('payees.logo.resetToast'));
    isOpen.value = false;
  } catch (error) {
    captureException({ error, context: { flow: 'resetPayeeLogo' } });
    addErrorNotification(t('payees.errors.generic'));
  }
}

const isSubmitting = computed(() => updateMut.isPending.value || resetMut.isPending.value);
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>
      <span class="text-lg font-semibold">{{ $t('payees.logo.dialogTitle') }}</span>
    </template>
    <template #description>{{ $t('payees.logo.dialogDescription') }}</template>

    <template #default>
      <div class="flex flex-col gap-4 p-4">
        <!-- Search row -->
        <div class="flex items-end gap-2">
          <div class="min-w-0 flex-1">
            <InputField
              v-model="searchQuery"
              :label="$t('payees.logo.searchLabel')"
              :placeholder="$t('payees.logo.searchPlaceholder')"
              @keydown.enter="handleFind"
            />
          </div>
          <Button
            variant="outline"
            :disabled="!searchQuery.trim() || searchMut.isPending.value"
            :loading="searchMut.isPending.value"
            class="shrink-0"
            @click="handleFind"
          >
            <SearchIcon class="size-4" />
            {{ $t('payees.logo.find') }}
          </Button>
        </div>

        <!-- Results list -->
        <div v-if="hasSearched" class="flex flex-col gap-1">
          <p class="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
            {{ $t('payees.logo.resultsLabel') }}
          </p>

          <div
            v-if="searchResults.length === 0"
            class="border-border bg-muted/20 text-muted-foreground flex flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-center"
          >
            <SearchIcon class="size-5" />
            <p class="text-sm">{{ $t('payees.logo.noResults') }}</p>
          </div>

          <Button
            v-for="result in searchResults"
            :key="result.domain"
            variant="ghost"
            :disabled="isSubmitting"
            class="h-auto w-full justify-start gap-3 rounded-md px-3 py-2 text-left"
            @click="handlePickResult(result)"
          >
            <AsyncLogo :url="result.logoUrl" :alt="result.name" class="size-8 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ result.name }}</p>
              <p class="text-muted-foreground truncate text-xs">{{ result.domain }}</p>
            </div>
          </Button>
        </div>

        <!-- Footer actions -->
        <div class="flex items-center justify-between gap-2 border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            :disabled="isSubmitting"
            :loading="resetMut.isPending.value"
            @click="handleReset"
          >
            <RotateCcwIcon class="size-4" />
            {{ $t('payees.logo.resetToAuto') }}
          </Button>
          <Button variant="ghost" :disabled="isSubmitting" @click="isOpen = false">
            {{ $t('common.actions.cancel') }}
          </Button>
        </div>
      </div>
    </template>
  </ResponsiveDialog>
</template>
