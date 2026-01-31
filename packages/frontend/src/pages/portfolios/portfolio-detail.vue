<template>
  <div class="p-6">
    <!-- Header Section with improved layout -->
    <div class="mb-8">
      <!-- Back button row -->
      <div class="mb-4">
        <router-link
          :to="{ name: ROUTES_NAMES.investments }"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ChevronLeftIcon class="size-4" />
          <span>{{ $t('portfolioDetail.backToInvestments') }}</span>
        </router-link>
      </div>

      <!-- Title and Actions row -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div class="bg-primary/10 flex size-10 items-center justify-center rounded-lg">
            <BriefcaseIcon class="text-primary size-5" />
          </div>
          <div>
            <h1 v-if="portfolio" class="text-2xl font-semibold tracking-tight">{{ portfolio.name }}</h1>
            <h1 v-else-if="isLoading" class="text-2xl font-semibold tracking-tight">
              {{ $t('portfolioDetail.loading') }}
            </h1>
            <p v-if="portfolio" class="text-muted-foreground text-sm">{{ $t('portfolioDetail.subtitle') }}</p>
          </div>
        </div>

        <div v-if="portfolio" class="flex flex-wrap items-center gap-2">
          <PortfolioTransferDialog :portfolio="portfolio" context="portfolio" @success="refetch">
            <UiButton variant="outline" size="sm">
              <ArrowRightLeftIcon class="mr-2 size-4" />
              {{ $t('portfolioDetail.actions.transfer') }}
            </UiButton>
          </PortfolioTransferDialog>

          <EditPortfolioDialog :portfolio="portfolio" @updated="refetch">
            <UiButton variant="outline" size="sm">
              <PencilIcon class="mr-2 size-4" />
              {{ $t('portfolioDetail.actions.edit') }}
            </UiButton>
          </EditPortfolioDialog>

          <DeletePortfolioDialog :portfolio-id="portfolio.id" @deleted="handleDeletion">
            <UiButton variant="destructive" size="sm">
              <Trash2Icon class="mr-2 size-4" />
              {{ $t('portfolioDetail.actions.delete') }}
            </UiButton>
          </DeletePortfolioDialog>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div v-if="portfolio" class="grid gap-6">
      <PortfolioBalance :portfolio-id="portfolioId" />
      <HoldingsSummary :portfolio-id="portfolioId" />
    </div>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="py-12 text-center">
      <div
        class="border-primary/20 mb-4 inline-flex size-12 items-center justify-center rounded-full border-2 border-t-transparent"
      >
        <div class="bg-primary/20 size-6 animate-pulse rounded"></div>
      </div>
      <p class="text-muted-foreground">{{ $t('portfolioDetail.loadingDetails') }}</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="py-12 text-center">
      <div class="bg-destructive/10 mb-4 inline-flex size-12 items-center justify-center rounded-full">
        <AlertCircleIcon class="text-destructive size-6" />
      </div>
      <p class="text-destructive mb-4">{{ $t('portfolioDetail.loadError') }}</p>
      <UiButton @click="refetch">{{ $t('portfolioDetail.tryAgain') }}</UiButton>
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
import {
  AlertCircleIcon,
  ArrowRightLeftIcon,
  BriefcaseIcon,
  ChevronLeftIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-vue-next';
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
