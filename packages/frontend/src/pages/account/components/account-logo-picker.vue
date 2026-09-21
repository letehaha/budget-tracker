<script setup lang="ts">
import AccountLogo from '@/components/common/account-logo.vue';
import EntityLogoPicker from '@/components/common/entity-logo-picker.vue';
import { toLogoPayload } from '@/components/common/logo-selection';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useAccountsStore } from '@/stores';
import type { EntityLogoPayload } from '@bt/shared/types';
import { PencilIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

const props = defineProps<{
  accountId: string;
}>();

const isOpen = ref(false);

const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);

// Saving refetches the accounts store, not the vehicle/loan query of the host page.
const liveAccount = computed(() => accountsRecord.value[props.accountId]);

const save = ({ payload }: { payload: EntityLogoPayload }) =>
  accountsStore.editAccount({ id: props.accountId, ...payload });
const reset = () => save({ payload: toLogoPayload({ selection: null }) });
</script>

<template>
  <div v-if="liveAccount" class="group relative shrink-0">
    <AccountLogo :account="liveAccount" class="size-full" />
    <DesktopOnlyTooltip :content="$t('pages.account.logo.change')">
      <Button
        variant="ghost"
        size="icon"
        class="bg-background/80 hover:bg-background absolute inset-0 size-full rounded-lg opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        :aria-label="$t('pages.account.logo.change')"
        @click="isOpen = true"
      >
        <PencilIcon class="size-4" />
      </Button>
    </DesktopOnlyTooltip>

    <EntityLogoPicker
      v-model:open="isOpen"
      :name-for-search="liveAccount.name"
      :current-domain="liveAccount.logoDomain ?? null"
      :current-initials="liveAccount.logoInitials ?? null"
      :current-color="liveAccount.logoColor ?? null"
      :title="$t('pages.account.logo.dialogTitle')"
      :description="$t('pages.account.logo.dialogDescription')"
      :reset-label="$t('common.logo.remove')"
      :saved-message="$t('pages.account.logo.updatedToast')"
      :reset-message="$t('pages.account.logo.resetToast')"
      :error-message="$t('pages.account.logo.error')"
      flow="accountLogo"
      :save="save"
      :reset="reset"
    />
  </div>
</template>
