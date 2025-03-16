<script setup lang="ts">
import { AccountModel } from '@bt/shared/types';

import AccountItem from './accounts-item.vue';

defineProps<{
  accounts: AccountModel[];
}>();
</script>

<template>
  <template v-for="account in accounts" :key="account.id">
    <AccountItem :account="account" />
  </template>
</template>
