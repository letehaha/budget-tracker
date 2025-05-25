<script setup lang="ts">
import { createAccountsGroup } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';

const queryClient = useQueryClient();
const form = ref({
  name: '',
});

const emit = defineEmits(['created']);

const isOpen = ref(false);

const { isPending: isMutating, mutate } = useMutation({
  mutationFn: createAccountsGroup,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
    isOpen.value = false;
    form.value.name = '';
    emit('created');
  },
});
const isSubmitDisabled = computed(() => isMutating.value || !form.value.name);

const createGroup = async () => {
  await mutate({ name: form.value.name });
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      <span> Create group </span>
    </template>

    <form class="mt-4" @submit.prevent="createGroup">
      <InputField v-model="form.name" label="Group name" placeholder="Investments" />

      <div class="mt-4 flex">
        <UiButton class="mt-3 w-full" :disabled="isSubmitDisabled"> Create </UiButton>
      </div>
    </form>
  </ResponsiveDialog>
</template>
