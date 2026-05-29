<script setup lang="ts">
import {
  NOTIFICATION_TYPES,
  type NotificationType,
  type ShareInvitationNotificationPayload,
  type ShareInvitationSendFailedPayload,
  type ShareLifecycleNotificationPayload,
} from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type SharePayload =
  | ShareInvitationNotificationPayload
  | ShareLifecycleNotificationPayload
  | ShareInvitationSendFailedPayload;

const props = defineProps<{
  type: NotificationType;
  payload: SharePayload | undefined;
}>();

const { t } = useI18n();

/**
 * Three payload shapes flow through here:
 *   - `ShareInvitationNotificationPayload` (received) has `owner`.
 *   - `ShareLifecycleNotificationPayload` (accepted/declined/revoked/etc.) has `counterpartUser`.
 *   - `ShareInvitationSendFailedPayload` (owner-side) has `inviteeSnapshot` (nullable) plus `inviteeEmail`.
 */
const counterpartLabel = computed(() => {
  if (!props.payload) return null;

  if (
    props.type === NOTIFICATION_TYPES.shareInvitationReceived ||
    props.type === NOTIFICATION_TYPES.householdInvitationReceived
  ) {
    const payload = props.payload as ShareInvitationNotificationPayload;
    return payload.owner?.username ? `@${payload.owner.username}` : null;
  }

  if (
    props.type === NOTIFICATION_TYPES.shareInvitationSendFailed ||
    props.type === NOTIFICATION_TYPES.householdInvitationSendFailed
  ) {
    const payload = props.payload as ShareInvitationSendFailedPayload;
    if (payload.inviteeSnapshot?.username) return `@${payload.inviteeSnapshot.username}`;
    return payload.inviteeEmail ?? null;
  }

  const payload = props.payload as ShareLifecycleNotificationPayload;
  return payload.counterpartUser?.username ? `@${payload.counterpartUser.username}` : null;
});

const resourceName = computed(() => {
  if (!props.payload) return null;
  return 'resourceName' in props.payload ? props.payload.resourceName : null;
});

const summary = computed(() => {
  if (
    props.type === NOTIFICATION_TYPES.shareInvitationSendFailed ||
    props.type === NOTIFICATION_TYPES.householdInvitationSendFailed
  ) {
    return t('notifications.share.sendFailedHint');
  }
  return null;
});
</script>

<template>
  <div v-if="resourceName || counterpartLabel" class="mt-0.5 flex flex-col gap-0.5">
    <div class="flex items-center gap-1.5 text-xs">
      <span v-if="counterpartLabel" class="text-foreground/80 truncate font-medium">
        {{ counterpartLabel }}
      </span>
      <span v-if="counterpartLabel && resourceName" class="text-muted-foreground">·</span>
      <span v-if="resourceName" class="text-muted-foreground truncate">
        {{ resourceName }}
      </span>
    </div>
    <p v-if="summary" class="text-muted-foreground text-xs">
      {{ summary }}
    </p>
  </div>
</template>
