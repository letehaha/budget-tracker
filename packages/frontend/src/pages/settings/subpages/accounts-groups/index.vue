<template>
  <Card class="@container/account-groups max-w-4xl">
    <CardHeader
      class="flex flex-col gap-4 border-b @sm/account-groups:flex-row @sm/account-groups:items-start @sm/account-groups:justify-between"
    >
      <div class="min-w-0">
        <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.accountGroups.page.title') }}</h2>
        <p class="text-sm opacity-80">{{ $t('settings.accountGroups.page.description') }}</p>
      </div>

      <div class="@sm/account-groups:shrink-0">
        <CreateAccountGroupDialog>
          <Button type="button" size="sm">
            <PlusIcon class="size-4" />
            {{ $t('settings.accountGroups.page.addButton') }}
          </Button>
        </CreateAccountGroupDialog>
      </div>
    </CardHeader>

    <CardContent class="mt-6">
      <AccountGroupsList />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import CreateAccountGroupDialog from '@/components/dialogs/account-groups/create-account-group-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { PlusIcon } from '@lucide/vue';

import AccountGroupsList from './list.vue';
</script>
