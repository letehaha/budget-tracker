<template>
  <div class="space-y-4">
    <!-- Beta disclaimer -->
    <div
      class="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400"
    >
      <TriangleAlertIcon class="mt-0.5 size-5 shrink-0" />
      <div class="space-y-2">
        <p class="font-semibold">Beta Feature - Developer-Oriented</p>
        <p class="opacity-90">
          This integration requires technical knowledge to set up. You'll need to register your own Enable Banking
          application and provide API credentials. The setup process and API may change in future updates.
        </p>
      </div>
    </div>

    <!-- Step 1: Enter Enable Banking Credentials -->
    <template v-if="currentStep === 1">
      <div class="space-y-4">
        <!-- Help Dialog Trigger -->
        <div class="bg-muted/50 mb-4 rounded-md p-3">
          <div class="flex items-center gap-2">
            <InfoIcon class="mt-0.5 size-5 flex-shrink-0 text-white" />

            <div class="flex-1">
              <p class="text-sm">
                Don't have Enable Banking credentials?
                <button @click="showHelpDialog = true" class="text-primary font-medium underline">
                  Learn how to obtain them
                </button>
              </p>
            </div>
          </div>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">Application ID</label>
          <input
            v-model="appId"
            type="text"
            class="w-full rounded-md border px-3 py-2"
            placeholder="Enter your Enable Banking app_id"
          />
          <p class="text-muted-foreground mt-1 text-xs">
            Get from Enable Banking portal after uploading your certificate
          </p>
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">Private Key</label>
          <textarea
            v-model="privateKey"
            class="w-full rounded-md border px-3 py-2 font-mono text-xs"
            rows="6"
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
          />
          <p class="text-muted-foreground mt-1 text-xs">Your PEM-encoded RSA private key (stored encrypted)</p>
        </div>
        <div class="flex justify-between gap-2">
          <UiButton variant="outline" @click="$emit('cancel')" :disabled="isLoading"> Back </UiButton>

          <UiButton @click="handleLoadBanks" :disabled="!appId || !privateKey || isLoading">
            {{ isLoading ? 'Loading...' : 'Next' }}
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Step 2: Select Country -->
    <template v-else-if="currentStep === 2">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">Loading countries...</div>

        <template v-else>
          <div class="text-muted-foreground mb-4 text-sm">Select your bank's country</div>

          <div>
            <label class="mb-2 block text-sm font-medium">Country</label>
            <input
              v-model="countryFilter"
              type="text"
              class="w-full rounded-md border px-3 py-2"
              placeholder="Search countries..."
            />
          </div>

          <div class="max-h-64 space-y-2 overflow-y-auto">
            <button
              v-for="country in filteredCountries"
              :key="country"
              @click="selectCountry(country)"
              class="hover:bg-accent w-full rounded-md border p-3 text-left transition-colors"
            >
              {{ getCountryName(country) }} ({{ country }})
            </button>
          </div>

          <div class="flex gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading"> Back </UiButton>
          </div>
        </template>
      </div>
    </template>

    <!-- Step 3: Select Bank -->
    <template v-else-if="currentStep === 3">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">Loading banks...</div>

        <template v-else>
          <div class="text-muted-foreground mb-4 text-sm">Select your bank in {{ selectedCountry }}</div>

          <div>
            <label class="mb-2 block text-sm font-medium">Bank</label>
            <input
              v-model="bankFilter"
              type="text"
              class="w-full rounded-md border px-3 py-2"
              placeholder="Search banks..."
            />
          </div>

          <div class="max-h-64 space-y-2 overflow-y-auto">
            <button
              v-for="bank in filteredBanks"
              :key="bank.name"
              @click="selectBank(bank)"
              class="hover:bg-accent w-full rounded-md border p-3 text-left transition-colors"
            >
              <div class="font-medium">{{ bank.name }}</div>
              <div v-if="bank.bic" class="text-muted-foreground text-xs">BIC: {{ bank.bic }}</div>
            </button>
          </div>

          <div class="flex gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 2" :disabled="isLoading"> Back </UiButton>
          </div>
        </template>
      </div>
    </template>

    <!-- Step 4: Redirect to Bank Authorization -->
    <template v-else-if="currentStep === 4">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">Connecting to {{ selectedBankName }}...</div>

        <template v-else-if="authUrl">
          <div class="text-muted-foreground space-y-4 text-sm">
            <p>Click the button below to authorize access to your {{ selectedBankName }} account.</p>
            <p class="text-warning font-medium">
              You will be redirected to {{ selectedBankName }}'s website to log in and approve the connection.
            </p>
          </div>

          <div class="flex gap-2 pt-4">
            <UiButton @click="openAuthUrl"> Authorize with {{ selectedBankName }} </UiButton>
            <UiButton variant="outline" @click="currentStep = 3" :disabled="isLoading"> Back </UiButton>
          </div>
        </template>
      </div>
    </template>

    <!-- Step 5: Select Accounts (shown after OAuth callback) -->
    <template v-else-if="currentStep === 5">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">Loading accounts...</div>

        <template v-else>
          <div class="text-muted-foreground mb-4 text-sm">Select the accounts you want to sync with Budget Tracker</div>

          <div class="space-y-2">
            <label
              v-for="account in availableAccounts"
              :key="account.externalId"
              class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3"
            >
              <input type="checkbox" :value="account.externalId" v-model="selectedAccountIds" class="h-4 w-4" />
              <div class="flex-1">
                <div class="font-medium">{{ account.name }}</div>
                <div class="text-muted-foreground text-sm">
                  {{ formatBalance(account.balance, account.currency) }}
                </div>
              </div>
            </label>
          </div>

          <div class="flex gap-2 pt-4">
            <UiButton @click="handleSyncAccounts" :disabled="selectedAccountIds.length === 0 || isLoading">
              {{ isLoading ? 'Syncing...' : `Sync ${selectedAccountIds.length} account(s)` }}
            </UiButton>
          </div>
        </template>
      </div>
    </template>

    <!-- Help Dialog -->
    <Dialog :open="showHelpDialog" @update:open="showHelpDialog = $event">
      <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader class="mb-4">
          <DialogTitle>How to Obtain Enable Banking Credentials</DialogTitle>
        </DialogHeader>

        <div class="space-y-6 text-sm">
          <div>
            <h3 class="mb-2 text-base font-semibold">Overview</h3>
            <p class="text-muted-foreground">
              Enable Banking requires you to register an application and generate security credentials to access banking
              data. Follow these steps to get your Application ID and Private Key.
            </p>
          </div>

          <div class="space-y-4">
            <div class="flex gap-3">
              <div
                class="bg-primary text-primary-foreground flex size-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                1
              </div>
              <div class="flex-1">
                <h4 class="mb-1 font-semibold">Register an Enable Banking Account</h4>
                <p class="text-muted-foreground mb-2">
                  Visit
                  <ExternalLink href="https://enablebanking.com" text="enablebanking.com" />
                  and create an account if you don't have one already.
                </p>
              </div>
            </div>

            <div class="flex gap-3">
              <div
                class="bg-primary text-primary-foreground flex size-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                2
              </div>
              <div class="flex-1">
                <h4 class="mb-1 font-semibold">Create an Application</h4>
                <div class="text-muted-foreground space-y-1">
                  <div>1. Log in to the Enable Banking portal</div>
                  <div>2. Navigate to <ExternalLink href="https://enablebanking.com/cp/applications" /></div>
                  <div>3. Look at the "Create Application" form</div>
                  <div>4. Select <strong>"Production"</strong> environment</div>
                  <div>
                    5. Check the <strong>"Generate private RSA key in the browser"</strong> checkbox. Once application
                    is created, the .pem key will be saved to your computer automatically as a file
                  </div>
                  <div>
                    6. Fill out form with the next values:
                    <div class="mt-2 flex flex-col gap-1 pl-4">
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Application name: </span>
                        <ClickToCopy class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]" value="Own testing" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Allowed redirect URLs: </span>
                        <ClickToCopy
                          class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]"
                          value="https://moneymatter.app/bank-callback https://moneymatter.app/bank-callback"
                        />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Application description: </span>
                        <ClickToCopy class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]" value="testing" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Email for data protection matters: </span>
                        <ClickToCopy class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]" value="test@gmail.com" />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Privacy URL: </span>
                        <ClickToCopy
                          class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]"
                          value="https://moneymatter.app/privacy-policy"
                        />
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <span class="font-semibold"> Terms URL: </span>
                        <ClickToCopy
                          class="w-auto max-w-[275px] min-w-auto sm:max-w-[500px]"
                          value="https://moneymatter.app/terms-of-use"
                        />
                      </div>
                    </div>
                  </div>
                  <div>7. Click "Register"</div>
                  <div>
                    8. You will be suggested to download a file. It's your RSA key that you must save somewhere since
                    this is part of your credentials
                  </div>
                </div>
              </div>
            </div>

            <div class="flex gap-3">
              <div
                class="bg-primary text-primary-foreground flex size-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                3
              </div>
              <div class="flex-1">
                <h4 class="mb-1 font-semibold">Link Your Bank Accounts</h4>
                <p class="text-muted-foreground mb-2">
                  Before using the application with Budget Tracker, you must first link your bank accounts through the
                  Enable Banking portal. Look for the "Link accounts" button inside the created application's tile and
                  follow all the steps required there
                </p>
              </div>
            </div>

            <div class="flex gap-3">
              <div
                class="bg-primary text-primary-foreground flex size-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                4
              </div>
              <div class="flex-1">
                <h4 class="mb-1 font-semibold">Get Your Credentials</h4>
                <p class="text-muted-foreground mb-2">From the Enable Banking portal:</p>
                <ul class="text-muted-foreground list-inside list-disc space-y-1">
                  <li>
                    <strong>Application ID:</strong> Copy the <code class="bg-muted rounded px-1">app_id</code> from
                    your application details
                    <br />
                    Example: <code class="bg-muted rounded px-1"> 0f711c28-1682-27b5-946c-e221168abf79 </code>
                  </li>
                  <li>
                    <strong>Private Key:</strong> Open your saved
                    <code class="bg-muted rounded px-1">private.pem</code> file via some text editor (TextEdit on MacOS
                    or Notepad on Windows) and copy its entire content (including the BEGIN and END lines)
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
            <div class="flex gap-2">
              <InfoIcon class="mt-0.5 size-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p class="mb-1 font-semibold text-blue-900 dark:text-blue-100">Security Note</p>
                <p class="text-xs text-blue-800 dark:text-blue-200">
                  Your private key is stored encrypted in our database and is only used to authenticate with Enable
                  Banking on your behalf. Token is limited to read-only data. Yet, never share your private key with
                  anyone else.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter class="mt-6">
          <UiButton @click="showHelpDialog = false">Got it</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script lang="ts" setup>
import {
  type ASPSP,
  type AvailableAccount,
  connectProvider,
  getAvailableAccounts,
  getEnableBankingBanks,
  getEnableBankingCountries,
  syncSelectedAccounts,
} from '@/api/bank-data-providers';
import ClickToCopy from '@/components/common/click-to-copy.vue';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/lib/ui/dialog';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { InfoIcon, TriangleAlertIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const emit = defineEmits<{
  connected: [];
  cancel: [];
  authStarted: [connectionId: number];
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const currentStep = ref(1);
const isLoading = ref(false);
const showHelpDialog = ref(false);

// Step 1 data
const appId = ref('');
const privateKey = ref('');

// Step 2 data
const countries = ref<string[]>([]);
const countryFilter = ref('');
const selectedCountry = ref('');

// Step 3 data
const banks = ref<ASPSP[]>([]);
const bankFilter = ref('');
const selectedBank = ref<ASPSP | null>(null);
const selectedBankName = computed(() => selectedBank.value?.name || '');

// Step 4 data
const authUrl = ref('');
const connectionId = ref<number | null>(null);

// Step 5 data
const availableAccounts = ref<AvailableAccount[]>([]);
const selectedAccountIds = ref<string[]>([]);

const filteredCountries = computed(() => {
  if (!countryFilter.value) return countries.value;
  const filter = countryFilter.value.toLowerCase();
  return countries.value.filter(
    (c) => c.toLowerCase().includes(filter) || getCountryName(c).toLowerCase().includes(filter),
  );
});

const filteredBanks = computed(() => {
  if (!bankFilter.value) return banks.value;
  const filter = bankFilter.value.toLowerCase();
  return banks.value.filter((b) => b.name.toLowerCase().includes(filter) || b.bic?.toLowerCase().includes(filter));
});

const handleLoadBanks = async () => {
  if (!appId.value || !privateKey.value || isLoading.value) return;

  try {
    isLoading.value = true;
    currentStep.value = 2;
    countries.value = await getEnableBankingCountries(appId.value, privateKey.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load countries. Please check your credentials.';
    currentStep.value = 1;
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const selectCountry = async (country: string) => {
  selectedCountry.value = country;

  try {
    isLoading.value = true;
    currentStep.value = 3;
    banks.value = await getEnableBankingBanks(appId.value, privateKey.value, country);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load banks';
    currentStep.value = 2;
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const selectBank = async (bank: ASPSP) => {
  selectedBank.value = bank;

  try {
    isLoading.value = true;

    currentStep.value = 4;
    // Connect provider - this will return the auth URL
    const response = await connectProvider(BANK_PROVIDER_TYPE.ENABLE_BANKING, {
      appId: appId.value,
      privateKey: privateKey.value,
      bankName: bank.name,
      bankCountry: bank.country,
      maxConsentValidity: bank.maximum_consent_validity, // Pass bank's max consent validity
    });

    connectionId.value = response.connectionId;

    // Extract auth URL from response
    if (response.authUrl) {
      authUrl.value = response.authUrl;

      // Store connection ID for OAuth callback
      localStorage.setItem('pendingEnableBankingConnectionId', String(response.connectionId));

      // Notify parent that auth has started
      emit('authStarted', response.connectionId);
    } else {
      addErrorNotification('No authorization URL received from server');
      currentStep.value = 3;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect provider';
    currentStep.value = 3;
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const openAuthUrl = () => {
  if (authUrl.value) {
    window.location.href = authUrl.value;
  }
};

// This method should be called from the parent after OAuth callback
const loadAccounts = async (connId: number) => {
  try {
    isLoading.value = true;
    connectionId.value = connId;
    availableAccounts.value = await getAvailableAccounts(connId);
    currentStep.value = 5;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load accounts';
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const handleSyncAccounts = async () => {
  if (!connectionId.value || selectedAccountIds.value.length === 0 || isLoading.value) {
    return;
  }

  try {
    isLoading.value = true;

    await syncSelectedAccounts(connectionId.value, selectedAccountIds.value);

    // Refresh accounts store
    await accountsStore.refetchAccounts();

    addSuccessNotification(`Successfully synced ${selectedAccountIds.value.length} account(s)`);

    // Emit connected event to close dialog
    emit('connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync accounts';
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const formatBalance = (balance: number, currency: string) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
  }).format(balance);
};

// Simple country name mapping (can be expanded)
const getCountryName = (code: string): string => {
  const names: Record<string, string> = {
    FI: 'Finland',
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    DE: 'Germany',
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
    NL: 'Netherlands',
    BE: 'Belgium',
    PL: 'Poland',
    GB: 'United Kingdom',
    IE: 'Ireland',
    AT: 'Austria',
    CH: 'Switzerland',
  };
  return names[code] || code;
};

// Expose method for parent to trigger account loading after OAuth
defineExpose({
  loadAccounts,
});
</script>
