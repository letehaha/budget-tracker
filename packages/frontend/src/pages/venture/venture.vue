<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import VentureDealForm from '@/components/forms/venture-deal-form.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent } from '@/components/lib/ui/card';
import { VENTURE_DEAL_STATUS_META } from '@/common/const/venture-deal-status';
import { formatShortDate } from '@/common/utils/date';
import { useFormatCurrency } from '@/composable/formatters';
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { useVenturePlatforms } from '@/composable/data-queries/venture/platforms';
import { ROUTES_NAMES } from '@/routes';
import { type VentureDealModel } from '@bt/shared/types';
import { PlusIcon, RocketIcon, SettingsIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

const { data: dealsData, isPending } = useVentureDeals();
const deals = computed<VentureDealModel[]>(() => dealsData.value?.data ?? []);

const { data: platformsData } = useVenturePlatforms();
const platformsCount = computed(() => platformsData.value?.data?.length ?? 0);

const createDialogOpen = ref(false);

const { formatAmountByCurrencyCode } = useFormatCurrency();

const onDealCreated = () => {
  createDialogOpen.value = false;
};
</script>

<template>
  <div class="@container/venture mx-auto w-full p-4 md:p-6">
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl leading-tight font-semibold @md/venture:text-4xl">{{ $t('venture.title') }}</h1>
        <p class="text-muted-foreground mt-2 max-w-md text-sm">{{ $t('venture.subtitle') }}</p>
      </div>
      <div class="flex gap-2">
        <router-link :to="{ name: ROUTES_NAMES.venturePlatformsList }">
          <UiButton variant="secondary">
            <SettingsIcon class="size-4" />
            <span>{{ $t('venture.managePlatforms') }}</span>
          </UiButton>
        </router-link>
        <UiButton @click="createDialogOpen = true">
          <PlusIcon class="size-4" />
          <span>{{ $t('venture.deals.createButton') }}</span>
        </UiButton>
      </div>
    </div>

    <div v-if="isPending" class="grid gap-3">
      <div v-for="i in 3" :key="i" class="bg-muted h-28 w-full animate-pulse rounded-md" />
    </div>

    <Card v-else-if="deals.length === 0">
      <CardContent class="flex flex-col items-center gap-3 py-12 text-center">
        <RocketIcon class="text-muted-foreground size-10" />
        <h3 class="text-lg font-medium">{{ $t('venture.deals.emptyTitle') }}</h3>
        <p class="text-muted-foreground max-w-md text-sm">
          {{ platformsCount === 0 ? $t('venture.deals.emptyNoPlatformHint') : $t('venture.deals.emptyDescription') }}
        </p>
        <UiButton @click="createDialogOpen = true">
          <PlusIcon class="size-4" />
          <span>{{ $t('venture.deals.createButton') }}</span>
        </UiButton>
      </CardContent>
    </Card>

    <div v-else class="grid gap-4 @md/venture:grid-cols-2">
      <router-link
        v-for="deal in deals"
        :key="deal.id"
        :to="{ name: ROUTES_NAMES.ventureDealDetail, params: { dealId: deal.id } }"
        class="bg-card border-border hover:bg-accent/30 block rounded-xl border p-5 transition-colors"
      >
        <div class="flex flex-col gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-lg leading-tight font-semibold tracking-tight">{{ deal.name }}</h3>
              <div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span v-if="deal.platform">{{ deal.platform.name }}</span>
                <span v-if="deal.platform && deal.targetCompany" aria-hidden="true">·</span>
                <span v-if="deal.targetCompany">{{ deal.targetCompany }}</span>
              </div>
            </div>
            <span
              :class="[
                'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                VENTURE_DEAL_STATUS_META[deal.status].cls,
              ]"
            >
              {{ $t(VENTURE_DEAL_STATUS_META[deal.status].label) }}
            </span>
          </div>

          <div class="border-border/60 grid grid-cols-3 gap-3 border-t pt-3">
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.deals.principal') }}
              </div>
              <div class="mt-0.5 text-lg font-semibold tabular-nums">
                {{ formatAmountByCurrencyCode(Number(deal.principal), deal.currencyCode) }}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.deals.entryFee') }}
              </div>
              <div class="text-muted-foreground mt-0.5 text-sm tabular-nums">
                {{ formatAmountByCurrencyCode(Number(deal.entryFee), deal.currencyCode) }}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.deals.investmentDate') }}
              </div>
              <div class="text-muted-foreground mt-0.5 text-sm">{{ formatShortDate(deal.investmentDate) }}</div>
            </div>
          </div>
        </div>
      </router-link>
    </div>

    <ResponsiveDialog v-model:open="createDialogOpen" :hide-drawer-footer="true">
      <template #title>{{ $t('venture.deals.createDialogTitle') }}</template>
      <template #description>{{ $t('venture.deals.createDialogDescription') }}</template>
      <VentureDealForm @saved="onDealCreated" @cancel="createDialogOpen = false" />
    </ResponsiveDialog>
  </div>
</template>
