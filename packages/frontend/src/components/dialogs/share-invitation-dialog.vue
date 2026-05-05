<script setup lang="ts">
import { acceptShareInvitation, declineShareInvitation, listReceivedShareInvitations } from '@/api/share';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { API_ERROR_CODES, RESOURCE_TYPES, SHARE_PERMISSIONS, type SharePermission } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CheckCircleIcon, UsersIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

/**
 * Modal entry point for accepting / declining a share invitation. Replaces the previous
 * standalone `/shared-with-me/invitations/:token` page. The dialog opens whenever the
 * route carries `?invitation_token=<token>`; the dashboard layout mounts this once and
 * the query watcher binds it to whichever token is in the URL.
 */
const props = defineProps<{
  /** Token from the route query. Empty string when no invitation pending → dialog closed. */
  token: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();
const accountsStore = useAccountsStore();

const isOpen = computed({
  get: () => props.token.length > 0,
  set: (value) => {
    if (!value) emit('close');
  },
});

type ViewState = 'loading' | 'pending' | 'accepted' | 'declined' | 'not-found' | 'currency-mismatch' | 'error';

const stateOverride = ref<ViewState | null>(null);
const acceptedAccountId = ref<number | null>(null);
const expectedCurrency = ref<string | null>(null);

// Reset transient state every time a new token is opened so a stale "accepted" view
// from a previous invitation doesn't persist.
watch(
  () => props.token,
  (token) => {
    if (token) {
      stateOverride.value = null;
      acceptedAccountId.value = null;
      expectedCurrency.value = null;
    }
  },
);

const { data: pendingInvitations, isFetched: isPendingFetched } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived,
  queryFn: listReceivedShareInvitations,
  enabled: isOpen,
});

const matchingPending = computed(
  () => pendingInvitations.value?.find((invitation) => invitation.token === props.token) ?? null,
);

const viewState = computed<ViewState>(() => {
  if (stateOverride.value) return stateOverride.value;
  if (!isPendingFetched.value) return 'loading';
  return matchingPending.value ? 'pending' : 'not-found';
});

const permissionLabel = (permission: SharePermission) => {
  if (permission === SHARE_PERMISSIONS.read) return t('dialogs.shareInvitationDialog.permissions.read');
  if (permission === SHARE_PERMISSIONS.write) return t('dialogs.shareInvitationDialog.permissions.write');
  return t('dialogs.shareInvitationDialog.permissions.manage');
};

const formatExpiry = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

/** Pull the structured error payload from an ApiErrorResponseError. The API client throws
 *  this class with `data: { code, message, details }` — the response is NOT axios-wrapped,
 *  so accessing `err.response.data.response.code` (a common but wrong axios reflex) silently
 *  gives `undefined` and the dialog falls through to the generic "something went wrong" branch. */
const extractApiError = (err: unknown) => {
  if (err instanceof ApiErrorResponseError) {
    return {
      code: err.data?.code,
      message: err.data?.message,
      details: err.data?.details as { expectedCurrency?: string } | undefined,
    };
  }
  return { code: undefined, message: undefined, details: undefined } as const;
};

const acceptMutation = useMutation({
  mutationFn: () => acceptShareInvitation(props.token),
  onSuccess: async (data) => {
    stateOverride.value = 'accepted';
    if (data.share.resourceType === RESOURCE_TYPES.account) {
      const numeric = Number(data.share.resourceId);
      if (Number.isInteger(numeric)) acceptedAccountId.value = numeric;
    }
    addSuccessNotification(t('dialogs.shareInvitationDialog.acceptSuccess'));
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allAccounts });
    await accountsStore.refetchAccounts();
  },
  onError: (err: unknown) => {
    const { code: apiCode, message: apiMessage, details } = extractApiError(err);

    if (apiCode === API_ERROR_CODES.shareCurrencyMismatch) {
      // Inline state — surfaces the "change base currency" CTA so the recipient has a
      // clear next step instead of a transient toast.
      expectedCurrency.value = details?.expectedCurrency ?? null;
      stateOverride.value = 'currency-mismatch';
      return;
    }

    addErrorNotification(apiMessage || t('dialogs.shareInvitationDialog.acceptError'));
    if (apiMessage && /(expired|accepted|declined|revoked|full|maximum)/i.test(apiMessage)) {
      stateOverride.value = 'not-found';
    } else {
      stateOverride.value = 'error';
    }
  },
});

const declineMutation = useMutation({
  mutationFn: () => declineShareInvitation(props.token),
  onSuccess: () => {
    stateOverride.value = 'declined';
    addSuccessNotification(t('dialogs.shareInvitationDialog.declineSuccess'));
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived });
  },
  onError: (err: unknown) => {
    const { message: apiMessage } = extractApiError(err);
    addErrorNotification(apiMessage || t('dialogs.shareInvitationDialog.declineError'));
  },
});

// Navigation alone closes the dialog: changing the route drops `invitation_token`
// from the query, which makes `props.token` empty and flips `isOpen` to false.
// Emitting `close` here would race with the navigation — the parent's
// `clearInvitationToken` would `router.replace` back to the original path before
// the `router.push` completes and cancel it.
const goToAccount = () => {
  if (acceptedAccountId.value !== null) {
    router.push({ name: ROUTES_NAMES.account, params: { id: acceptedAccountId.value } });
    return;
  }
  emit('close');
};

const goToCurrencySettings = () => {
  router.push({ name: ROUTES_NAMES.settingsCurrencies });
};

const closeDialog = () => emit('close');
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-md">
    <!-- Centered icon + title block, mirroring the OAuth authorize screen style. -->
    <div class="flex flex-col gap-6 pt-2">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="bg-primary/10 flex size-16 items-center justify-center rounded-full">
          <UsersIcon class="text-primary size-8" />
        </div>
        <h2 class="text-xl font-semibold">
          <template v-if="viewState === 'pending' && matchingPending">
            <i18n-t keypath="dialogs.shareInvitationDialog.titlePending" tag="span">
              <template #owner>
                <span class="text-primary">
                  {{ matchingPending.owner?.username || $t('dialogs.shareInvitationDialog.unknownOwner') }}
                </span>
              </template>
            </i18n-t>
          </template>
          <template v-else-if="viewState === 'accepted'">
            {{ $t('dialogs.shareInvitationDialog.titleAccepted') }}
          </template>
          <template v-else-if="viewState === 'declined'">
            {{ $t('dialogs.shareInvitationDialog.titleDeclined') }}
          </template>
          <template v-else-if="viewState === 'currency-mismatch'">
            {{ $t('dialogs.shareInvitationDialog.titleCurrencyMismatch') }}
          </template>
          <template v-else-if="viewState === 'loading'">
            {{ $t('dialogs.shareInvitationDialog.titleLoading') }}
          </template>
          <template v-else>
            {{ $t('dialogs.shareInvitationDialog.titleNotFound') }}
          </template>
        </h2>
      </div>

      <template v-if="viewState === 'loading'">
        <p class="text-muted-foreground text-center text-sm">{{ $t('dialogs.shareInvitationDialog.loading') }}</p>
      </template>

      <template v-else-if="viewState === 'pending' && matchingPending">
        <div class="flex flex-col gap-3">
          <p class="text-muted-foreground text-center text-sm">
            <i18n-t keypath="dialogs.shareInvitationDialog.pendingMessage" tag="span">
              <template #resource>
                <strong class="text-foreground">
                  {{ matchingPending.resourceName || $t('dialogs.shareInvitationDialog.unknownResource') }}
                </strong>
              </template>
            </i18n-t>
          </p>

          <ul class="flex flex-col gap-2">
            <li class="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span class="text-muted-foreground">{{ $t('dialogs.shareInvitationDialog.permissionLabel') }}</span>
              <strong>{{ permissionLabel(matchingPending.permission) }}</strong>
            </li>
            <li class="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span class="text-muted-foreground">{{ $t('dialogs.shareInvitationDialog.expiresLabel') }}</span>
              <strong>{{ formatExpiry(matchingPending.expiresAt) }}</strong>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="viewState === 'accepted'">
        <div class="flex flex-col items-center gap-3 text-center">
          <CheckCircleIcon class="text-app-income-color size-6" />
          <p class="text-muted-foreground text-sm">{{ $t('dialogs.shareInvitationDialog.acceptedBody') }}</p>
        </div>
      </template>

      <template v-else-if="viewState === 'declined'">
        <p class="text-muted-foreground text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.declinedBody') }}
        </p>
      </template>

      <template v-else-if="viewState === 'currency-mismatch'">
        <p class="text-muted-foreground text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.currencyMismatch', { currency: expectedCurrency ?? '' }) }}
        </p>
      </template>

      <template v-else-if="viewState === 'not-found'">
        <p class="text-muted-foreground text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.notFoundBody') }}
        </p>
      </template>

      <template v-else>
        <p class="text-destructive-text text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.unexpectedError') }}
        </p>
      </template>
    </div>

    <template #footer>
      <template v-if="viewState === 'pending' && matchingPending">
        <Button
          variant="outline"
          class="flex-1"
          :loading="declineMutation.isPending.value"
          :disabled="acceptMutation.isPending.value || declineMutation.isPending.value"
          @click="declineMutation.mutate()"
        >
          {{ $t('dialogs.shareInvitationDialog.decline') }}
        </Button>
        <Button
          class="flex-1"
          :loading="acceptMutation.isPending.value"
          :disabled="acceptMutation.isPending.value || declineMutation.isPending.value"
          @click="acceptMutation.mutate()"
        >
          {{ $t('dialogs.shareInvitationDialog.accept') }}
        </Button>
      </template>

      <template v-else-if="viewState === 'accepted'">
        <Button class="w-full" @click="goToAccount">
          {{ $t('dialogs.shareInvitationDialog.goToAccount') }}
        </Button>
      </template>

      <template v-else-if="viewState === 'currency-mismatch'">
        <Button variant="outline" class="flex-1" @click="closeDialog">
          {{ $t('dialogs.shareInvitationDialog.close') }}
        </Button>
        <Button class="flex-1" @click="goToCurrencySettings">
          {{ $t('dialogs.shareInvitationDialog.updateBaseCurrency') }}
        </Button>
      </template>

      <template v-else>
        <Button variant="outline" class="w-full" @click="closeDialog">
          {{ $t('dialogs.shareInvitationDialog.close') }}
        </Button>
      </template>
    </template>
  </ResponsiveDialog>
</template>
