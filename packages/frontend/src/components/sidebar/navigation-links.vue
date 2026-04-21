<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { ROUTES_NAMES } from '@/routes';
import {
  BellRingIcon,
  CalendarClockIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  CreditCardIcon,
  GroupIcon,
  LandmarkIcon,
  LayersIcon,
  LayoutDashboardIcon,
  RepeatIcon,
  SparklesIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-vue-next';
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useSidebarNavCollapse } from './use-nav-collapse';

withDefaults(defineProps<{ bottomNav?: boolean }>(), { bottomNav: false });

const navItemBase = 'w-full gap-2 px-3';
const navItemActive = 'bg-primary/10 text-foreground';
const navIconBase = 'size-4 shrink-0';
const navIconActive = 'text-primary';

const route = useRoute();
const { isAccountsOpen, isTransactionsOpen, isPlannedOpen } = useSidebarNavCollapse();

const isAccountsRoute = computed(
  () =>
    route.name === ROUTES_NAMES.accounts ||
    route.name === ROUTES_NAMES.account ||
    route.name === ROUTES_NAMES.accountIntegrations ||
    route.name === ROUTES_NAMES.accountIntegrationDetails,
);

watch(
  isAccountsRoute,
  (val) => {
    if (val) isAccountsOpen.value = true;
  },
  { immediate: true },
);

const isTransactionsRoute = computed(
  () =>
    route.name === ROUTES_NAMES.transactions ||
    route.name === ROUTES_NAMES.transactionGroups ||
    route.name === ROUTES_NAMES.optimizations ||
    route.name === ROUTES_NAMES.optimizationsTransfers,
);

watch(
  isTransactionsRoute,
  (val) => {
    if (val) isTransactionsOpen.value = true;
  },
  { immediate: true },
);

const isPlannedRoute = computed(
  () =>
    route.name === ROUTES_NAMES.planned ||
    route.name === ROUTES_NAMES.plannedSubscriptions ||
    route.name === ROUTES_NAMES.plannedSubscriptionDetails ||
    route.name === ROUTES_NAMES.plannedBudgets ||
    route.name === ROUTES_NAMES.plannedBudgetDetails ||
    route.name === ROUTES_NAMES.plannedReminders ||
    route.name === ROUTES_NAMES.plannedReminderDetails,
);

watch(
  isPlannedRoute,
  (val) => {
    if (val) isPlannedOpen.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.home }">
    <ui-button
      variant="ghost"
      as="span"
      :class="[navItemBase, !bottomNav && 'justify-start', isActive && navItemActive]"
      size="default"
    >
      <LayoutDashboardIcon :class="[navIconBase, isActive && navIconActive]" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.dashboard') }} </span>
    </ui-button>
  </router-link>

  <template v-if="bottomNav">
    <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accounts }">
      <ui-button variant="ghost" as="span" :class="[navItemBase, isActive && navItemActive]" size="default">
        <LayersIcon :class="[navIconBase, isActive && navIconActive]" />
        <span class="max-sm:hidden"> {{ $t('navigation.accounts') }} </span>
      </ui-button>
    </router-link>
  </template>
  <Collapsible v-else v-model:open="isAccountsOpen">
    <CollapsibleTrigger class="w-full">
      <ui-button
        variant="ghost"
        as="div"
        :class="['w-full justify-start gap-2 px-3', isAccountsRoute && 'bg-primary/10']"
        size="default"
      >
        <LayersIcon :class="[navIconBase, isAccountsRoute && navIconActive]" />
        <span>{{ $t('navigation.accounts') }}</span>
        <ChevronRightIcon
          :class="['ml-auto size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isAccountsOpen }]"
        />
      </ui-button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="border-border/40 mt-1 ml-2 grid gap-0.5 border-l pl-2">
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accounts }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <WalletIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.accountsList') }}</span>
          </ui-button>
        </router-link>
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.accountIntegrations }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <LandmarkIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.bankIntegrations') }}</span>
          </ui-button>
        </router-link>
      </div>
    </CollapsibleContent>
  </Collapsible>

  <router-link v-if="!bottomNav" v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.investments }">
    <ui-button
      variant="ghost"
      as="span"
      :class="[navItemBase, 'justify-start', isActive && navItemActive]"
      size="default"
    >
      <TrendingUpIcon :class="[navIconBase, isActive && navIconActive]" />
      <span> {{ $t('navigation.investments') }} </span>
    </ui-button>
  </router-link>

  <template v-if="bottomNav">
    <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactions }">
      <ui-button variant="ghost" as="span" :class="[navItemBase, isActive && navItemActive]" size="default">
        <CreditCardIcon :class="[navIconBase, isActive && navIconActive]" />
        <span class="max-sm:hidden"> {{ $t('navigation.transactions') }} </span>
      </ui-button>
    </router-link>
  </template>
  <Collapsible v-else v-model:open="isTransactionsOpen">
    <CollapsibleTrigger class="w-full">
      <ui-button
        variant="ghost"
        as="div"
        :class="['w-full justify-start gap-2 px-3', isTransactionsRoute && 'bg-primary/10']"
        size="default"
      >
        <CreditCardIcon :class="[navIconBase, isTransactionsRoute && navIconActive]" />
        <span>{{ $t('navigation.transactions') }}</span>
        <ChevronRightIcon
          :class="['ml-auto size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isTransactionsOpen }]"
        />
      </ui-button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="border-border/40 mt-1 ml-2 grid gap-0.5 border-l pl-2">
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactions }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <CreditCardIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.allTransactions') }}</span>
          </ui-button>
        </router-link>
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.transactionGroups }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <GroupIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.transactionGroups') }}</span>
          </ui-button>
        </router-link>
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.optimizations }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <SparklesIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.optimizations') }}</span>
          </ui-button>
        </router-link>
      </div>
    </CollapsibleContent>
  </Collapsible>

  <Collapsible v-if="!bottomNav" v-model:open="isPlannedOpen">
    <CollapsibleTrigger class="w-full">
      <ui-button
        variant="ghost"
        as="div"
        :class="['w-full justify-start gap-2 px-3', isPlannedRoute && 'bg-primary/10']"
        size="default"
      >
        <CalendarClockIcon :class="[navIconBase, isPlannedRoute && navIconActive]" />
        <span>{{ $t('navigation.planned.planned') }}</span>
        <ChevronRightIcon
          :class="['ml-auto size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isPlannedOpen }]"
        />
      </ui-button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="border-border/40 mt-1 ml-2 grid gap-0.5 border-l pl-2">
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.plannedSubscriptions }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <RepeatIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.planned.subscriptions') }}</span>
          </ui-button>
        </router-link>
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.plannedBudgets }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <WalletIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.planned.budgets') }}</span>
          </ui-button>
        </router-link>
        <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.plannedReminders }">
          <ui-button
            variant="ghost"
            as="span"
            :class="['w-full justify-start gap-2 px-3', isActive && navItemActive]"
            size="sm"
          >
            <BellRingIcon :class="[navIconBase, isActive && navIconActive]" />
            <span>{{ $t('navigation.planned.reminders') }}</span>
          </ui-button>
        </router-link>
      </div>
    </CollapsibleContent>
  </Collapsible>

  <router-link v-slot="{ isActive }" :to="{ name: ROUTES_NAMES.analytics }">
    <ui-button
      variant="ghost"
      as="span"
      :class="[navItemBase, !bottomNav && 'justify-start', isActive && navItemActive]"
      size="default"
    >
      <ChartColumnIcon :class="[navIconBase, isActive && navIconActive]" />
      <span :class="{ 'max-sm:hidden': bottomNav }"> {{ $t('navigation.analytics') }} </span>
    </ui-button>
  </router-link>
</template>
