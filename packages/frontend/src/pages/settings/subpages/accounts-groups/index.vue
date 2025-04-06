<template>
  <Card class="@container/accounts-groups-card max-w-[700px]">
    <CardHeader
      :class="[
        'border-b flex justify-between gap-4',
        '@[450px]/accounts-groups-card:flex-row @[450px]/accounts-groups-card:items-center',
      ]"
    >
      <h3 class="text-xl">Manage account groups</h3>

      <CreateAccountGroupDialog>
        <Button type="button" class="w-min"> Add new group <PlusIcon class="ml-2 size-5" /> </Button>
      </CreateAccountGroupDialog>
    </CardHeader>

    <CardContent>
      <AccountsGroupsTable class="mt-4" />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import CreateAccountGroupDialog from '@/components/dialogs/account-groups/create-account-group-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { PlusIcon } from 'lucide-vue-next';

import AccountsGroupsTable from './table.vue';
</script>
