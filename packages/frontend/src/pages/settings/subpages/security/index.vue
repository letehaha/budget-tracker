<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.security.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.security.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
      </div>

      <template v-else>
        <!-- Tabs for different security sections -->
        <Tabs default-value="login-methods" class="w-full">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="login-methods" class="flex items-center gap-2">
              <KeyRoundIcon class="size-4" />
              <span class="hidden sm:inline">{{ $t('settings.security.tabs.loginMethods') }}</span>
              <span class="sm:hidden">{{ $t('settings.security.tabs.loginMethodsShort') }}</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" class="flex items-center gap-2">
              <MonitorSmartphoneIcon class="size-4" />
              <span class="hidden sm:inline">{{ $t('settings.security.tabs.activeSessions') }}</span>
              <span class="sm:hidden">{{ $t('settings.security.tabs.activeSessionsShort') }}</span>
            </TabsTrigger>
            <TabsTrigger value="password" class="flex items-center gap-2">
              <LockIcon class="size-4" />
              {{ $t('settings.security.tabs.password') }}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login-methods" class="mt-6">
            <LoginMethods />
          </TabsContent>

          <TabsContent value="sessions" class="mt-6">
            <ActiveSessions />
          </TabsContent>

          <TabsContent value="password" class="mt-6">
            <PasswordSection />
          </TabsContent>
        </Tabs>

        <DeleteAccountSection />
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { KeyRoundIcon, Loader2Icon, LockIcon, MonitorSmartphoneIcon } from 'lucide-vue-next';
import { ref } from 'vue';

import ActiveSessions from './components/active-sessions.vue';
import DeleteAccountSection from './components/delete-account-section.vue';
import LoginMethods from './components/login-methods.vue';
import PasswordSection from './components/password-section.vue';

defineOptions({
  name: 'settings-security',
});

// Simple loading state - security page loads synchronously
const isLoading = ref(false);
</script>
