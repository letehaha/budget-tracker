<script setup lang="ts">
import BrandLogo from '@/components/common/brand-logo.vue';
import LogoSearch from '@/components/common/logo-search.vue';
import { Button } from '@/components/lib/ui/button';
import * as Popover from '@/components/lib/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, XIcon } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  /** Selected logo domain. null = let the backend auto-resolve from the name. */
  modelValue: string | null;
  /** Entity name – drives the monogram preview and seeds the search query. */
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
      <Button
        variant="outline"
        :disabled="disabled"
        :class="cn('border-input bg-input-background h-10 w-full justify-start gap-2 px-3 py-2 text-sm font-normal')"
        data-test="logo-field"
      >
        <BrandLogo :domain="modelValue" :name="nameForSearch" class="size-6" />
        <span
          class="min-w-0 flex-1 truncate text-left"
          :class="modelValue ? 'text-foreground' : 'text-muted-foreground'"
        >
          {{ modelValue || $t('common.logo.autoLabel') }}
        </span>
        <Button
          v-if="modelValue && !disabled"
          as="span"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-foreground shrink-0"
          :aria-label="t('common.actions.clear')"
          @click.stop="clearSelection"
        >
          <XIcon class="size-4" />
        </Button>
        <ChevronDownIcon class="text-muted-foreground size-4 shrink-0 opacity-70" />
      </Button>
    </Popover.PopoverTrigger>

    <Popover.PopoverContent class="w-(--reka-popover-trigger-width) p-0" align="start" :side-offset="4">
      <LogoSearch :model-value="modelValue" :name-for-search="nameForSearch" @update:model-value="handlePick" />
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
