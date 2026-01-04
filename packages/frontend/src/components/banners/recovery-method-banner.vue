<template>
  <div
    v-if="shouldShow"
    class="bg-primary/10 text-foreground border-primary/20 relative mb-4 rounded-lg border px-4 py-3"
  >
    <div class="flex items-start gap-3">
      <ShieldAlertIcon class="text-primary mt-0.5 size-5 shrink-0" />
      <div class="flex-1">
        <p class="font-medium">Add a backup login method</p>
        <p class="text-muted-foreground mt-1 text-sm">
          Protect your account by adding Google sign-in or a passkey. This ensures you can always access your account.
        </p>
        <router-link :to="{ name: ROUTES_NAMES.settingsSecurity }" class="mt-2 inline-block">
          <Button variant="outline" size="sm"> Go to Security Settings </Button>
        </router-link>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-foreground -mt-1 -mr-2 shrink-0"
        @click="dismiss"
      >
        <XIcon class="size-4" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { authClient } from '@/lib/auth-client';
import { ROUTES_NAMES } from '@/routes';
import { ShieldAlertIcon, XIcon } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

const DISMISSED_KEY = 'recovery-method-banner-dismissed';

interface Account {
  providerId: string;
}

const isDismissed = ref(localStorage.getItem(DISMISSED_KEY) === 'true');
const hasOnlyPassword = ref(false);
const isLoaded = ref(false);

const shouldShow = computed(() => isLoaded.value && hasOnlyPassword.value && !isDismissed.value);

const dismiss = () => {
  isDismissed.value = true;
  localStorage.setItem(DISMISSED_KEY, 'true');
};

const checkLoginMethods = async () => {
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [accountsResult, passkeysResult] = await Promise.all([
      (authClient as any).listAccounts(),
      (authClient as any).passkey?.listPasskeys?.() || { data: [] },
    ]);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const accounts: Account[] = accountsResult.data || [];
    const passkeys = passkeysResult.data || [];

    // Check if user only has credential (password) login
    const hasOAuth = accounts.some((a) => a.providerId === 'google');
    const hasPasskeys = passkeys.length > 0;
    const hasPassword = accounts.some((a) => a.providerId === 'credential');

    // Show banner if user has password but no other methods
    hasOnlyPassword.value = hasPassword && !hasOAuth && !hasPasskeys;
  } catch (e) {
    console.error('Failed to check login methods:', e);
  } finally {
    isLoaded.value = true;
  }
};

onMounted(() => {
  // Only check if not already dismissed
  if (!isDismissed.value) {
    checkLoginMethods();
  } else {
    isLoaded.value = true;
  }
});
</script>
