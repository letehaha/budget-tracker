<script setup lang="ts">
import { listReceivedShareInvitations } from '@/api/share';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { RESOURCE_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { UsersIcon } from '@lucide/vue';
import { computed } from 'vue';

import HouseholdInvitationContent from './share-invitation/household-invitation-content.vue';
import ResourceShareInvitationContent from './share-invitation/resource-share-invitation-content.vue';

/**
 * Wrapper for the share-invitation modal. Resolves the invitation from the received-list
 * cache by token, then branches by `resourceType` to the matching content subcomponent.
 *
 * The wrapper owns:
 *   - the received-invitations query
 *   - the dialog shell (icon header, loading/not-found/error fallbacks)
 *   - opening/closing via the parent's `token` prop (mounted by the dashboard layout)
 *
 * Each child component owns its own state machine, mutations, and footer buttons for its
 * resourceType — the wrapper deliberately does not know about household back-invite or
 * currency-mismatch flows.
 */

const props = defineProps<{
  /** Token from the route query. Empty string when no invitation pending → dialog closed. */
  token: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const isOpen = computed({
  get: () => props.token.length > 0,
  set: (value) => {
    if (!value) emit('close');
  },
});

const {
  data: pendingInvitations,
  isFetched: isPendingFetched,
  isError: isPendingError,
  refetch: refetchPendingInvitations,
} = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.shareInvitationsReceived,
  queryFn: listReceivedShareInvitations,
  enabled: isOpen,
});

const matchingPending = computed(
  () => pendingInvitations.value?.find((invitation) => invitation.token === props.token) ?? null,
);

const phase = computed<'loading' | 'pending' | 'not-found' | 'error'>(() => {
  // Surface query failure explicitly — without this, isFetched stays false on error and
  // the dialog would render an eternal "Loading…" with no retry path for the recipient.
  if (isPendingError.value) return 'error';
  if (!isPendingFetched.value) return 'loading';
  return matchingPending.value ? 'pending' : 'not-found';
});

const closeDialog = () => emit('close');
const retryFetchInvitations = () => {
  void refetchPendingInvitations();
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="sm:max-w-md">
    <div class="flex flex-col gap-6 pt-2">
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="bg-primary/10 flex size-16 items-center justify-center rounded-full">
          <UsersIcon class="text-primary size-8" />
        </div>
      </div>

      <template v-if="phase === 'loading'">
        <h2 class="text-center text-xl font-semibold">
          {{ $t('dialogs.shareInvitationDialog.titleLoading') }}
        </h2>
        <p class="text-muted-foreground text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.loading') }}
        </p>
      </template>

      <template v-else-if="phase === 'not-found'">
        <h2 class="text-center text-xl font-semibold">
          {{ $t('dialogs.shareInvitationDialog.titleNotFound') }}
        </h2>
        <p class="text-muted-foreground text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.notFoundBody') }}
        </p>
        <div class="flex shrink-0 pt-4 sm:justify-end">
          <Button variant="outline" class="w-full" @click="closeDialog">
            {{ $t('dialogs.shareInvitationDialog.close') }}
          </Button>
        </div>
      </template>

      <template v-else-if="phase === 'error'">
        <h2 class="text-center text-xl font-semibold">
          {{ $t('dialogs.shareInvitationDialog.titleLoadError') }}
        </h2>
        <p class="text-muted-foreground text-center text-sm">
          {{ $t('dialogs.shareInvitationDialog.loadErrorBody') }}
        </p>
        <div class="flex shrink-0 flex-col-reverse pt-4 sm:flex-row sm:justify-end sm:gap-x-2">
          <Button variant="outline" class="flex-1" @click="closeDialog">
            {{ $t('dialogs.shareInvitationDialog.close') }}
          </Button>
          <Button class="flex-1" @click="retryFetchInvitations">
            {{ $t('dialogs.shareInvitationDialog.retry') }}
          </Button>
        </div>
      </template>

      <HouseholdInvitationContent
        v-else-if="matchingPending && matchingPending.resourceType === RESOURCE_TYPES.household"
        :invitation="matchingPending"
        @close="closeDialog"
      />

      <ResourceShareInvitationContent v-else-if="matchingPending" :invitation="matchingPending" @close="closeDialog" />
    </div>
  </ResponsiveDialog>
</template>
