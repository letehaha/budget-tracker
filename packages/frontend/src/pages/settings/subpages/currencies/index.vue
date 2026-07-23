<template>
  <Card class="@container/currencies max-w-4xl">
    <CardHeader
      class="flex flex-col gap-4 border-b @sm/currencies:flex-row @sm/currencies:items-start @sm/currencies:justify-between"
    >
      <div class="min-w-0">
        <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.currencies.page.title') }}</h2>
        <p class="text-sm opacity-80">
          {{ $t('settings.currencies.page.description') }}
          <HowItWorksPopover />
        </p>
      </div>

      <div class="@sm/currencies:shrink-0">
        <AddNewCurrency />
      </div>
    </CardHeader>

    <CardContent class="mt-6">
      <CurrenciesList />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import AddNewCurrency from './add-new-currency.vue';
import HowItWorksPopover from './how-it-works-popover.vue';
import CurrenciesList from './list.vue';
</script>
