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

    <p class="mt-4 text-xs">
      <DocsLink path="/settings/security-and-account/#backup-or-export">
        {{ $t('settings.dataManagement.export.backupOrExportHint') }}
      </DocsLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import DocsLink from '@/components/common/docs-link.vue';
import { ROUTES_NAMES } from '@/routes';
import { DownloadIcon } from '@lucide/vue';

import DataSourceRow from '../components/data-source-row.vue';

defineOptions({
  name: 'settings-data-management-export',
});
</script>
