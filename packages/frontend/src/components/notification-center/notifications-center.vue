<template>
  <transition-group class="notifications-center" name="notifications-center" tag="div">
    <template v-for="item in notifications" :key="item.id">
      <div
        class="notifications-center__item"
        :class="{
          'notifications-center__item--warning': item.type === NotificationType.warning,
          'notifications-center__item--error': item.type === NotificationType.error,
          'notifications-center__item--info': item.type === NotificationType.info,
          'notifications-center__item--success': item.type === NotificationType.success,
        }"
      >
        <template v-if="item.type === NotificationType.warning">
          <WarningIcon class="notifications-center__item-icon" />
        </template>
        <template v-else-if="item.type === NotificationType.error">
          <ErrorIcon class="notifications-center__item-icon" />
        </template>
        <template v-else-if="item.type === NotificationType.success">
          <SuccessIcon class="notifications-center__item-icon" />
        </template>

        {{ item.text }}

        <button type="button" class="notifications-center__item-xmark" @click="removeNotification(item.id)">
          <XmarkIcon />
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

<style lang="scss">
.notifications-center {
  position: fixed;
  top: 85px;
  right: 4px;
  z-index: var(--z-notifications);

  display: grid;
  grid-gap: 8px;
}
.notifications-center__item {
  width: 370px;
  padding: 12px 16px;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  line-height: 1.5;

  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.notifications-center__item--warning {
  background-color: var(--app-warning-color);
}
.notifications-center__item--error {
  background-color: var(--app-danger-color);
}
.notifications-center__item--info {
  background-color: #2b3037;
}
.notifications-center__item--success {
  background-color: var(--app-success-color);
}
.notifications-center__item-icon {
  width: 20px;
  display: block;
  flex: none;
}
.notifications-center__item-xmark {
  border: none;
  background-color: transparent;
  cursor: pointer;

  margin-left: auto;
  flex: none;
  width: 24px;
  height: 24px;

  color: #fff;

  &:hover {
    svg {
      transform: scale(1.15);
    }
  }
  svg {
    width: 14px;

    transition: 0.2s ease-out;
  }
}

.notifications-center-enter,
.notifications-center-leave-to {
  opacity: 0;
  transform: scale(0.95);
  transition: 0.3s ease-out;
}
</style>
