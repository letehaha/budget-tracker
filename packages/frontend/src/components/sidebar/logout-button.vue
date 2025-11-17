<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useLogout } from '@/composable/actions/logout';
import { LogOutIcon } from 'lucide-vue-next';

const logoutHandler = useLogout();
</script>

<template>
  <ui-button variant="secondary" class="mt-auto w-full justify-start gap-2 px-3" @click="logoutHandler">
    <LogOutIcon />
    <span> Logout </span>
  </ui-button>
</template>
