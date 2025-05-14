<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ROUTES_NAMES } from '@/routes';
import { CreditCardIcon, LayersIcon, LayoutDashboardIcon } from 'lucide-vue-next';
</script>

<template>
  <nav class="grid gap-2 md:-ml-3">
    <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.home }">
      <ui-button
        :variant="isActive ? 'default' : 'ghost'"
        as="span"
        class="w-full justify-start gap-2 px-3"
        size="default"
      >
        <LayoutDashboardIcon />
        <span> Dashboard </span>
      </ui-button>
    </router-link>

    <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accounts }">
      <ui-button
        :variant="isActive ? 'default' : 'ghost'"
        as="span"
        class="w-full justify-start gap-2 px-3"
        size="default"
      >
        <LayersIcon />
        <span> Accounts </span>
      </ui-button>
    </router-link>

    <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactions }">
      <ui-button
        :variant="isActive ? 'default' : 'ghost'"
        as="span"
        class="w-full justify-start gap-2 px-3"
        size="default"
      >
        <CreditCardIcon />
        <span> Transactions </span>
      </ui-button>
    </router-link>
  </nav>
</template>
