<script setup lang="ts">
import { type LogoSelection, toOptionalLogoPayload } from '@/components/common/logo-selection';
import LogoSquareField from '@/components/common/logo-square-field.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useCreateAccountGroup } from '@/composable/data-queries/account-groups';
import { useOnboardingStore } from '@/stores/onboarding';
import { FolderIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

const form = ref<{
  name: string;
  /** Manually chosen brand or monogram. null = no logo; the group renders a folder icon (groups have no auto-resolution). */
  logo: LogoSelection | null;
}>({
  name: '',
  logo: null,
});

const emit = defineEmits(['created']);

const isOpen = ref(false);

const { isPending: isMutating, mutate } = useCreateAccountGroup({
  onSuccess: () => {
    // Mark onboarding task as complete
    const onboardingStore = useOnboardingStore();
    onboardingStore.completeTask('create-account-group');

    isOpen.value = false;
    form.value = { name: '', logo: null };
    emit('created');
  },
});
const isSubmitDisabled = computed(() => isMutating.value || !form.value.name);

const createGroup = () => {
  mutate({
    name: form.value.name,
    ...toOptionalLogoPayload({ selection: form.value.logo }),
  });
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      <span>{{ $t('dialogs.accountGroups.createDialog.title') }}</span>
    </template>

    <form class="mt-4" @submit.prevent="createGroup">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <InputField
            v-model="form.name"
            :label="$t('dialogs.accountGroups.createDialog.nameLabel')"
            :placeholder="$t('dialogs.accountGroups.createDialog.namePlaceholder')"
          />
        </div>
        <LogoSquareField
          v-model="form.logo"
          :name-for-search="form.name"
          :reset-label="$t('common.logo.remove')"
          size-class="size-10 rounded-lg"
          align="with-labeled-field"
        >
          <template #placeholder>
            <div class="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <FolderIcon class="text-muted-foreground size-5" aria-hidden="true" />
            </div>
          </template>
        </LogoSquareField>
      </div>

      <div class="mt-4 flex">
        <UiButton class="mt-3 w-full" :disabled="isSubmitDisabled">
          {{ $t('dialogs.accountGroups.createDialog.createButton') }}
        </UiButton>
      </div>
    </form>
  </ResponsiveDialog>
</template>
