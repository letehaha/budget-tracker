<template>
  <transition-group class="z-notifications fixed top-[85px] right-1 grid gap-2" name="notifications-center" tag="div">
    <template v-for="item in notifications" :key="item.id">
      <div
        class="font-base flex w-[370px] items-start gap-4 rounded-lg px-4 py-3 text-white"
        :class="{
          'bg-warning': item.type === NotificationType.warning,
          'bg-destructive': item.type === NotificationType.error,
          'bg-popover': item.type === NotificationType.info,
          'bg-success': item.type === NotificationType.success,
        }"
      >
        <template v-if="item.type === NotificationType.warning">
          <WarningIcon class="block w-5 flex-none" />
        </template>
        <template v-else-if="item.type === NotificationType.error">
          <ErrorIcon class="block w-5 flex-none" />
        </template>
        <template v-else-if="item.type === NotificationType.success">
          <SuccessIcon class="block w-5 flex-none" />
        </template>

        {{ item.text }}

        <button
          type="button"
          class="x-mark-button ml-auto size-6 flex-none cursor-pointer border-none bg-transparent text-white"
          @click="removeNotification(item.id)"
        >
          <XmarkIcon class="w-4 transition-transform group-hover/x-mark-button:transform-[scale(1.15)]" />
        </button>
      </div>
    </template>
  </transition-group>
</template>

<script setup lang="ts">
import ErrorIcon from '@/assets/icons/error.svg?component';
import SuccessIcon from '@/assets/icons/success.svg?component';
import WarningIcon from '@/assets/icons/warning.svg?component';
import XmarkIcon from '@/assets/icons/xmark.svg?component';

import { NotificationType, useNotificationCenter } from './index';

const { notifications, removeNotification } = useNotificationCenter();
</script>

<style>
@reference "../../styles/global.css";

.notifications-center-enter,
.notifications-center-leave-to {
  @apply scale-95 opacity-0 transition-all duration-300 ease-out;
}
</style>
