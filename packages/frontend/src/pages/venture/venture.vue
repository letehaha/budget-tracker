<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import VentureDealForm from '@/components/forms/venture-deal-form.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent } from '@/components/lib/ui/card';
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { useVenturePlatforms } from '@/composable/data-queries/venture/platforms';
import DealCard from '@/pages/venture/components/deal-card.vue';
import { ROUTES_NAMES } from '@/routes';
import { type VentureDealModel } from '@bt/shared/types';
import { PlusIcon, RocketIcon, SettingsIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

const { data: dealsData, isPending } = useVentureDeals();
const deals = computed<VentureDealModel[]>(() => dealsData.value?.data ?? []);

const { data: platformsData } = useVenturePlatforms();
const platformsCount = computed(() => platformsData.value?.data?.length ?? 0);

const createDialogOpen = ref(false);

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
      <DealCard v-for="deal in deals" :key="deal.id" :deal="deal" />
    </div>

    <ResponsiveDialog v-model:open="createDialogOpen" :hide-drawer-footer="true">
      <template #title>{{ $t('venture.deals.createDialogTitle') }}</template>
      <template #description>{{ $t('venture.deals.createDialogDescription') }}</template>
      <VentureDealForm @saved="onDealCreated" @cancel="createDialogOpen = false" />
    </ResponsiveDialog>
  </div>
</template>
