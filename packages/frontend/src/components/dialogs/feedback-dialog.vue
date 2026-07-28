<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('feedback.dialog.title') }}</template>
    <template #description>{{ $t('feedback.dialog.description') }}</template>

    <form class="grid gap-4" @submit.prevent="submit">
      <SelectField
        v-model="feedbackType"
        :values="feedbackTypeOptions"
        :label="$t('feedback.dialog.typeLabel')"
        :placeholder="$t('feedback.dialog.typePlaceholder')"
        label-key="label"
        value-key="value"
      />

      <TextareaField
        v-model="message"
        :label="$t('feedback.dialog.messageLabel')"
        :placeholder="$t('feedback.dialog.messagePlaceholder')"
        :error-message="errorMessage"
        :maxlength="MAX_FEEDBACK_MESSAGE_LENGTH"
        rows="5"
      />

      <UiButton type="submit" class="w-full" :disabled="!canSubmit">
        {{ $t('feedback.dialog.submit') }}
      </UiButton>
    </form>

    <div class="text-muted-foreground my-5 flex items-center gap-3 text-xs tracking-wide uppercase">
      <span class="border-border flex-1 border-t" />
      {{ $t('feedback.dialog.or') }}
      <span class="border-border flex-1 border-t" />
    </div>

    <a
      :href="EXTERNAL_URLS.featurebaseBoard"
      target="_blank"
      rel="noopener noreferrer"
      class="border-border hover:border-primary/40 hover:bg-accent group flex items-start gap-3 rounded-lg border p-4 transition-colors"
    >
      <UsersIcon class="text-muted-foreground group-hover:text-primary mt-0.5 size-5 shrink-0 transition-colors" />

      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5 text-sm font-medium">
          {{ $t('feedback.dialog.board.title') }}
          <ExternalLinkIcon class="size-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
        </span>
        <span class="text-muted-foreground mt-1 block text-sm leading-relaxed">
          {{ $t('feedback.dialog.board.description') }}
        </span>
      </span>
    </a>
  </ResponsiveDialog>
</template>

<script lang="ts" setup>
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { EXTERNAL_URLS } from '@bt/shared/const/external-urls';
import { ExternalLinkIcon, UsersIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type FeedbackType, MAX_FEEDBACK_MESSAGE_LENGTH, buildFeedbackSubmission } from './feedback-submission';

const { t } = useI18n();
const { addSuccessNotification } = useNotificationCenter();

const isOpen = ref(false);
const message = ref('');
const errorMessage = ref('');

const feedbackTypeOptions = computed<{ value: FeedbackType; label: string }[]>(() => [
  { value: 'bug', label: t('feedback.dialog.types.bug') },
  { value: 'feature_request', label: t('feedback.dialog.types.featureRequest') },
  { value: 'other', label: t('feedback.dialog.types.other') },
]);

const feedbackType = ref<{ value: FeedbackType; label: string } | null>(feedbackTypeOptions.value[0]!);

const canSubmit = computed(() => message.value.trim().length > 0 && Boolean(feedbackType.value));

// The message rides along on the PostHog event rather than being stored here.
// Nothing in the app reads feedback back, so persisting it would mean a table,
// an endpoint and a moderation story for data we only ever look at in PostHog.
// The board link below covers the cases that need a reply or public voting.
function submit() {
  const submission = buildFeedbackSubmission({
    message: message.value,
    feedbackType: feedbackType.value?.value ?? null,
  });

  if (!submission) {
    errorMessage.value = t('feedback.dialog.messageRequired');
    return;
  }

  trackAnalyticsEvent({ event: 'user_feedback_submitted', properties: submission });
  addSuccessNotification(t('feedback.dialog.thanks'));

  message.value = '';
  errorMessage.value = '';
  feedbackType.value = feedbackTypeOptions.value[0]!;
  isOpen.value = false;
}
</script>
