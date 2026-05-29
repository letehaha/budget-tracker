<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { getErrorMessage } from '@/common/utils/error-message';
import { fractionToPercentInput, isPercentInputValid, percentInputToFraction } from '@/common/utils/percentage';
import { useCreateVenturePlatform, useUpdateVenturePlatform } from '@/composable/data-queries/venture/platforms';
import type { VenturePlatformModel } from '@bt/shared/types';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface Emit {
  (e: 'saved', platform: VenturePlatformModel): void;
  (e: 'cancel'): void;
}

const props = defineProps<{
  platform?: VenturePlatformModel | null;
}>();

const emit = defineEmits<Emit>();

const { addNotification } = useNotificationCenter();

const createMutation = useCreateVenturePlatform();
const updateMutation = useUpdateVenturePlatform();

const makeInitial = (p?: VenturePlatformModel | null) => ({
  name: p?.name ?? '',
  website: p?.website ?? '',
  description: p?.description ?? '',
  defaultEntryFeePctPercent: fractionToPercentInput(p?.defaultEntryFeePct ?? '0'),
  defaultMgmtFeePctPercent: fractionToPercentInput(p?.defaultMgmtFeePct ?? '0'),
  defaultCarryPctPercent: fractionToPercentInput(p?.defaultCarryPct ?? '0.2'),
  defaultHurdlePctPercent: fractionToPercentInput(p?.defaultHurdlePct ?? '0'),
});

const form = reactive(makeInitial(props.platform));

watch(
  () => props.platform,
  (p) => {
    Object.assign(form, makeInitial(p));
  },
);

const isPending = computed(() => createMutation.isPending.value || updateMutation.isPending.value);

const isFormValid = computed(
  () =>
    form.name.trim().length > 0 &&
    isPercentInputValid(form.defaultEntryFeePctPercent) &&
    isPercentInputValid(form.defaultMgmtFeePctPercent) &&
    isPercentInputValid(form.defaultCarryPctPercent) &&
    isPercentInputValid(form.defaultHurdlePctPercent),
);

const buildPayload = () => ({
  name: form.name.trim(),
  website: form.website.trim() || null,
  description: form.description.trim() || null,
  defaultEntryFeePct: percentInputToFraction(form.defaultEntryFeePctPercent),
  defaultMgmtFeePct: percentInputToFraction(form.defaultMgmtFeePctPercent),
  defaultCarryPct: percentInputToFraction(form.defaultCarryPctPercent),
  defaultHurdlePct: percentInputToFraction(form.defaultHurdlePctPercent),
});

const onSubmit = async () => {
  if (!isFormValid.value) return;
  try {
    const payload = buildPayload();
    const saved = props.platform
      ? await updateMutation.mutateAsync({ platformId: props.platform.id, payload })
      : await createMutation.mutateAsync(payload);

    addNotification({
      text: props.platform
        ? t('venture.platforms.notifications.updated')
        : t('venture.platforms.notifications.created'),
      type: NotificationType.success,
    });
    emit('saved', saved);
  } catch (err) {
    addNotification({
      text: getErrorMessage(err, t('venture.platforms.notifications.error')),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <form class="grid w-full max-w-[600px] gap-4" @submit.prevent="onSubmit">
    <InputField
      v-model="form.name"
      :label="$t('venture.platforms.form.nameLabel')"
      :placeholder="$t('venture.platforms.form.namePlaceholder')"
      :disabled="isPending"
      :error="!form.name.trim() && $t('venture.platforms.form.nameRequired')"
    />

    <InputField
      v-model="form.website"
      :label="$t('venture.platforms.form.websiteLabel')"
      :placeholder="$t('venture.platforms.form.websitePlaceholder')"
      :disabled="isPending"
    />

    <TextareaField
      v-model="form.description"
      :label="$t('venture.platforms.form.descriptionLabel')"
      :placeholder="$t('venture.platforms.form.descriptionPlaceholder')"
      :disabled="isPending"
    />

    <div class="grid grid-cols-2 gap-4">
      <InputField
        v-model="form.defaultEntryFeePctPercent"
        type="number"
        step="0.01"
        :label="$t('venture.platforms.form.entryFeeLabel')"
        :disabled="isPending"
        :error="!isPercentInputValid(form.defaultEntryFeePctPercent) && $t('venture.platforms.form.percentInvalid')"
      />
      <InputField
        v-model="form.defaultMgmtFeePctPercent"
        type="number"
        step="0.01"
        :label="$t('venture.platforms.form.mgmtFeeLabel')"
        :disabled="isPending"
        :error="!isPercentInputValid(form.defaultMgmtFeePctPercent) && $t('venture.platforms.form.percentInvalid')"
      />
      <InputField
        v-model="form.defaultCarryPctPercent"
        type="number"
        step="0.01"
        :label="$t('venture.platforms.form.carryLabel')"
        :disabled="isPending"
        :error="!isPercentInputValid(form.defaultCarryPctPercent) && $t('venture.platforms.form.percentInvalid')"
      />
      <InputField
        v-model="form.defaultHurdlePctPercent"
        type="number"
        step="0.01"
        :label="$t('venture.platforms.form.hurdleLabel')"
        :disabled="isPending"
        :error="!isPercentInputValid(form.defaultHurdlePctPercent) && $t('venture.platforms.form.percentInvalid')"
      />
    </div>

    <div class="flex justify-end gap-2">
      <UiButton type="button" variant="secondary" :disabled="isPending" @click="emit('cancel')">
        {{ $t('venture.platforms.form.cancel') }}
      </UiButton>
      <UiButton type="submit" :disabled="isPending || !isFormValid">
        {{
          isPending
            ? $t('venture.platforms.form.saving')
            : props.platform
              ? $t('venture.platforms.form.save')
              : $t('venture.platforms.form.create')
        }}
      </UiButton>
    </div>
  </form>
</template>
