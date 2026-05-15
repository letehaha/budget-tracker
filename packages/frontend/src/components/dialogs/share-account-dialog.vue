<script setup lang="ts">
import { createShareInvitation, listSentShareInvitations } from '@/api/share';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DemoRestricted from '@/components/demo/demo-restricted.vue';
import { InputField, SelectField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useUserStore } from '@/stores';
import {
  type AccountModel,
  RESOURCE_TYPES,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  type SharePermission,
  TRANSACTIONS_WRITE_SCOPES,
  type TransactionsWriteScope,
} from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  account: AccountModel;
  open?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();
const { isDemo } = storeToRefs(useUserStore());

const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value) => {
    internalOpen.value = value;
    emit('update:open', value);
  },
});
const internalOpen = ref(false);

interface PermissionOption {
  label: string;
  value: SharePermission;
}
interface WriteScopeOption {
  label: string;
  value: TransactionsWriteScope;
}

const permissionOptions = computed<PermissionOption[]>(() => [
  { label: t('dialogs.shareAccountDialog.permissions.read'), value: SHARE_PERMISSIONS.read },
  { label: t('dialogs.shareAccountDialog.permissions.write'), value: SHARE_PERMISSIONS.write },
  { label: t('dialogs.shareAccountDialog.permissions.manage'), value: SHARE_PERMISSIONS.manage },
]);

const writeScopeOptions = computed<WriteScopeOption[]>(() => [
  { label: t('dialogs.shareAccountDialog.writeScope.all'), value: TRANSACTIONS_WRITE_SCOPES.all },
  { label: t('dialogs.shareAccountDialog.writeScope.own'), value: TRANSACTIONS_WRITE_SCOPES.own },
]);

const email = ref('');
// SelectField binds to the full option object (its modelValue is `T | null` where
// `T extends Record<string, any>`). Storing the object lets the component round-trip
// labels correctly without manual lookup.
const permission = ref<PermissionOption>(permissionOptions.value[0]!);
const writeScope = ref<WriteScopeOption>(writeScopeOptions.value[0]!);

const showsWriteScope = computed(() => permission.value.value !== SHARE_PERMISSIONS.read);

// Reset form whenever the dialog opens — avoids stale state across multiple invitations.
watch(isOpen, (open) => {
  if (open) {
    email.value = '';
    permission.value = permissionOptions.value[0]!;
    writeScope.value = writeScopeOptions.value[0]!;
  }
});

const isEmailValid = computed(() => /.+@.+\..+/.test(email.value.trim()));
const canSubmit = computed(() => isEmailValid.value && !mutation.isPending.value);

// Inverse-invite hint: surface a non-blocking note when the typed email belongs to a
// user already in the owner's household. The per-resource share simply overrides the
// household grant on this account (per-resource access wins over household-level), so
// we inform rather than block. Hooks the sent-invitations cache the owner already
// loads in Settings → Household so it's usually warm by the time this dialog opens.
//
// `isError` matters: when the lookup fails we can't tell whether the typed email
// belongs to a household member or not. The hint is non-blocking, so silently hiding
// it would be a regression — `sentInvitationsLookupFailed` lets the template render an
// inline "couldn't check household membership" line so the owner isn't caught by
// surprise once the per-resource share takes effect.
const { data: sentInvitations, isError: isSentInvitationsError } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent,
  queryFn: listSentShareInvitations,
  enabled: computed(() => isOpen.value),
});

const sentInvitationsLookupFailed = computed(() => isSentInvitationsError.value);

const householdMembers = computed(() =>
  (sentInvitations.value ?? []).filter(
    (invitation) =>
      invitation.resourceType === RESOURCE_TYPES.household && invitation.status === SHARE_INVITATION_STATUSES.accepted,
  ),
);

const matchingHouseholdMember = computed(() => {
  const typed = email.value.trim().toLowerCase();
  if (!typed) return null;
  return householdMembers.value.find((m) => m.inviteeEmail.toLowerCase() === typed) ?? null;
});

const matchingMemberLabel = computed(() => {
  const member = matchingHouseholdMember.value;
  if (!member) return '';
  return member.invitee?.username || member.inviteeEmail.split('@')[0] || '';
});

const matchingMemberPermissionLabel = computed(() => {
  const member = matchingHouseholdMember.value;
  if (!member) return '';
  if (member.permission === SHARE_PERMISSIONS.read) return t('dialogs.shareAccountDialog.permissions.read');
  if (member.permission === SHARE_PERMISSIONS.write) return t('dialogs.shareAccountDialog.permissions.write');
  return t('dialogs.shareAccountDialog.permissions.manage');
});

const mutation = useMutation({
  mutationFn: () =>
    createShareInvitation({
      inviteeEmail: email.value.trim(),
      resourceType: RESOURCE_TYPES.account,
      resourceId: props.account.id,
      permission: permission.value.value,
      policy: showsWriteScope.value ? { transactionsWriteScope: writeScope.value.value } : null,
    }),
  onSuccess: (data) => {
    // Generic success copy on purpose — the response shape is identical whether the
    // email is registered or not, so we don't reveal that here either.
    if (data.emailDelivered === false) {
      // Row was created, but the outbound email never made it out (Resend down or
      // similar transient failure). Surface a warning so the owner doesn't assume the
      // invitee received anything. The invitation is still valid — owner can resend.
      addErrorNotification(t('dialogs.shareAccountDialog.emailSendFailedWarning'));
    } else {
      addSuccessNotification(t('dialogs.shareAccountDialog.success'));
    }
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsSent });
    isOpen.value = false;
  },
  onError: (err: unknown) => {
    const message = err instanceof ApiErrorResponseError ? err.data?.message : undefined;
    addErrorNotification(message || t('dialogs.shareAccountDialog.error'));
  },
});

const submit = () => {
  if (!canSubmit.value) return;
  mutation.mutate();
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>{{ $t('dialogs.shareAccountDialog.title') }}</template>
    <template #description>
      {{ $t('dialogs.shareAccountDialog.description', { name: account.name }) }}
    </template>

    <form class="grid gap-4" @submit.prevent="submit">
      <InputField
        v-model="email"
        :label="$t('dialogs.shareAccountDialog.emailLabel')"
        :placeholder="$t('dialogs.shareAccountDialog.emailPlaceholder')"
        type="email"
        autocomplete="email"
      />

      <p v-if="matchingHouseholdMember" class="text-muted-foreground -mt-2 text-xs" data-testid="inverse-invite-hint">
        <i18n-t keypath="dialogs.shareAccountDialog.householdOverrideHint" tag="span">
          <template #invitee>
            <strong class="text-foreground">@{{ matchingMemberLabel }}</strong>
          </template>
          <template #permission>
            <strong class="text-foreground">{{ matchingMemberPermissionLabel }}</strong>
          </template>
        </i18n-t>
      </p>

      <p
        v-else-if="sentInvitationsLookupFailed && isEmailValid"
        class="text-muted-foreground -mt-2 text-xs"
        data-testid="inverse-invite-lookup-failed"
      >
        {{ $t('dialogs.shareAccountDialog.householdLookupFailed') }}
      </p>

      <SelectField
        v-model="permission"
        :label="$t('dialogs.shareAccountDialog.permissionLabel')"
        :values="permissionOptions"
        label-key="label"
        value-key="value"
      />

      <template v-if="showsWriteScope">
        <SelectField
          v-model="writeScope"
          :label="$t('dialogs.shareAccountDialog.writeScopeLabel')"
          :values="writeScopeOptions"
          label-key="label"
          value-key="value"
        />
      </template>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" :disabled="mutation.isPending.value" @click="isOpen = false">
          {{ $t('dialogs.shareAccountDialog.cancel') }}
        </Button>
        <DemoRestricted>
          <Button type="submit" :disabled="!canSubmit || isDemo" :loading="mutation.isPending.value">
            {{ $t('dialogs.shareAccountDialog.send') }}
          </Button>
        </DemoRestricted>
      </div>
    </form>
  </ResponsiveDialog>
</template>
