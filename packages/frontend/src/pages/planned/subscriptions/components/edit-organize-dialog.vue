<script setup lang="ts">
import { type SubscriptionDetail, updateSubscription } from '@/api/subscriptions';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import PayeeSelectField from '@/components/fields/payee-select-field.vue';
import TagSelectField from '@/components/fields/tag-select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { useNotificationCenter } from '@/components/notification-center';
import { useInvalidateSubscriptionQueries } from '@/composable/data-queries/subscriptions';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { useCategoriesStore, useTagsStore } from '@/stores';
import type { RecordId } from '@bt/shared/types';
import { useMutation } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ subscription: SubscriptionDetail }>();
const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const { addSuccessNotification } = useNotificationCenter();
const { formattedCategories } = storeToRefs(useCategoriesStore());
const invalidateSubscriptionQueries = useInvalidateSubscriptionQueries();

useTagsStore()
  .loadTags()
  .catch((error) => captureException({ error, context: { scope: 'edit-organize-dialog:load-tags' } }));

interface OrganizeForm {
  categoryId: string | null;
  payeeId: string | null;
  tagIds: string[];
  notes: string;
}

const buildFormState = (): OrganizeForm => ({
  categoryId: props.subscription.categoryId ?? null,
  payeeId: props.subscription.payeeId ?? null,
  tagIds: [...(props.subscription.tagIds ?? [])],
  notes: props.subscription.notes ?? '',
});

const form = ref<OrganizeForm>(buildFormState());
const formError = ref<string | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  form.value = buildFormState();
  formError.value = null;
});

const selectedCategory = computed(() => {
  if (!form.value.categoryId) return null;
  const findCategory = (categories: typeof formattedCategories.value): (typeof formattedCategories.value)[0] | null => {
    for (const cat of categories) {
      if (cat.id === form.value.categoryId) return cat;
      if (cat.subCategories?.length) {
        const found = findCategory(cat.subCategories);
        if (found) return found;
      }
    }
    return null;
  };
  return findCategory(formattedCategories.value);
});

const { mutate, isPending } = useMutation({
  mutationFn: (payload: Parameters<typeof updateSubscription>[0]['payload']) =>
    updateSubscription({ id: props.subscription.id, payload }),
  onSuccess: () => {
    invalidateSubscriptionQueries();
    addSuccessNotification(t('planned.subscriptions.updateSuccess'));
    open.value = false;
  },
  onError: (err) => {
    formError.value =
      err instanceof ApiErrorResponseError
        ? (err.data.message ?? t('planned.subscriptions.updateError'))
        : t('planned.subscriptions.updateError');
  },
});

const handleSubmit = () => {
  formError.value = null;
  mutate({
    categoryId: (form.value.categoryId || null) as RecordId | null,
    payeeId: (form.value.payeeId || null) as RecordId | null,
    tagIds: form.value.tagIds as RecordId[],
    notes: form.value.notes || null,
  });
};
</script>

<template>
  <ResponsiveDialog v-model:open="open" dialog-content-class="max-w-lg">
    <template #title>{{ $t('planned.subscriptions.editors.organize.title') }}</template>
    <template #description>{{ $t('planned.subscriptions.editors.organize.description') }}</template>

    <form id="edit-subscription-organize" class="grid gap-4" @submit.prevent="handleSubmit">
      <CategorySelectField
        :model-value="selectedCategory"
        :values="formattedCategories"
        :label="$t('planned.subscriptions.form.categoryLabel')"
        :placeholder="$t('planned.subscriptions.form.categoryPlaceholder')"
        @update:model-value="(v: any) => (form.categoryId = v?.id ?? null)"
      />

      <div class="grid gap-1.5">
        <PayeeSelectField
          v-model="form.payeeId"
          :label="$t('planned.subscriptions.form.payeeLabel')"
          :placeholder="$t('planned.subscriptions.form.payeePlaceholder')"
        />
        <p class="text-muted-foreground text-xs">{{ $t('planned.subscriptions.form.payeeHint') }}</p>
      </div>

      <div class="grid gap-1.5">
        <TagSelectField
          v-model="form.tagIds"
          :label="$t('planned.subscriptions.form.tagsLabel')"
          :placeholder="$t('planned.subscriptions.form.tagsPlaceholder')"
        />
        <p class="text-muted-foreground text-xs">{{ $t('planned.subscriptions.form.tagsHint') }}</p>
      </div>

      <TextareaField
        v-model="form.notes"
        :label="$t('planned.subscriptions.form.notesLabel')"
        :placeholder="$t('planned.subscriptions.form.notesPlaceholder')"
      />

      <Callout v-if="formError" variant="destructive">
        <span>{{ formError }}</span>
      </Callout>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" :disabled="isPending" @click="open = false">
          {{ $t('planned.subscriptions.cancel') }}
        </Button>
        <Button type="submit" form="edit-subscription-organize" :disabled="isPending">
          {{ $t('planned.subscriptions.form.update') }}
        </Button>
      </div>
    </template>
  </ResponsiveDialog>
</template>
