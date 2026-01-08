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
      <LayoutDashboardIcon class="size-5 shrink-0" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.dashboard') }} </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accounts }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <LayersIcon class="size-5 shrink-0" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.accounts') }} </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.investments }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <TrendingUpIcon class="size-5 shrink-0" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.investments') }} </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactions }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <CreditCardIcon class="size-5 shrink-0" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.transactions') }} </span>
    </ui-button>
  </router-link>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.budgets }">
    <ui-button
      :variant="isActive ? 'default' : 'ghost'"
      as="span"
      :class="['w-full gap-2 px-3', { 'justify-start': !bottomNav }]"
      size="default"
    >
      <Wallet class="size-5 shrink-0" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.budgets') }} </span>
    </ui-button>
  </router-link>
</template>
