<template>
  <div class="max-w-2xl">
    <div class="divide-border divide-y overflow-hidden rounded-lg border">
      <DataSourceRow
        :icon="DownloadIcon"
        :title="$t('settings.dataManagement.export.cardTitle')"
        :description="$t('settings.dataManagement.export.listDescription')"
        :to="{ name: ROUTES_NAMES.settingsDataManagementExportConfigure }"
        accent
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ROUTES_NAMES } from '@/routes';
import { DownloadIcon } from '@lucide/vue';

import DataSourceRow from '../components/data-source-row.vue';

defineOptions({
  name: 'settings-data-management-export',
});
</script>
