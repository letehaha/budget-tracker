<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">Data Management</h2>
      <p class="text-sm opacity-80">Import and export your financial data</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <div>
        <h3 class="mb-2 text-lg font-medium">Import CSV</h3>
        <p class="mb-4 text-sm leading-relaxed">
          Import transactions from a CSV file. You can map columns, handle duplicates, and create new accounts or
          categories as needed.
        </p>

        <router-link :to="{ name: ROUTES_NAMES.importCsv }">
          <Button>
            <UploadIcon class="mr-2 h-4 w-4" />
            Import CSV File
          </Button>
        </router-link>
      </div>

      <DeleteAccountSection />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes';
import { UploadIcon } from 'lucide-vue-next';

import DeleteAccountSection from './delete-account-section.vue';
</script>
