<template>
  <Card class="p-6">
    <div class="mb-6 text-center">
      <h2 class="text-2xl font-semibold">Welcome to MoneyMatter 🎉</h2>
      <p class="text-muted-foreground mt-2">Get started by adding your first account</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <CreateAccountDialog>
        <Card class="hover:bg-accent/50 cursor-pointer p-4 transition-colors">
          <div class="flex flex-col items-center gap-3 text-center">
            <div class="bg-primary/10 rounded-full p-3">
              <WalletIcon class="text-primary size-6" />
            </div>
            <div>
              <h3 class="font-medium">Create Manual Account</h3>
              <p class="text-muted-foreground mt-1 text-sm">Add a cash account or track expenses manually</p>
            </div>
          </div>
        </Card>
      </CreateAccountDialog>

      <Card class="hover:bg-accent/50 cursor-pointer p-4 transition-colors" @click="navigateToIntegrations">
        <div class="flex flex-col items-center gap-3 text-center">
          <div class="bg-primary/10 rounded-full p-3">
            <LandmarkIcon class="text-primary size-6" />
          </div>
          <div>
            <h3 class="font-medium">Connect Your Bank</h3>
            <p class="text-muted-foreground mt-1 text-sm">Automatically sync transactions from your bank</p>
          </div>
        </div>
      </Card>
    </div>
  </Card>
</template>

<script setup lang="ts">
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import { Card } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes';
import { LandmarkIcon, WalletIcon } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

const router = useRouter();

const navigateToIntegrations = () => {
  router.push({ name: ROUTES_NAMES.accountIntegrations });
};
</script>
