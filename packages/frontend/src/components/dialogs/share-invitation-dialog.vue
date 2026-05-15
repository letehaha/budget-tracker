<script setup lang="ts">
import {
  acceptShareInvitation,
  backInviteFromShareInvitation,
  declineShareInvitation,
  listReceivedShareInvitations,
} from '@/api/share';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { SelectField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import {
  API_ERROR_CODES,
  type HouseholdSharePermission,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  type SharePermission,
  TRANSACTIONS_WRITE_SCOPES,
  type TransactionsWriteScope,
} from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format } from 'date-fns';
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
const categoriesStore = useCategoriesStore();

const isOpen = computed({
  get: () => props.token.length > 0,
  set: (value) => {
    if (!value) emit('close');
  },
});

type ViewState =
  | 'loading'
  | 'pending'
  | 'accepted'
  | 'back-invite-sent'
  | 'declined'
  | 'not-found'
  | 'currency-mismatch'
  | 'error';

const stateOverride = ref<ViewState | null>(null);
const acceptedAccountId = ref<number | null>(null);
const expectedCurrency = ref<string | null>(null);

interface BackInviteContext {
  sourceInvitationId: string;
  ownerUsername: string;
}
// Captured at accept time for household invitations so the "share back" prompt survives
// the received-invitations cache invalidation that happens immediately after accept.
const backInviteContext = ref<BackInviteContext | null>(null);

interface PermissionOption {
  label: string;
  value: HouseholdSharePermission;
}
interface WriteScopeOption {
  label: string;
  value: TransactionsWriteScope;
}
const backInvitePermissionOptions = computed<PermissionOption[]>(() => [
  { label: t('dialogs.shareInvitationDialog.backInvite.permissions.read'), value: SHARE_PERMISSIONS.read },
  { label: t('dialogs.shareInvitationDialog.backInvite.permissions.write'), value: SHARE_PERMISSIONS.write },
]);
const backInviteWriteScopeOptions = computed<WriteScopeOption[]>(() => [
  { label: t('dialogs.shareInvitationDialog.backInvite.writeScope.all'), value: TRANSACTIONS_WRITE_SCOPES.all },
  { label: t('dialogs.shareInvitationDialog.backInvite.writeScope.own'), value: TRANSACTIONS_WRITE_SCOPES.own },
]);
// Defaults are looked up by value (write / all) so reordering the option array later
// can't silently flip the default. Bang-asserts are safe — both values are in the list above.
const findPermissionOption = (value: HouseholdSharePermission) =>
  backInvitePermissionOptions.value.find((o) => o.value === value)!;
const findWriteScopeOption = (value: TransactionsWriteScope) =>
  backInviteWriteScopeOptions.value.find((o) => o.value === value)!;
const backInvitePermission = ref<PermissionOption>(findPermissionOption(SHARE_PERMISSIONS.write));
const backInviteWriteScope = ref<WriteScopeOption>(findWriteScopeOption(TRANSACTIONS_WRITE_SCOPES.all));
const showBackInviteWriteScope = computed(() => backInvitePermission.value.value !== SHARE_PERMISSIONS.read);

// Keep refs aligned with the locale labels if i18n swaps under us.
watch(backInvitePermissionOptions, () => {
  backInvitePermission.value = findPermissionOption(backInvitePermission.value.value);
});
watch(backInviteWriteScopeOptions, () => {
  backInviteWriteScope.value = findWriteScopeOption(backInviteWriteScope.value.value);
});

// Reset transient state every time a new token is opened so a stale "accepted" view
// from a previous invitation doesn't persist.
watch(
  () => props.token,
  (token) => {
    if (token) {
      stateOverride.value = null;
      acceptedAccountId.value = null;
      expectedCurrency.value = null;
      backInviteContext.value = null;
      backInvitePermission.value = findPermissionOption(SHARE_PERMISSIONS.write);
      backInviteWriteScope.value = findWriteScopeOption(TRANSACTIONS_WRITE_SCOPES.all);
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

const formatExpiry = (value: string | Date) => format(new Date(value), 'yyyy-MM-dd');

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
    // Snapshot the bits we need post-accept *before* invalidating the received list,
    // because the matchingPending lookup goes stale the moment the cache clears. Only
    // surface the back-invite prompt when the backend says the reciprocal direction is
    // not already shared (otherwise prompting would loop: A invites B, B accepts and
    // back-invites A, A accepts and the prompt would ask A to "share back" with B who
    // already has A's household).
    if (data.share.resourceType === RESOURCE_TYPES.household && data.canBackInvite && matchingPending.value) {
      backInviteContext.value = {
        sourceInvitationId: matchingPending.value.id,
        ownerUsername: matchingPending.value.owner?.username || t('dialogs.shareInvitationDialog.unknownOwner'),
      };
    }
    stateOverride.value = 'accepted';
    if (data.share.resourceType === RESOURCE_TYPES.account) {
      const numeric = Number(data.share.resourceId);
      if (Number.isInteger(numeric)) acceptedAccountId.value = numeric;
    }
    addSuccessNotification(t('dialogs.shareInvitationDialog.acceptSuccess'));
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allAccounts });
    // Refetch accounts and reload categories in parallel — the newly accessible accounts
    // carry transactions whose categoryId points at the owner's category tree, which the
    // categories store only pulls in on (re)load. Without this, tx rows render with broken
    // category chips until a page reload.
    await Promise.all([accountsStore.refetchAccounts(), categoriesStore.loadCategories()]);
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
    // Terminal-state errors (already-accepted, declined, revoked, expired, recipient cap
    // reached) come back from the backend as 409 Conflict (`API_ERROR_CODES.conflict`).
    // Collapse those into the `not-found` view so the recipient sees a coherent "this
    // invitation is no longer actionable" message instead of a generic error screen.
    // Matching on the code (not on the message wording) keeps this resilient to backend
    // copy changes and to future locale-aware error messages.
    stateOverride.value = apiCode === API_ERROR_CODES.conflict ? 'not-found' : 'error';
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

const backInviteMutation = useMutation({
  mutationFn: () => {
    // The button is gated by `v-if="backInviteContext"` so this should never fire in
    // normal flow. If a race ever does call mutate() with no context, surface the localized
    // error toast (apiMessage stays undefined → falls back to backInvite.error) rather than
    // exposing the dev-only string to the user.
    if (!backInviteContext.value) {
      throw new Error('Missing back-invite context');
    }
    return backInviteFromShareInvitation({
      sourceInvitationId: backInviteContext.value.sourceInvitationId,
      permission: backInvitePermission.value.value,
      policy: showBackInviteWriteScope.value ? { transactionsWriteScope: backInviteWriteScope.value.value } : null,
    });
  },
  onSuccess: (data) => {
    if (data.emailDelivered === false) {
      addErrorNotification(t('dialogs.shareInvitationDialog.backInvite.deliveryFailed'));
    } else {
      addSuccessNotification(t('dialogs.shareInvitationDialog.backInvite.success'));
    }
    stateOverride.value = 'back-invite-sent';
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived });
  },
  onError: (err: unknown) => {
    const { code: apiCode, message: apiMessage } = extractApiError(err);
    // 409 covers both "you already share with this user" and "you already sent a back-invite"
    // — in either case the recipient's intent ("share back") is already realized, so collapse
    // to the success view rather than leaving them on the form clicking again. Match on the
    // code (not the message) to stay resilient to backend copy changes.
    if (apiCode === API_ERROR_CODES.conflict) {
      stateOverride.value = 'back-invite-sent';
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived });
      return;
    }
    addErrorNotification(apiMessage || t('dialogs.shareInvitationDialog.backInvite.error'));
  },
});
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
          <template v-else-if="viewState === 'back-invite-sent'">
            {{ $t('dialogs.shareInvitationDialog.backInvite.sentTitle') }}
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
        <div class="flex flex-col gap-4">
          <div class="flex flex-col items-center gap-3 text-center">
            <CheckCircleIcon class="text-app-income-color size-6" />
            <p class="text-muted-foreground text-sm">{{ $t('dialogs.shareInvitationDialog.acceptedBody') }}</p>
          </div>

          <div v-if="backInviteContext" class="bg-muted/40 flex flex-col gap-3 rounded-md border p-4">
            <p class="text-sm">
              <i18n-t keypath="dialogs.shareInvitationDialog.backInvite.prompt" tag="span">
                <template #owner>
                  <strong class="text-foreground">@{{ backInviteContext.ownerUsername }}</strong>
                </template>
              </i18n-t>
            </p>
            <SelectField
              v-model="backInvitePermission"
              :values="backInvitePermissionOptions"
              :label="$t('dialogs.shareInvitationDialog.backInvite.permissionLabel')"
              label-key="label"
              value-key="value"
            />
            <SelectField
              v-if="showBackInviteWriteScope"
              v-model="backInviteWriteScope"
              :values="backInviteWriteScopeOptions"
              :label="$t('dialogs.shareInvitationDialog.backInvite.writeScopeLabel')"
              label-key="label"
              value-key="value"
            />
          </div>
        </div>
      </template>

      <template v-else-if="viewState === 'back-invite-sent'">
        <div class="flex flex-col items-center gap-3 text-center">
          <CheckCircleIcon class="text-app-income-color size-6" />
          <p class="text-muted-foreground text-sm">
            <i18n-t keypath="dialogs.shareInvitationDialog.backInvite.sentBody" tag="span">
              <template #owner>
                <strong class="text-foreground">@{{ backInviteContext?.ownerUsername ?? '' }}</strong>
              </template>
            </i18n-t>
          </p>
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
        <template v-if="backInviteContext">
          <Button variant="outline" class="flex-1" :disabled="backInviteMutation.isPending.value" @click="closeDialog">
            {{ $t('dialogs.shareInvitationDialog.backInvite.notNow') }}
          </Button>
          <Button
            class="flex-1"
            :loading="backInviteMutation.isPending.value"
            :disabled="backInviteMutation.isPending.value"
            @click="backInviteMutation.mutate()"
          >
            {{ $t('dialogs.shareInvitationDialog.backInvite.send') }}
          </Button>
        </template>
        <Button v-else class="w-full" @click="goToAccount">
          {{ $t('dialogs.shareInvitationDialog.goToAccount') }}
        </Button>
      </template>

      <template v-else-if="viewState === 'back-invite-sent'">
        <Button class="w-full" @click="closeDialog">
          {{ $t('dialogs.shareInvitationDialog.backInvite.done') }}
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
