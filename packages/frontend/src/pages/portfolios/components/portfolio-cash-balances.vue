<template>
  <Card>
    <CardHeader class="pb-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
          <WalletIcon class="text-primary size-5" />
        </div>
        <CardTitle class="text-lg">{{ $t('portfolioDetail.cashBalances.title') }}</CardTitle>

        <DirectCashTransactionDialog :portfolio-id="portfolioId" :portfolio="portfolio">
          <UiButton variant="outline" size="sm">
            <PlusIcon class="mr-2 size-4" />
            {{ $t('portfolioDetail.cashBalances.cashTransactions.addButton') }}
          </UiButton>
        </DirectCashTransactionDialog>

        <PortfolioTransferDialog :portfolio="portfolio" context="portfolio">
          <UiButton variant="outline" size="sm">
            <ArrowRightLeftIcon class="mr-2 size-4" />
            {{ $t('portfolioDetail.actions.transfer') }}
          </UiButton>
        </PortfolioTransferDialog>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <PillTabs v-model="activeTab" :items="tabItems" size="lg" />

      <div class="mt-4">
        <PortfolioCashOverview v-if="activeTab === 'balances'" :portfolio-id="portfolioId" />
        <PortfolioCashTransactionsList
          v-else-if="activeTab === 'cash-transactions'"
          :portfolio-id="portfolioId"
          :portfolio="portfolio"
        />
        <PortfolioBuysSellsList v-else-if="activeTab === 'buys-sells'" :portfolio-id="portfolioId" />
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import DirectCashTransactionDialog from '@/components/dialogs/direct-cash-transaction-dialog.vue';
import PortfolioTransferDialog from '@/components/dialogs/portfolio-transfer-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/lib/ui/card';
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { ArrowRightLeftIcon, PlusIcon, WalletIcon } from 'lucide-vue-next';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

import type { PortfolioModel } from '@bt/shared/types';

import PortfolioBuysSellsList from './portfolio-buys-sells-list.vue';
import PortfolioCashOverview from './portfolio-cash-overview.vue';
import PortfolioCashTransactionsList from './portfolio-cash-transactions-list.vue';

const props = defineProps<{ portfolioId: number; portfolio: PortfolioModel }>();
const portfolioId = toRef(props, 'portfolioId');

const { t } = useI18n();

const activeTab = ref('balances');

const tabItems = computed(() => [
  { value: 'balances', label: t('portfolioDetail.cashBalances.tabs.balances') },
  { value: 'cash-transactions', label: t('portfolioDetail.cashBalances.tabs.cashTransactions') },
  { value: 'buys-sells', label: t('portfolioDetail.cashBalances.tabs.buysSells') },
]);
</script>
