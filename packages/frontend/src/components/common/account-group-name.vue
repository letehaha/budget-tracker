<script setup lang="ts">
import { type AccountGroups } from '@/common/types/models';

import GroupLogo, { type GroupLogoRounding, type GroupLogoSize } from './group-logo.vue';

withDefaults(
  defineProps<{
    group: AccountGroups;
    iconSize?: GroupLogoSize;
    iconRounded?: GroupLogoRounding;
  }>(),
  { iconSize: 'size-4', iconRounded: 'md' },
);
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <GroupLogo :group="group" :size="iconSize" :rounded="iconRounded" />

    <span class="truncate">
      <slot>{{ group.name }}</slot>
    </span>
  </span>
</template>
