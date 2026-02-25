<script setup lang="ts">
import { useNotificationCenter } from '@/components/notification-center';
import { cn } from '@/lib/utils';
import { CheckIcon, CopyIcon } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  value: string;
}>();

const { addErrorNotification } = useNotificationCenter();
const { t } = useI18n();

const isCopied = ref(false);
const copyToClipboard = async ({ value }: { value: string }) => {
  try {
    await navigator.clipboard.writeText(value);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch {
    addErrorNotification(t('common.errors.copyToClipboardFailed'));
  }
};
</script>

<template>
  <button
    type="button"
    :class="
      cn(
        'bg-muted inline-flex w-min max-w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-white/10',
        $attrs.class as string,
      )
    "
    @click="copyToClipboard({ value })"
  >
    <span class="truncate font-mono text-sm">
      {{ value }}
    </span>
    <CheckIcon v-if="isCopied" class="text-success-text size-4" />
    <CopyIcon v-else class="text-muted-foreground size-4 shrink-0" />
  </button>
</template>
