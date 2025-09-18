<template>
  <div>
    <p>Total: {{ fiatTotalBalance }}</p>
    <template v-if="balances">
      <div class="crypto__balances">
        <div class="grid grid-cols-5">
          <p>Asset</p>
          <p>Total</p>
          <p>Price</p>
          <p>Holdings</p>
        </div>
        <template v-for="balance in balances" :key="balance.asset">
          <div class="grid grid-cols-5">
            <p>{{ balance.asset }}</p>
            <p>{{ balance.total }}</p>
            <p>{{ formatFiat(balance.price ?? balance.total) }}</p>
            <p>{{ formatFiat(getPrice(balance)) }}</p>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatFiat } from '@/js/helpers';
import { useCryptoBinanceStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const binanceStore = useCryptoBinanceStore();
const { existingBalances: balances, totalUSDBalance: totalBalance } = storeToRefs(binanceStore);

const fiatTotalBalance = computed(() => formatFiat(totalBalance.value));

const getPrice = (balance: { price?: string | number; total: string | number }): number =>
  balance.price ? +balance.price * +balance.total : +balance.total;
</script>
