<script setup lang="ts">
import { Card } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes';
import { ArrowRightLeftIcon } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

const router = useRouter();

const optimizations = [
  {
    icon: ArrowRightLeftIcon,
    titleKey: 'optimizations.cards.transfers.title',
    descriptionKey: 'optimizations.cards.transfers.description',
    route: ROUTES_NAMES.optimizationsTransfers,
  },
];
</script>

<template>
  <div class="flex flex-col gap-6 p-4 md:p-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">
        {{ $t('optimizations.title') }}
      </h1>
      <p class="text-muted-foreground mt-1 text-sm">
        {{ $t('optimizations.landingDescription') }}
      </p>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(385px,1fr))] gap-4">
      <Card
        v-for="item in optimizations"
        :key="item.route"
        class="hover:border-primary/50 cursor-pointer p-5 transition-colors"
        @click="router.push({ name: item.route })"
      >
        <div class="flex items-start gap-4">
          <div class="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <component :is="item.icon" class="text-primary size-5" />
          </div>
          <div class="min-w-0">
            <h3 class="font-semibold">{{ $t(item.titleKey) }}</h3>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ $t(item.descriptionKey) }}
            </p>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
