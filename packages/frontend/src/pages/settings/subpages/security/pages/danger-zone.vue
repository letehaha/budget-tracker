<template>
  <div class="border-destructive @container/danger-zone grid gap-6 rounded-xl border p-4">
    <p class="text-xl font-medium">{{ $t('settings.security.dangerZone') }}</p>
    <WipeDataSection />
    <div class="border-destructive/40 border-t" />
    <DeleteAccountSection />
  </div>
</template>

<script setup lang="ts">
import DeleteAccountSection from '../components/delete-account-section.vue';
import WipeDataSection from '../components/wipe-data-section.vue';

defineOptions({
  name: 'settings-security-danger',
});
</script>
