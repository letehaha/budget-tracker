<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import Label from '@/components/lib/ui/label/Label.vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/lib/ui/select';
import { useNotificationCenter } from '@/components/notification-center';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { MessageSquareIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

type FeedbackType = 'bug' | 'feature_request' | 'other';

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();

const isOpen = ref(false);
const feedbackType = ref<FeedbackType>('bug');
const message = ref('');
const isSubmitting = ref(false);

const FEEDBACK_TYPES = computed(() => [
  { value: 'bug' as const, label: t('dialogs.feedback.types.bug') },
  { value: 'feature_request' as const, label: t('dialogs.feedback.types.featureRequest') },
  { value: 'other' as const, label: t('dialogs.feedback.types.other') },
]);

watch(isOpen, (open) => {
  if (!open) {
    feedbackType.value = 'bug';
    message.value = '';
  }
});

const submit = () => {
  if (!message.value.trim()) return;

  try {
    isSubmitting.value = true;

    trackAnalyticsEvent({
      event: 'user_feedback_submitted',
      properties: {
        feedback_type: feedbackType.value,
        message: message.value.trim(),
      },
    });

    isOpen.value = false;
    addSuccessNotification(t('dialogs.feedback.notifications.success'));
  } catch {
    addErrorNotification(t('dialogs.feedback.notifications.error'));
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <ui-button variant="ghost-primary" class="w-full justify-start gap-2 px-3" size="default">
        <MessageSquareIcon class="size-4 shrink-0" />
        <span>{{ t('dialogs.feedback.sidebarButton') }}</span>
      </ui-button>
    </template>

    <template #title>{{ t('dialogs.feedback.title') }}</template>
    <template #description>{{ t('dialogs.feedback.description') }}</template>

    <template #default>
      <div class="grid gap-4 p-1">
        <div class="grid gap-2">
          <Label>{{ t('dialogs.feedback.typeLabel') }}</Label>
          <Select v-model="feedbackType">
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="type in FEEDBACK_TYPES" :key="type.value" :value="type.value">
                {{ type.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid gap-2">
          <Label>{{ t('dialogs.feedback.messageLabel') }}</Label>
          <textarea
            v-model="message"
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-30 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            :placeholder="t('dialogs.feedback.messagePlaceholder')"
          />
        </div>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex justify-end gap-2">
        <ui-button variant="outline" @click="close">{{ t('dialogs.feedback.cancelButton') }}</ui-button>
        <ui-button :disabled="!message.trim() || isSubmitting" @click="submit">
          {{ t('dialogs.feedback.submitButton') }}
        </ui-button>
      </div>
    </template>
  </ResponsiveDialog>
</template>
