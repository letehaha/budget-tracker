<script setup lang="ts">
import type { AccountGroups } from '@/common/types/models';

import AccountGroup from './account-group.vue';

defineProps<{
  groups: AccountGroups[];
}>();
</script>

<template>
  <template v-for="group in groups" :key="group.id">
    <AccountGroup v-if="group.accounts.length" :group="group" />
  </template>
</template>
