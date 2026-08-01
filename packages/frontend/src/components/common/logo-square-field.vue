<script setup lang="ts">
import BrandLogo from '@/components/common/brand-logo.vue';
import { type LogoSelection, toLogoDisplayProps } from '@/components/common/logo-selection';
import LogoSearch from '@/components/common/logo-search.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { PencilIcon, RotateCcwIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

const props = defineProps<{
  /** Chosen brand or monogram. null = let the backend auto-resolve from the name. */
  modelValue: LogoSelection | null;
  /** Entity name – drives the monogram preview and seeds the search query. */
  nameForSearch: string;
  disabled?: boolean;
  /** Visual size class applied to the square (Tailwind size-* utility). */
  sizeClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: LogoSelection | null): void;
}>();

const isOpen = ref(false);

const logoDisplay = computed(() => toLogoDisplayProps({ selection: props.modelValue }));

function handleSelect(selection: LogoSelection) {
  emit('update:modelValue', selection);
  isOpen.value = false;
}

function handleReset() {
  emit('update:modelValue', null);
  isOpen.value = false;
}
</script>

<template>
  <div class="group relative shrink-0">
    <BrandLogo v-bind="logoDisplay" :name="nameForSearch" :class="cn('size-10 text-base', sizeClass)" />
    <Button
      type="button"
      variant="ghost"
      size="icon"
      :disabled="disabled"
      :class="
        cn(
          'bg-background/80 hover:bg-background absolute inset-0 size-full rounded-[inherit] opacity-0 backdrop-blur-sm transition-opacity',
          !disabled && 'group-focus-within:opacity-100 group-hover:opacity-100',
        )
      "
      :aria-label="$t('common.logo.editAriaLabel')"
      data-test="logo-square-field"
      @click="isOpen = true"
    >
      <PencilIcon class="size-4" />
    </Button>

    <ResponsiveDialog v-model:open="isOpen">
      <template #title>{{ $t('common.logo.dialogTitle') }}</template>
      <template #description>{{ $t('common.logo.domainHint') }}</template>

      <template #default>
        <div class="flex flex-col gap-4">
          <div class="border-input min-h-86 flex-1 overflow-hidden rounded-md border">
            <LogoSearch :selection="modelValue" :name-for-search="nameForSearch" @select="handleSelect" />
          </div>

          <div class="flex items-center justify-between gap-2 border-t pt-2">
            <Button variant="ghost" size="sm" :disabled="!modelValue" @click="handleReset">
              <RotateCcwIcon class="size-4" />
              {{ $t('common.logo.resetToAuto') }}
            </Button>
            <Button variant="ghost" @click="isOpen = false">{{ $t('common.actions.cancel') }}</Button>
          </div>
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>
