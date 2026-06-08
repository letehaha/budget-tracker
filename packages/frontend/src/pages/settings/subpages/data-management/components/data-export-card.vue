<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { DownloadIcon } from '@lucide/vue';
import { ref } from 'vue';

import DataExportDialog from './data-export-dialog.vue';

const isOpen = ref(false);
</script>

<template>
  <Button
    variant="ghost"
    class="border-border group hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-ring relative flex h-auto w-full flex-col items-stretch gap-4 rounded-lg border p-5 text-left whitespace-normal transition-[background-color,border-color] duration-200"
    @click="isOpen = true"
  >
    <div>
      <div class="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
        <DownloadIcon class="size-5" />
      </div>
    </div>

    <div class="flex flex-1 flex-col">
      <span class="mb-1.5 block font-semibold text-balance">
        {{ $t('settings.dataManagement.export.cardTitle') }}
      </span>
      <span class="text-muted-foreground mb-4 block text-sm leading-relaxed">
        {{ $t('settings.dataManagement.export.cardDescription') }}
      </span>
    </div>

    <div
      class="text-muted-foreground group-hover:text-primary flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
    >
      {{ $t('settings.dataManagement.export.cta') }}
    </div>
  </Button>

  <DataExportDialog v-model:open="isOpen" />
</template>
