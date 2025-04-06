<template>
  <div class="p-6">
    <Card class="sticky h-min w-[440px] top-[var(--header-height)] p-4">
      <CreateAccountForm class="max-w-[440px]" @created="pushToAccountsPage" />
    </Card>
  </div>
</template>

<script setup lang="ts">
import CreateAccountForm from '@/components/forms/create-account-form.vue';
import { Card } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes/constants';
import { useRouter } from 'vue-router';

const router = useRouter();
const pushToAccountsPage = () => {
  router.push({ name: ROUTES_NAMES.accounts });
};
</script>
