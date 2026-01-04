<template>
  <div class="space-y-6">
    <div>
      <h3 class="mb-1 text-lg font-medium">Login Methods</h3>
      <p class="text-muted-foreground text-sm">Manage how you sign in to your account</p>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Legacy account warning -->
      <div v-if="isLegacyUser" class="bg-warning/10 border-warning/20 text-warning-foreground rounded-lg border p-4">
        <div class="flex items-start gap-3">
          <AlertTriangleIcon class="text-warning mt-0.5 size-5 shrink-0" />
          <div>
            <p class="font-medium">Legacy account detected</p>
            <p class="text-muted-foreground mt-1 text-sm">
              Your account uses a legacy username-based login. Please add an email address to your account before
              connecting OAuth providers or passkeys.
            </p>
          </div>
        </div>
      </div>

      <!-- Google OAuth -->
      <div class="border-border rounded-lg border p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-muted flex size-10 items-center justify-center rounded-lg">
              <GoogleIcon />
            </div>
            <div>
              <p class="font-medium">Google</p>
              <p v-if="googleAccount" class="text-muted-foreground text-sm">
                Connected as {{ googleAccount.email || 'Google Account' }}
              </p>
              <p v-else class="text-muted-foreground text-sm">Not connected</p>
            </div>
          </div>
          <Button
            v-if="googleAccount"
            variant="outline"
            size="sm"
            :disabled="!canDisconnect || isDisconnecting"
            @click="handleDisconnectGoogle"
          >
            <Loader2Icon v-if="isDisconnecting" class="mr-2 size-4 animate-spin" />
            Disconnect
          </Button>
          <Button
            v-else
            variant="outline"
            size="sm"
            :disabled="isConnecting || isLegacyUser"
            @click="handleConnectGoogle"
          >
            <Loader2Icon v-if="isConnecting" class="mr-2 size-4 animate-spin" />
            Connect
          </Button>
        </div>
      </div>

      <!-- Password -->
      <div class="border-border rounded-lg border p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-muted flex size-10 items-center justify-center rounded-lg">
              <LockIcon class="text-muted-foreground size-5" />
            </div>
            <div>
              <p class="font-medium">Password</p>
              <p v-if="hasPassword" class="text-muted-foreground text-sm">Password is set</p>
              <p v-else class="text-muted-foreground text-sm">No password set</p>
            </div>
          </div>
          <span class="text-muted-foreground text-sm">
            {{ hasPassword ? 'Manage in Password tab' : 'Set up in Password tab' }}
          </span>
        </div>
      </div>

      <!-- Passkeys -->
      <div class="border-border rounded-lg border p-4">
        <div class="mb-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-muted flex size-10 items-center justify-center rounded-lg">
              <KeyRoundIcon class="text-muted-foreground size-5" />
            </div>
            <div>
              <p class="font-medium">Passkeys</p>
              <p class="text-muted-foreground text-sm">
                {{ passkeys.length === 0 ? 'No passkeys registered' : `${passkeys.length} passkey(s) registered` }}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" :disabled="isAddingPasskey || isLegacyUser" @click="handleAddPasskey">
            <Loader2Icon v-if="isAddingPasskey" class="mr-2 size-4 animate-spin" />
            <PlusIcon v-else class="mr-2 size-4" />
            Add Passkey
          </Button>
        </div>

        <!-- List of passkeys -->
        <div v-if="passkeys.length > 0" class="border-t pt-4">
          <div v-for="passkey in passkeys" :key="passkey.id" class="flex items-center justify-between py-2">
            <div class="flex items-center gap-3">
              <FingerprintIcon class="text-muted-foreground size-5" />
              <div>
                <p class="text-sm font-medium">{{ passkey.name || 'Passkey' }}</p>
                <p class="text-muted-foreground text-xs">Added {{ formatDate(passkey.createdAt) }}</p>
              </div>
            </div>
            <Button
              variant="ghost-destructive"
              size="sm"
              :disabled="!canDisconnect || isDeletingPasskey === passkey.id"
              @click="handleDeletePasskey(passkey.id)"
            >
              <Loader2Icon v-if="isDeletingPasskey === passkey.id" class="size-4 animate-spin" />
              <TrashIcon v-else class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Warning if only OAuth login method -->
      <p v-if="googleAccount && !canDisconnect" class="text-muted-foreground text-sm">
        <AlertTriangleIcon class="mr-1 inline size-4" />
        Add another login method before disconnecting Google.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { GoogleIcon } from '@/components/auth';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { authClient, getSession } from '@/lib/auth-client';
import { useAuthStore } from '@/stores';
import {
  AlertTriangleIcon,
  FingerprintIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

const LEGACY_EMAIL_SUFFIX = '@app.migrated';

interface Passkey {
  id: string;
  name?: string | null;
  createdAt: Date;
}

interface Account {
  id: string;
  providerId: string;
  accountId: string;
  email?: string;
}

const authStore = useAuthStore();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isLoading = ref(true);
const isConnecting = ref(false);
const isDisconnecting = ref(false);
const isAddingPasskey = ref(false);
const isDeletingPasskey = ref<string | null>(null);

const accounts = ref<Account[]>([]);
const passkeys = ref<Passkey[]>([]);
const hasPassword = ref(false);
const userEmail = ref<string | null>(null);

const googleAccount = computed(() => accounts.value.find((a) => a.providerId === 'google'));

// Check if user is a legacy user (email ends with @app.migrated)
const isLegacyUser = computed(() => userEmail.value?.endsWith(LEGACY_EMAIL_SUFFIX) ?? false);

// Count total login methods
const loginMethodCount = computed(() => {
  let count = 0;
  if (googleAccount.value) count++;
  if (hasPassword.value) count++;
  count += passkeys.value.length;
  return count;
});

const canDisconnect = computed(() => loginMethodCount.value > 1);

const formatDate = (dateStr: string | Date) => {
  return new Date(dateStr).toLocaleDateString();
};

const loadAccounts = async () => {
  try {
    const result = await authClient.listAccounts();
    if (result.data) {
      accounts.value = result.data;
      // Check if user has a password (credential account)
      hasPassword.value = result.data.some((a: Account) => a.providerId === 'credential');
    }
  } catch (e) {
    console.error('Failed to load accounts:', e);
  }
};

const loadPasskeys = async () => {
  try {
    const result = await authClient.passkey.listUserPasskeys();
    console.log('result', result);
    if (result.data) {
      passkeys.value = result.data;
    }
  } catch (e) {
    console.error('Failed to load passkeys:', e);
  }
};

const handleConnectGoogle = async () => {
  try {
    isConnecting.value = true;
    // Store return URL for after OAuth callback
    sessionStorage.setItem('oauth_return_url', window.location.pathname);
    await authClient.linkSocial({
      provider: 'google',
      callbackURL: `${window.location.origin}/auth/callback`,
    });
    // OAuth redirect will happen
  } catch {
    addErrorNotification('Failed to connect Google account');
  } finally {
    isConnecting.value = false;
  }
};

const handleDisconnectGoogle = async () => {
  if (!googleAccount.value || !canDisconnect.value) return;

  try {
    isDisconnecting.value = true;
    await authClient.unlinkAccount({
      providerId: 'google',
      accountId: googleAccount.value.accountId,
    });
    addSuccessNotification('Google account disconnected');
    await loadAccounts();
  } catch {
    addErrorNotification('Failed to disconnect Google account');
  } finally {
    isDisconnecting.value = false;
  }
};

const handleAddPasskey = async () => {
  try {
    isAddingPasskey.value = true;
    await authStore.registerPasskey({ name: `Passkey ${passkeys.value.length + 1}` });
    addSuccessNotification('Passkey added successfully');
    await loadPasskeys();
  } catch {
    addErrorNotification('Failed to add passkey. Make sure your device supports passkeys.');
  } finally {
    isAddingPasskey.value = false;
  }
};

const handleDeletePasskey = async (passkeyId: string) => {
  if (!canDisconnect.value) return;

  try {
    isDeletingPasskey.value = passkeyId;
    await authClient.passkey.deletePasskey({ id: passkeyId });
    addSuccessNotification('Passkey removed');
    await loadPasskeys();
  } catch {
    addErrorNotification('Failed to remove passkey');
  } finally {
    isDeletingPasskey.value = null;
  }
};

const loadUserEmail = async () => {
  try {
    const session = await getSession();
    userEmail.value = session?.data?.user?.email || null;
  } catch (e) {
    console.error('Failed to load user email:', e);
  }
};

onMounted(async () => {
  isLoading.value = true;
  await Promise.all([loadAccounts(), loadPasskeys(), loadUserEmail()]);
  isLoading.value = false;
});
</script>
