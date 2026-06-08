<template>
  <div class="@lg/data-mgmt:max-w-[calc(50%-0.5rem)]">
    <DataExportCard />
  </div>
</template>

<script setup lang="ts">
import DataExportCard from '../components/data-export-card.vue';

defineOptions({
  name: 'settings-data-management-export',
});
</script>
