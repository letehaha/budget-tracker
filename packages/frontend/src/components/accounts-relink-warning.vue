<template>
  <Popover.Popover v-if="accountsNeedingRelink.length > 0">
    <Popover.PopoverTrigger as-child>
      <Button variant="destructive" size="sm" class="flex items-center gap-2">
        <AlertTriangleIcon class="size-4" />
        <span class="hidden sm:inline"
          >{{ accountsNeedingRelink.length }} account{{ accountsNeedingRelink.length > 1 ? 's' : '' }} need
          attention</span
        >
        <span class="sm:hidden">{{ accountsNeedingRelink.length }}</span>
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-96" align="end">
      <div class="space-y-4">
        <div class="space-y-2">
          <h4 class="text-sm font-semibold">Enable Banking: Action Required</h4>
          <p class="text-muted-foreground text-xs">
            These Enable Banking accounts need to be updated due to a data schema change. This is a one-time action to
            improve synchronization reliability.
          </p>
        </div>

        <Separator.Separator />

        <div class="space-y-3">
          <div class="space-y-2">
            <div class="flex gap-2">
              <span
                class="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              >
                1
              </span>
              <p class="text-muted-foreground text-xs">
                To save your time, firstly try reconnecting the whole bank connection. You can find a
                <span class="text-foreground font-medium">"Reconnect"</span> button under the
                <span class="text-foreground font-medium">"Connection Validity"</span>
                section on each connection page:
              </p>
            </div>
            <!-- Connection links -->
            <div class="ml-7 flex flex-wrap gap-1">
              <router-link
                v-for="connectionId in uniqueConnectionIds"
                :key="connectionId"
                :to="{ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId } }"
                class="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
              >
                <ExternalLinkIcon class="size-3" />
                Connection #{{ connectionId }}
              </router-link>
            </div>
          </div>

          <div class="flex gap-2">
            <span
              class="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium"
            >
              2
            </span>
            <p class="text-muted-foreground text-xs">
              If any accounts remain listed below after reconnection, go to each account and manually
              <span class="text-foreground font-medium">Unlink</span> then
              <span class="text-foreground font-medium">Link</span> again.
            </p>
          </div>
        </div>

        <Separator.Separator />

        <div class="max-h-[200px] space-y-2 overflow-auto pr-4">
          <router-link
            v-for="account in accountsNeedingRelink"
            :key="account.id"
            :to="{ name: ROUTES_NAMES.account, params: { id: account.id } }"
            class="hover:bg-accent flex items-center gap-3 rounded-md p-2 transition-colors"
          >
            <div
              class="bg-warning/20 text-warning-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
            >
              <LinkIcon class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ account.name }}</p>
              <p class="text-muted-foreground text-xs">{{ account.currencyCode }}</p>
            </div>
            <ChevronRightIcon class="text-muted-foreground size-4 shrink-0" />
          </router-link>
        </div>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import * as Separator from '@/components/lib/ui/separator';
import { useSyncStatus } from '@/composable/use-sync-status';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores/accounts';
import { AlertTriangleIcon, ChevronRightIcon, ExternalLinkIcon, LinkIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, watch } from 'vue';

const accountsStore = useAccountsStore();
const { accountsNeedingRelink } = storeToRefs(accountsStore);

// Get unique connection IDs from accounts needing relink
const uniqueConnectionIds = computed(() => {
  const ids = new Set<number>();
  for (const account of accountsNeedingRelink.value) {
    if (account.bankDataProviderConnectionId) {
      ids.add(account.bankDataProviderConnectionId);
    }
  }
  return Array.from(ids);
});

const syncStatus = useSyncStatus();

// Refetch accounts after sync completes to update the relink status
watch(syncStatus.isSyncing, (isSyncing, wasSyncing) => {
  if (wasSyncing && !isSyncing) {
    // Sync just completed, wait 2 seconds then refetch accounts
    setTimeout(() => {
      accountsStore.refetchAccounts();
    }, 2000);
  }
});
</script>
