<template>
  <Card>
    <CardHeader class="pb-4">
      <div class="flex items-center gap-3">
        <div class="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
          <WalletIcon class="text-primary size-5" />
        </div>
        <div>
          <CardTitle class="text-lg">{{ $t('portfolioDetail.cashBalances.title') }}</CardTitle>
        </div>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <!-- Balances grid -->
      <PortfolioCashOverview :portfolio-id="portfolioId" />

      <!-- Tabs -->
      <div class="mt-6">
        <PillTabs v-model="activeTab" :items="tabItems" size="lg" />

        <div class="mt-4">
          <PortfolioCashTransactionsList v-if="activeTab === 'cash-transactions'" :portfolio-id="portfolioId" />
          <PortfolioBuysSellsList v-else-if="activeTab === 'buys-sells'" :portfolio-id="portfolioId" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/lib/ui/card';
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { WalletIcon } from 'lucide-vue-next';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

import PortfolioBuysSellsList from './portfolio-buys-sells-list.vue';
import PortfolioCashOverview from './portfolio-cash-overview.vue';
import PortfolioCashTransactionsList from './portfolio-cash-transactions-list.vue';

const props = defineProps<{ portfolioId: number }>();
const portfolioId = toRef(props, 'portfolioId');

const { t } = useI18n();

const activeTab = ref('cash-transactions');

const tabItems = computed(() => [
  { value: 'cash-transactions', label: t('portfolioDetail.cashBalances.tabs.cashTransactions') },
  { value: 'buys-sells', label: t('portfolioDetail.cashBalances.tabs.buysSells') },
]);
</script>
