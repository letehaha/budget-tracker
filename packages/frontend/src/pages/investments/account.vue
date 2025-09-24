<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <div class="flex items-center gap-4">
        <router-link :to="{ name: ROUTES_NAMES.investments }" class="text-muted-foreground hover:text-foreground">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </router-link>
        <div>
          <h1 class="text-2xl tracking-wider">{{ account?.name || 'Investment Account' }}</h1>
          <p class="text-muted-foreground mt-1 text-sm">Portfolio Holdings</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <UiButton @click="showAddSymbolDialog = true"> Add Symbol </UiButton>
      </div>
    </div>

    <template v-if="holdings && holdings.length > 0">
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-lg">Holdings</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-muted/30 border-b">
                <tr class="text-left">
                  <th class="px-4 py-3 text-sm font-medium">Symbol</th>
                  <th class="px-4 py-3 text-right text-sm font-medium">Quantity</th>
                  <th class="px-4 py-3 text-right text-sm font-medium">Last Price</th>
                  <th class="px-4 py-3 text-right text-sm font-medium">AC/Share</th>
                  <th class="px-4 py-3 text-right text-sm font-medium">Total Cost</th>
                  <th class="px-4 py-3 text-right text-sm font-medium">Market Value</th>
                  <th class="w-10 px-4 py-3 text-sm font-medium"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="holding in holdings" :key="`${holding.portfolioId}-${holding.securityId}`">
                  <tr class="hover:bg-muted/30 border-b transition-colors">
                    <td class="px-4 py-3">
                      <div>
                        <div class="font-medium">{{ holding.security?.symbol }}</div>
                        <div class="text-muted-foreground max-w-[200px] truncate text-sm">
                          {{ holding.security?.name }}
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                      {{ formatQuantity(holding.quantity) }}
                    </td>
                    <td class="px-4 py-3 text-right">
                      {{ formatPrice(holding) }}
                    </td>
                    <td class="px-4 py-3 text-right">
                      {{ formatAveragePrice(holding) }}
                    </td>
                    <td class="px-4 py-3 text-right">
                      {{ formatCostBasis(holding) }}
                    </td>
                    <td class="px-4 py-3 text-right">
                      {{ formatMarketValue(holding) }}
                    </td>
                    <td class="px-4 py-3">
                      <UiButton variant="ghost" size="sm" @click="toggleExpandedHolding(holding)" class="h-8 w-8 p-0">
                        <svg
                          class="h-4 w-4 transition-transform duration-200"
                          :class="{ 'rotate-90': expandedHoldings.has(getHoldingKey(holding)) }"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </UiButton>
                    </td>
                  </tr>

                  <tr v-if="expandedHoldings.has(getHoldingKey(holding))" class="bg-muted/20">
                    <td colspan="7" class="px-4 py-4">
                      <div class="space-y-3">
                        <div class="flex flex-wrap gap-2">
                          <UiButton variant="outline" size="sm"> Add Transaction </UiButton>
                          <UiButton variant="outline" size="sm"> View Transactions </UiButton>
                          <UiButton variant="outline" size="sm" @click="removeHolding(holding)">
                            Remove Holding
                          </UiButton>
                        </div>
                        <div class="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                          <div>
                            <div class="text-muted-foreground">Currency</div>
                            <div class="font-medium">{{ holding.currencyCode }}</div>
                          </div>
                          <div>
                            <div class="text-muted-foreground">Last Updated</div>
                            <div class="font-medium">{{ formatDate(holding.updatedAt) }}</div>
                          </div>
                          <div>
                            <div class="text-muted-foreground">Cost Basis</div>
                            <div class="font-medium">{{ formatCostBasis(holding) }}</div>
                          </div>
                          <div>
                            <div class="text-muted-foreground">Market Value</div>
                            <div class="font-medium">{{ formatMarketValue(holding) }}</div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </template>

    <template v-else-if="holdings && holdings.length === 0">
      <div class="py-12 text-center">
        <div class="mb-4">
          <svg class="text-muted-foreground mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 class="text-foreground mb-2 text-lg font-medium">No Holdings</h3>
        <p class="text-muted-foreground mb-4">
          You don't have any securities in this investment account yet. Add a symbol to start tracking your investments.
        </p>
        <UiButton @click="showAddSymbolDialog = true"> Add Symbol </UiButton>
      </div>
    </template>

    <template v-else>
      <div class="py-12 text-center">
        <div class="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-b-2"></div>
        <p class="text-muted-foreground mt-4">Loading holdings...</p>
      </div>
    </template>

    <!-- Add Symbol Dialog Placeholder -->
    <div v-if="showAddSymbolDialog" class="fixed inset-0 z-(--z-dialog) flex items-center justify-center bg-black/50">
      <Card class="mx-4 w-full max-w-md">
        <CardHeader>
          <CardTitle>Add Symbol</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-muted-foreground">Add Symbol functionality will be implemented in the next task.</p>
          <div class="flex justify-end gap-2">
            <UiButton variant="outline" @click="showAddSymbolDialog = false"> Cancel </UiButton>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { deleteHolding, loadHoldings } from '@/api/investments';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { HoldingModel } from '@bt/shared/types/investments';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const { accountsRecord } = storeToRefs(useAccountsStore());
const { formatAmountByCurrencyCode } = useFormatCurrency();

const accountId = computed(() => parseInt(route.params.accountId as string));
const account = computed(() => accountsRecord.value[accountId.value]);
const holdings = ref<HoldingModel[] | null>(null);
const expandedHoldings = ref(new Set<string>());
const showAddSymbolDialog = ref(false);

// Load holdings when component mounts or accountId changes
const fetchHoldings = async () => {
  if (!accountId.value) return;

  try {
    holdings.value = null; // Show loading
    holdings.value = await loadHoldings(accountId.value);
  } catch (error) {
    console.error('Failed to load holdings:', error);
    holdings.value = [];
  }
};

onMounted(fetchHoldings);
watch(accountId, fetchHoldings);

// Utility functions
const getHoldingKey = (holding: HoldingModel) => `${holding.portfolioId}-${holding.securityId}`;

const toggleExpandedHolding = (holding: HoldingModel) => {
  const key = getHoldingKey(holding);
  if (expandedHoldings.value.has(key)) {
    expandedHoldings.value.delete(key);
  } else {
    expandedHoldings.value.add(key);
  }
};

const formatQuantity = (quantity: string) => {
  const num = parseFloat(quantity);
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
};

const formatPrice = (holding: HoldingModel) => {
  // TODO: This should be the last price from security pricing data
  // For now, we'll calculate from value/quantity if quantity > 0
  const qty = parseFloat(holding.quantity);
  const value = parseFloat(holding.value);

  if (qty > 0 && value > 0) {
    const price = value / qty;
    return formatAmountByCurrencyCode(price, holding.currencyCode);
  }
  return 'N/A';
};

const formatAveragePrice = (holding: HoldingModel) => {
  const qty = parseFloat(holding.quantity);
  const costBasis = parseFloat(holding.costBasis);

  if (qty > 0 && costBasis > 0) {
    const avgPrice = costBasis / qty;
    return formatAmountByCurrencyCode(avgPrice, holding.currencyCode);
  }
  return 'N/A';
};

const formatCostBasis = (holding: HoldingModel) => {
  return formatAmountByCurrencyCode(parseFloat(holding.costBasis), holding.currencyCode);
};

const formatMarketValue = (holding: HoldingModel) => {
  return formatAmountByCurrencyCode(parseFloat(holding.value), holding.currencyCode);
};

const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString();
};

const removeHolding = async (holding: HoldingModel) => {
  if (confirm(`Are you sure you want to remove ${holding.security?.symbol} from this account?`)) {
    try {
      await deleteHolding({ portfolioId: holding.portfolioId, securityId: holding.securityId });
      await fetchHoldings(); // Refresh holdings
    } catch (error) {
      console.error('Failed to remove holding:', error);
      alert('Failed to remove holding. Please try again.');
    }
  }
};
</script>
