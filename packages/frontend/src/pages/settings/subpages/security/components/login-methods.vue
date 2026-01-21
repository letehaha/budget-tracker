<template>
  <div class="space-y-6">
    <div>
      <h3 class="mb-1 text-lg font-medium">{{ $t('settings.security.loginMethods.title') }}</h3>
      <p class="text-muted-foreground text-sm">{{ $t('settings.security.loginMethods.description') }}</p>
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
            <p class="font-medium">{{ $t('settings.security.loginMethods.legacyWarning.title') }}</p>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ $t('settings.security.loginMethods.legacyWarning.description') }}
            </p>
          </div>
        </div>
      </div>

      <!-- OAuth Providers -->
      <div v-for="provider in OAUTH_PROVIDERS_LIST" :key="provider" class="border-border rounded-lg border p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-muted flex size-10 items-center justify-center rounded-lg">
              <component :is="providerConfig[provider].icon" />
            </div>
            <div>
              <p class="font-medium">{{ providerConfig[provider].name }}</p>
              <p v-if="getAccountByProvider(provider)" class="text-muted-foreground text-sm">
                {{
                  $t('settings.security.loginMethods.oauth.connectedAs', {
                    email:
                      getAccountByProvider(provider)?.email ||
                      $t('settings.security.loginMethods.oauth.accountName', {
                        provider: providerConfig[provider].name,
                      }),
                  })
                }}
              </p>
              <p v-else class="text-muted-foreground text-sm">
                {{ $t('settings.security.loginMethods.oauth.notConnected') }}
              </p>
            </div>
          </div>
          <Button
            v-if="getAccountByProvider(provider)"
            variant="outline"
            size="sm"
            :disabled="!canDisconnect || isDisconnecting"
            @click="handleDisconnectOAuth({ provider })"
          >
            <Loader2Icon v-if="isDisconnecting" class="mr-2 size-4 animate-spin" />
            {{ $t('settings.security.loginMethods.oauth.disconnect') }}
          </Button>
          <DemoRestricted v-else>
            <Button
              variant="outline"
              size="sm"
              :disabled="isConnecting || isLegacyUser || isDemo"
              @click="handleConnectOAuth({ provider })"
            >
              <Loader2Icon v-if="isConnecting" class="mr-2 size-4 animate-spin" />
              {{ $t('settings.security.loginMethods.oauth.connect') }}
            </Button>
          </DemoRestricted>
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
              <p class="font-medium">{{ $t('settings.security.loginMethods.password.title') }}</p>
              <p v-if="hasPassword" class="text-muted-foreground text-sm">
                {{ $t('settings.security.loginMethods.password.passwordSet') }}
              </p>
              <p v-else class="text-muted-foreground text-sm">
                {{ $t('settings.security.loginMethods.password.noPassword') }}
              </p>
            </div>
          </div>
          <span class="text-muted-foreground text-sm">
            {{
              hasPassword
                ? $t('settings.security.loginMethods.password.manageInTab')
                : $t('settings.security.loginMethods.password.setupInTab')
            }}
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
              <p class="font-medium">{{ $t('settings.security.loginMethods.passkeys.title') }}</p>
              <p class="text-muted-foreground text-sm">
                {{
                  passkeys.length === 0
                    ? $t('settings.security.loginMethods.passkeys.noPasskeys')
                    : $t('settings.security.loginMethods.passkeys.passkeyCount', { count: passkeys.length })
                }}
              </p>
            </div>
          </div>
          <DemoRestricted>
            <Button
              variant="outline"
              size="sm"
              :disabled="isAddingPasskey || isLegacyUser || isDemo"
              @click="handleAddPasskey"
            >
              <Loader2Icon v-if="isAddingPasskey" class="mr-2 size-4 animate-spin" />
              <PlusIcon v-else class="mr-2 size-4" />
              {{ $t('settings.security.loginMethods.passkeys.addButton') }}
            </Button>
          </DemoRestricted>
        </div>

        <!-- List of passkeys -->
        <div v-if="passkeys.length > 0" class="border-t pt-4">
          <div v-for="passkey in passkeys" :key="passkey.id" class="flex items-center justify-between py-2">
            <div class="flex items-center gap-3">
              <FingerprintIcon class="text-muted-foreground size-5" />
              <div>
                <p class="text-sm font-medium">
                  {{ passkey.name || $t('settings.security.loginMethods.passkeys.passkeyName') }}
                </p>
                <p class="text-muted-foreground text-xs">
                  {{ $t('settings.security.loginMethods.passkeys.added', { date: formatDate(passkey.createdAt) }) }}
                </p>
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

      <!-- Warning if only one login method -->
      <p v-if="!canDisconnect && hasAnyOAuthAccount" class="text-muted-foreground text-sm">
        <AlertTriangleIcon class="mr-1 inline size-4" />
        {{ $t('settings.security.loginMethods.warningOneMethod') }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { GithubIcon, GoogleIcon } from '@/components/auth';
import DemoRestricted from '@/components/demo/demo-restricted.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { authClient, getSession } from '@/lib/auth-client';
import { useAuthStore, useUserStore } from '@/stores';
import { OAUTH_PROVIDER, OAUTH_PROVIDERS_LIST } from '@bt/shared/types';
import {
  AlertTriangleIcon,
  FingerprintIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { type Component, computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

const providerConfig: Record<OAUTH_PROVIDER, { name: string; icon: Component }> = {
  [OAUTH_PROVIDER.google]: { name: 'Google', icon: GoogleIcon },
  [OAUTH_PROVIDER.github]: { name: 'GitHub', icon: GithubIcon },
};

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

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const userStore = useUserStore();
const { isDemo } = storeToRefs(userStore);
const { t } = useI18n();
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

const getAccountByProvider = (provider: OAUTH_PROVIDER) => accounts.value.find((a) => a.providerId === provider);

const hasAnyOAuthAccount = computed(() => OAUTH_PROVIDERS_LIST.some((p) => getAccountByProvider(p)));

// Check if user is a legacy user (email ends with @app.migrated)
const isLegacyUser = computed(() => userEmail.value?.endsWith(LEGACY_EMAIL_SUFFIX) ?? false);

// Count total login methods
const loginMethodCount = computed(() => {
  const oauthCount = OAUTH_PROVIDERS_LIST.filter((p) => getAccountByProvider(p)).length;
  const passkeyCount = passkeys.value.length;
  const passwordCount = hasPassword.value ? 1 : 0;
  return oauthCount + passkeyCount + passwordCount;
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

const handleConnectOAuth = async ({ provider }: { provider: OAUTH_PROVIDER }) => {
  const providerName = providerConfig[provider].name;
  try {
    isConnecting.value = true;
    sessionStorage.setItem('oauth_return_url', window.location.pathname);
    await authClient.linkSocial({
      provider,
      callbackURL: `${window.location.origin}/auth/callback`,
    });
  } catch {
    addErrorNotification(
      t('settings.security.loginMethods.notifications.oauthConnectFailed', { provider: providerName }),
    );
  } finally {
    isConnecting.value = false;
  }
};

const handleDisconnectOAuth = async ({ provider }: { provider: OAUTH_PROVIDER }) => {
  const account = getAccountByProvider(provider);
  const providerName = providerConfig[provider].name;

  if (!account || !canDisconnect.value) return;

  try {
    isDisconnecting.value = true;
    await authClient.unlinkAccount({
      providerId: provider,
      accountId: account.accountId,
    });
    addSuccessNotification(
      t('settings.security.loginMethods.notifications.oauthDisconnectSuccess', { provider: providerName }),
    );
    await loadAccounts();
  } catch {
    addErrorNotification(
      t('settings.security.loginMethods.notifications.oauthDisconnectFailed', { provider: providerName }),
    );
  } finally {
    isDisconnecting.value = false;
  }
};

const handleAddPasskey = async () => {
  try {
    isAddingPasskey.value = true;
    await authStore.registerPasskey({ name: `Passkey ${passkeys.value.length + 1}` });
    addSuccessNotification(t('settings.security.loginMethods.notifications.passkeyAddSuccess'));
    await loadPasskeys();
  } catch {
    addErrorNotification(t('settings.security.loginMethods.notifications.passkeyAddFailed'));
  } finally {
    isAddingPasskey.value = false;
  }
};

const handleDeletePasskey = async (passkeyId: string) => {
  if (!canDisconnect.value) return;

  try {
    isDeletingPasskey.value = passkeyId;
    await authClient.passkey.deletePasskey({ id: passkeyId });
    addSuccessNotification(t('settings.security.loginMethods.notifications.passkeyRemoveSuccess'));
    await loadPasskeys();
  } catch {
    addErrorNotification(t('settings.security.loginMethods.notifications.passkeyRemoveFailed'));
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
  // Check for OAuth error from callback redirect
  const oauthError = route.query.oauth_error as string | undefined;
  if (oauthError) {
    addErrorNotification(oauthError);
    // Clean up the URL without triggering a navigation
    router.replace({ query: {} });
  }

  isLoading.value = true;
  await Promise.all([loadAccounts(), loadPasskeys(), loadUserEmail()]);
  isLoading.value = false;
});
</script>
