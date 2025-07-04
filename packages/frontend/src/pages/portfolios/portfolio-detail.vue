<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <div class="flex gap-4 items-center">
        <router-link :to="{ name: ROUTES_NAMES.investments }" class="text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon class="w-5 h-5" />
        </router-link>
        <h1 v-if="portfolio" class="text-2xl tracking-wider">{{ portfolio.name }}</h1>
        <h1 v-else-if="isLoading" class="text-2xl tracking-wider">Loading...</h1>
      </div>

      <div v-if="portfolio" class="flex gap-3">
        <PortfolioTransferDialog :portfolio="portfolio" context="portfolio" @success="refetch">
          <UiButton variant="outline">
            <ArrowRightLeftIcon class="mr-2 size-4" />
            Transfer
          </UiButton>
        </PortfolioTransferDialog>

        <EditPortfolioDialog :portfolio="portfolio" @updated="refetch">
          <UiButton variant="outline"> Edit </UiButton>
        </EditPortfolioDialog>

        <DeletePortfolioDialog :portfolio-id="portfolio.id" @deleted="handleDeletion">
          <UiButton variant="destructive">
            <Trash2Icon class="mr-2 size-4" />
            Delete
          </UiButton>
        </DeletePortfolioDialog>
      </div>
    </div>

    <div v-if="portfolio" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <div class="grid gap-6">
          <PortfolioBalance />
          <HoldingsSummary :portfolio-id="portfolioId" />
        </div>
      </div>
      <!-- <div>
        <PortfolioOverview :portfolio="portfolio" />
      </div> -->
    </div>

    <div v-else-if="isLoading" class="py-12 text-center">
      <p class="text-muted-foreground">Loading portfolio details...</p>
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="mb-4 text-destructive">Failed to load portfolio details.</p>
      <UiButton @click="refetch">Try Again</UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import DeletePortfolioDialog from '@/components/dialogs/delete-portfolio-dialog.vue';
import EditPortfolioDialog from '@/components/dialogs/edit-portfolio-dialog.vue';
import PortfolioTransferDialog from '@/components/dialogs/portfolio-transfer-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { usePortfolio } from '@/composable/data-queries/portfolios';
import { ROUTES_NAMES } from '@/routes/constants';
import { ArrowRightLeftIcon, ChevronLeftIcon, Trash2Icon } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import HoldingsSummary from './components/holdings-summary.vue';
import PortfolioBalance from './components/portfolio-balance.vue';

// import PortfolioOverview from './components/portfolio-overview.vue';

const route = useRoute();
const router = useRouter();
const portfolioId = computed(() => Number(route.params.portfolioId));

const { data: portfolio, isLoading, error, refetch } = usePortfolio(portfolioId);

const handleDeletion = () => {
  router.push({ name: ROUTES_NAMES.investments });
};
</script>
