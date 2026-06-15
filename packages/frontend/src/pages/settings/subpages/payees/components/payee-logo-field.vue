<script setup lang="ts">
import * as Popover from '@/components/lib/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, XIcon } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import PayeeLogo from './payee-logo.vue';
import PayeeLogoSearch from './payee-logo-search.vue';

const props = defineProps<{
  /** Selected logo domain. null = let the backend auto-resolve from the name. */
  modelValue: string | null;
  /** Payee name — drives the monogram preview and seeds the search query. */
  nameForSearch: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

const { t } = useI18n({ useScope: 'global' });

const isOpen = ref(false);

function handlePick(domain: string) {
  emit('update:modelValue', domain);
  isOpen.value = false;
}

function clearSelection() {
  emit('update:modelValue', null);
}
</script>

<template>
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
        data-test="payee-logo-field"
      >
        <PayeeLogo :domain="modelValue" :name="nameForSearch" class="size-6" />
        <span
          class="min-w-0 flex-1 truncate text-left"
          :class="modelValue ? 'text-foreground' : 'text-muted-foreground'"
        >
          {{ modelValue || $t('payees.logo.autoLabel') }}
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
        <ChevronDownIcon class="text-muted-foreground size-4 shrink-0 opacity-70" />
      </button>
    </Popover.PopoverTrigger>

    <Popover.PopoverContent class="w-(--reka-popover-trigger-width) p-0" align="start" :side-offset="4">
      <PayeeLogoSearch :model-value="modelValue" :name-for-search="nameForSearch" @update:model-value="handlePick" />
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
