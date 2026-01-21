<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">{{ $t('investments.title') }}</h1>

      <CreatePortfolioDialog v-if="!isDemo">
        <UiButton>
          <PlusIcon class="mr-2 size-4" />
          {{ $t('investments.createButton') }}
        </UiButton>
      </CreatePortfolioDialog>
    </div>

    <!-- Demo mode restriction -->
    <template v-if="isDemo">
      <div class="py-12 text-center">
        <div class="mb-4">
          <LockIcon class="text-muted-foreground mx-auto size-12" />
        </div>
        <h3 class="text-foreground mb-2 text-lg font-medium">{{ $t('demo.investmentsRestricted.title') }}</h3>
        <p class="text-muted-foreground mb-4">
          {{ $t('demo.investmentsRestricted.description') }}
        </p>
        <router-link :to="{ name: ROUTES_NAMES.signUp }">
          <UiButton>{{ $t('demo.signUpToUnlock') }}</UiButton>
        </router-link>
      </div>
    </template>

    <template v-else-if="portfoliosQuery.isLoading.value">
      <div class="py-12 text-center">
        <div class="text-muted-foreground">{{ $t('investments.loading') }}</div>
      </div>
    </template>

    <template v-else-if="portfoliosQuery.error.value">
      <div class="py-12 text-center">
        <div class="text-destructive-text mb-4">{{ $t('investments.loadError') }}</div>
        <UiButton @click="portfoliosQuery.refetch()">{{ $t('investments.tryAgain') }}</UiButton>
      </div>
    </template>

    <template v-else-if="portfolios.length">
      <div class="mb-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <template v-for="portfolio in portfolios" :key="portfolio.id">
          <Card :class="cn('relative', !portfolio.isEnabled && 'opacity-40')">
            <div class="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <UiButton variant="ghost" size="icon" class="size-8">
                    <MoreVerticalIcon class="size-4" />
                  </UiButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <RouterLink
                      :to="{
                        name: ROUTES_NAMES.portfolioDetail,
                        params: { portfolioId: portfolio.id },
                      }"
                      class="flex w-full items-center"
                    >
                      <EyeIcon class="mr-2 size-4" />
                      {{ $t('investments.menu.view') }}
                    </RouterLink>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DeletePortfolioDialog :portfolio-id="portfolio.id">
                    <DropdownMenuItem
                      class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
                      @select.prevent
                    >
                      <Trash2Icon class="mr-2 size-4" />
                      {{ $t('investments.menu.delete') }}
                    </DropdownMenuItem>
                  </DeletePortfolioDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <router-link
              :to="{
                name: ROUTES_NAMES.portfolioDetail,
                params: { portfolioId: portfolio.id },
              }"
              class="block h-full"
            >
              <CardHeader class="p-3">
                <div
                  v-if="!portfolio.isEnabled"
                  :class="['bg-background absolute top-0 right-0 rounded-tr-md p-1 text-xs leading-none']"
                >
                  {{ $t('investments.card.hidden') }}
                </div>
                <div class="mb-2.5 max-w-[calc(100%-60px)] overflow-hidden text-lg tracking-wide text-ellipsis">
                  {{ portfolio.name }}
                </div>
              </CardHeader>
              <CardContent class="px-3 pb-3">
                <div class="flex flex-col gap-1">
                  <div class="investments__item-balance">
                    <!-- TODO: Portfolio balance formatting -->
                    {{ $t('investments.card.portfolioBalance') }}
                  </div>
                  <div class="text-muted-foreground text-sm capitalize">
                    {{ $t('investments.card.portfolioType', { type: portfolio.portfolioType.replace('_', ' ') }) }}
                  </div>
                  <div v-if="portfolio.description" class="text-muted-foreground truncate text-xs">
                    {{ portfolio.description }}
                  </div>
                </div>
              </CardContent>
            </router-link>
          </Card>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="py-12 text-center">
        <div class="mb-4">
          <WalletIcon class="text-muted-foreground mx-auto size-12" />
        </div>
        <h3 class="text-foreground mb-2 text-lg font-medium">{{ $t('investments.empty.title') }}</h3>
        <p class="text-muted-foreground mb-4">
          {{ $t('investments.empty.description') }}
        </p>
        <CreatePortfolioDialog>
          <UiButton>
            <PlusIcon class="size-4" />
            {{ $t('investments.empty.createFirstButton') }}
          </UiButton>
        </CreatePortfolioDialog>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import CreatePortfolioDialog from '@/components/dialogs/create-portfolio-dialog.vue';
import DeletePortfolioDialog from '@/components/dialogs/delete-portfolio-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { EyeIcon, LockIcon, MoreVerticalIcon, PlusIcon, Trash2Icon, WalletIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const userStore = useUserStore();
const { isDemo } = storeToRefs(userStore);
const portfoliosQuery = usePortfolios();

// Extract portfolios data and sort by enabled status
const portfolios = computed(() => portfoliosQuery.data.value?.sort((a, b) => +b.isEnabled - +a.isEnabled) || []);
</script>
