<template>
  <div class="@lg/data-mgmt:max-w-[calc(50%-0.5rem)]">
    <RouterLink
      :to="{ name: ROUTES_NAMES.settingsDataManagementExportConfigure }"
      class="border-border group hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-ring relative flex flex-col gap-4 rounded-lg border p-5 transition-[background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:outline-none"
    >
      <div>
        <div class="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
          <DownloadIcon class="size-5" />
        </div>
      </div>

      <div class="flex flex-1 flex-col">
        <h3 class="mb-1.5 font-semibold text-balance">
          {{ $t('settings.dataManagement.export.cardTitle') }}
        </h3>
        <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
          {{ $t('settings.dataManagement.export.cardDescription') }}
        </p>
      </div>

      <div
        class="text-muted-foreground group-hover:text-primary flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
      >
        {{ $t('settings.dataManagement.export.cta') }}
        <ArrowRightIcon class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { ROUTES_NAMES } from '@/routes';
import { ArrowRightIcon, DownloadIcon } from '@lucide/vue';
import { RouterLink } from 'vue-router';

defineOptions({
  name: 'settings-data-management-export',
});
</script>
