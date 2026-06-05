<template>
  <Card class="max-w-5xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('payees.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('payees.subtitle') }}</p>
    </CardHeader>

    <CardContent class="mt-6">
      <Tabs default-value="manage" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="manage" class="flex items-center gap-2">
            <StoreIcon class="size-4" />
            {{ $t('payees.tabs.manage') }}
          </TabsTrigger>
          <TabsTrigger value="settings" class="flex items-center gap-2">
            <SlidersHorizontalIcon class="size-4" />
            {{ $t('payees.tabs.settings') }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manage" class="mt-6">
          <ManageTab />
        </TabsContent>

        <TabsContent value="settings" class="mt-6">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { SlidersHorizontalIcon, StoreIcon } from '@lucide/vue';

import ManageTab from './components/manage-tab.vue';
import SettingsTab from './components/settings-tab.vue';

defineOptions({ name: 'settings-payees' });
</script>
