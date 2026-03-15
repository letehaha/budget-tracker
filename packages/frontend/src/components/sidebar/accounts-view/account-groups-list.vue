<script setup lang="ts">
import type { AccountGroups } from '@/common/types/models';
import { computed } from 'vue';

import AccountGroup from './account-group.vue';

const props = defineProps<{
  groups: AccountGroups[];
}>();

const sortedGroups = computed(() => [...props.groups].sort((a, b) => a.name.localeCompare(b.name)));
</script>

<template>
  <template v-for="group in sortedGroups" :key="group.id">
    <AccountGroup v-if="group.accounts.length" :group="group" />
  </template>
</template>
