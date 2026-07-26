<script setup lang="ts">
import { AccountGroups } from '@/common/types/models';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useRenameAccountGroup } from '@/composable/data-queries/account-groups';
import { SaveIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

import { resolveRename } from './resolve-rename';

const props = defineProps<{ group: AccountGroups }>();

const name = ref(props.group.name);

// Renaming elsewhere (or collapsing and reopening the row) should not leave a stale
// draft in the field.
watch(
  () => props.group.name,
  (value) => {
    name.value = value;
  },
);

const rename = computed(() => resolveRename({ draftName: name.value, currentName: props.group.name }));
const canSubmit = computed(() => rename.value.outcome === 'submit');

const { mutate, isPending } = useRenameAccountGroup({ groupId: () => props.group.id });

const submit = () => {
  if (!canSubmit.value) return;
  mutate({ name: rename.value.name });
};
</script>

<template>
  <form
    class="flex flex-col gap-2 @[30rem]/account-groups:flex-row @[30rem]/account-groups:items-end"
    @submit.prevent="submit"
  >
    <InputField
      v-model="name"
      class="flex-1"
      :label="$t('settings.accountGroups.rename.label')"
      :placeholder="$t('settings.accountGroups.rename.placeholder')"
    />

    <Button type="submit" size="sm" :disabled="!canSubmit || isPending">
      <SaveIcon class="size-4" />
      {{ $t('settings.accountGroups.rename.saveButton') }}
    </Button>
  </form>
</template>
