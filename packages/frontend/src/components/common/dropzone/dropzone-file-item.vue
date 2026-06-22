<!--
  One selected-file row: icon, name, formatted size, and a remove button. Shared by
  both the single- and multi-file dropzones so the row markup lives in one place.
-->
<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { formatBytes } from '@/common/utils/format-bytes';
import { FileTextIcon, XIcon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  file: File;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'remove'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="border-border/60 bg-muted/30 flex items-center justify-between gap-3 rounded-lg border p-3">
    <div class="flex min-w-0 items-center gap-3">
      <div class="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">
        <FileTextIcon class="text-primary size-4" />
      </div>
      <div class="min-w-0">
        <p class="truncate text-sm font-medium">{{ file.name }}</p>
        <p class="text-muted-foreground text-xs">{{ formatBytes({ bytes: file.size }) }}</p>
      </div>
    </div>
    <DesktopOnlyTooltip :content="t('fileDropzone.removeFile')">
      <Button
        variant="ghost"
        size="icon-sm"
        :disabled="disabled"
        :aria-label="t('fileDropzone.removeFile')"
        @click="emit('remove')"
      >
        <XIcon class="size-4" />
      </Button>
    </DesktopOnlyTooltip>
  </div>
</template>
