<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ROUTES_NAMES } from '@/routes';
import { CreditCardIcon, LayersIcon, LayoutDashboardIcon, TrendingUpIcon, Wallet } from 'lucide-vue-next';

withDefaults(defineProps<{ bottomNav?: boolean }>(), { bottomNav: false });
</script>

<template>
  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.home }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <LayoutDashboardIcon />
      <span :class="{ 'max-sm:hidden': bottomNav }"> Dashboard </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accounts }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <LayersIcon />
      <span :class="{ 'max-sm:hidden': bottomNav }"> Accounts </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.investments }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <TrendingUpIcon />
      <span :class="{ 'max-sm:hidden': bottomNav }"> Investments </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactions }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <CreditCardIcon />
      <span :class="{ 'max-sm:hidden': bottomNav }"> Transactions </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.budgets }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <Wallet />
      <span :class="{ 'max-sm:hidden': bottomNav }"> Budgets </span>
    </ui-button>
  </router-link>
</template>
