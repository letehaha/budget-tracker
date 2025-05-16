<template>
  <div class="sticky bottom-0 left-0 right-0 py-2">
    <nav class="grid grid-cols-3 gap-1">
      <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.home }">
        <ui-button :variant="isActive ? 'default' : 'ghost'" as="span" class="w-full gap-2 px-3" size="default">
          <LayoutDashboardIcon />
          <span class="max-sm:hidden"> Dashboard </span>
        </ui-button>
      </router-link>

      <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accounts }">
        <ui-button :variant="isActive ? 'default' : 'ghost'" as="span" class="w-full gap-2 px-3" size="default">
          <LayersIcon />
          <span class="max-sm:hidden"> Accounts </span>
        </ui-button>
      </router-link>

      <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactions }">
        <ui-button :variant="isActive ? 'default' : 'ghost'" as="span" class="w-full gap-2 px-3" size="default">
          <CreditCardIcon />
          <span class="max-sm:hidden"> Transactions </span>
        </ui-button>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ROUTES_NAMES } from '@/routes';
import { CreditCardIcon, LayersIcon, LayoutDashboardIcon } from 'lucide-vue-next';
</script>
