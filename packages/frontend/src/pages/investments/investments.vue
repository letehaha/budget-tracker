<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">Investments</h1>

      <CreatePortfolioDialog>
        <UiButton>
          <PlusIcon class="mr-2 size-4" />
          Create Portfolio
        </UiButton>
      </CreatePortfolioDialog>
    </div>

    <template v-if="portfoliosQuery.isLoading.value">
      <div class="py-12 text-center">
        <div class="text-muted-foreground">Loading portfolios...</div>
      </div>
    </template>

    <template v-else-if="portfoliosQuery.error.value">
      <div class="py-12 text-center">
        <div class="text-destructive mb-4">Failed to load portfolios</div>
        <UiButton @click="portfoliosQuery.refetch()">Try Again</UiButton>
      </div>
    </template>

    <template v-else-if="portfolios.length">
      <div class="mb-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <template v-for="portfolio in portfolios" :key="portfolio.id">
          <Card :class="cn('relative', !portfolio.isEnabled && 'opacity-40')">
            <div class="absolute right-2 top-2">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <UiButton variant="ghost" size="icon" class="h-8 w-8">
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
                      View
                    </RouterLink>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DeletePortfolioDialog :portfolio-id="portfolio.id">
                    <DropdownMenuItem
                      class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
                      @select.prevent
                    >
                      <Trash2Icon class="mr-2 size-4" />
                      Delete
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
                  :class="['bg-background absolute right-0 top-0 rounded-tr-md p-1 text-xs leading-none']"
                >
                  Hidden
                </div>
                <div class="mb-2.5 max-w-[calc(100%-60px)] overflow-hidden text-ellipsis text-lg tracking-wide">
                  {{ portfolio.name }}
                </div>
              </CardHeader>
              <CardContent class="px-3 pb-3">
                <div class="flex flex-col gap-1">
                  <div class="investments__item-balance">
                    <!-- TODO: Portfolio balance formatting -->
                    Portfolio Balance
                  </div>
                  <div class="text-muted-foreground text-sm capitalize">
                    {{ portfolio.portfolioType.replace('_', ' ') }} Portfolio
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
        <h3 class="text-foreground mb-2 text-lg font-medium">No Portfolios Yet</h3>
        <p class="text-muted-foreground mb-4">
          Create your first investment portfolio to start tracking your holdings, transactions, and performance.
        </p>
        <CreatePortfolioDialog>
          <UiButton>
            <PlusIcon class="size-4" />
            Create Your First Portfolio
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
import { EyeIcon, MoreVerticalIcon, PlusIcon, Trash2Icon, WalletIcon } from 'lucide-vue-next';
import { computed } from 'vue';

const portfoliosQuery = usePortfolios();

// Extract portfolios data and sort by enabled status
const portfolios = computed(() => portfoliosQuery.data.value?.sort((a, b) => +b.isEnabled - +a.isEnabled) || []);
</script>
