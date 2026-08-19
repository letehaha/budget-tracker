<script setup lang="ts">
import { AccountGroups } from '@/common/types/models';
import AccountLogo from '@/components/common/account-logo.vue';
import GroupLogo from '@/components/common/group-logo.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { useDeleteAccountGroup } from '@/composable/data-queries/account-groups';
import { CheckIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ group: AccountGroups }>();

const { t } = useI18n();

const isConfirmOpen = ref(false);

const isBankLinked = computed(() => props.group.bankDataProviderConnectionId != null);
const accountsCount = computed(() => props.group.accounts.length);

const metaLine = computed(() => {
  const count = t('settings.accountGroups.row.accountsCount', { count: accountsCount.value }, accountsCount.value);
  return isBankLinked.value ? `${t('settings.accountGroups.row.bankBadge')} · ${count}` : count;
});

const { mutate: removeGroup, isPending } = useDeleteAccountGroup({
  groupId: () => props.group.id,
  onSuccess: () => {
    isConfirmOpen.value = false;
  },
});
</script>

<template>
  <Button variant="soft-destructive" size="sm" :disabled="isPending" @click="isConfirmOpen = true">
    <Trash2Icon class="size-4" />
    {{ $t('settings.accountGroups.delete.button') }}
  </Button>

  <ResponsiveAlertDialog
    v-model:open="isConfirmOpen"
    :confirm-label="$t('settings.accountGroups.delete.button')"
    confirm-variant="destructive"
    :confirm-disabled="isPending"
    @confirm="removeGroup()"
  >
    <template #title>
      <div class="flex items-center gap-3 text-left">
        <GroupLogo :group="group" size="size-9" variant="tile" />

        <div class="min-w-0">
          <div class="truncate">{{ $t('settings.accountGroups.delete.confirmTitle', { name: group.name }) }}</div>
          <div class="text-muted-foreground truncate text-xs font-normal">{{ metaLine }}</div>
        </div>
      </div>
    </template>

    <template #description>
      <div class="flex flex-col gap-2 text-left">
        <div class="flex items-start gap-2 text-sm">
          <CheckIcon class="text-success-text mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{{ $t('settings.accountGroups.delete.accountsKept') }}</span>
        </div>

        <div v-if="isBankLinked" class="flex items-start gap-2 text-sm">
          <CheckIcon class="text-success-text mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{{ $t('settings.accountGroups.delete.syncContinues') }}</span>
        </div>
      </div>
    </template>

    <div v-if="accountsCount" class="mt-4">
      <h4 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        {{ $t('settings.accountGroups.delete.ungroupedHeading') }}
      </h4>

      <ScrollArea class="border-border/60 bg-card max-h-48 rounded-lg border" viewport-class="max-h-48">
        <div class="divide-border/60 divide-y">
          <div v-for="account in group.accounts" :key="account.id" class="flex items-center gap-3 px-3 py-2">
            <AccountLogo :account="account" class="size-8" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ account.name }}</span>
            <span class="text-muted-foreground shrink-0 text-sm tabular-nums">{{ account.currencyCode }}</span>
          </div>
        </div>
      </ScrollArea>
    </div>
  </ResponsiveAlertDialog>
</template>
