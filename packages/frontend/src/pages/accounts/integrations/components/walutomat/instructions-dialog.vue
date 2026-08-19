<template>
  <SharedInstructionsDialog
    :open="open"
    :title="t('pages.integrations.walutomat.instructions.title')"
    @update:open="$emit('update:open', $event)"
  >
    <div class="space-y-4 text-sm">
      <div>
        <h3 class="mb-2 text-base font-semibold">
          {{ t('pages.integrations.walutomat.instructions.overviewTitle') }}
        </h3>
        <p class="text-muted-foreground">
          {{ t('pages.integrations.walutomat.instructions.overviewText') }}
        </p>
      </div>

      <div class="space-y-2">
        <InstructionStep
          :step="1"
          :title="t('pages.integrations.walutomat.instructions.step1Title')"
          content-class="space-y-2"
          default-open
        >
          <p>{{ t('pages.integrations.walutomat.instructions.step1Intro') }}</p>
          <div class="space-y-2">
            <div class="bg-muted rounded-md p-3 font-mono text-xs">
              <ClickToCopy value="openssl genrsa -out private.key 4096" class="w-full" />
            </div>
            <div class="bg-muted rounded-md p-3 font-mono text-xs">
              <ClickToCopy value="openssl rsa -in private.key -pubout -out public.key" class="w-full" />
            </div>
          </div>
          <p>
            <i18n-t keypath="pages.integrations.walutomat.instructions.step1FilesCreated" tag="span">
              <template #privateKey>
                <code class="bg-muted rounded px-1">private.key</code>
              </template>
              <template #publicKey>
                <code class="bg-muted rounded px-1">public.key</code>
              </template>
            </i18n-t>
          </p>
        </InstructionStep>

        <InstructionStep
          :step="2"
          :title="t('pages.integrations.walutomat.instructions.step2Title')"
          content-class="space-y-2"
        >
          <p>
            {{ t('pages.integrations.walutomat.instructions.step2Login') }}
            <ExternalLink href="https://www.walutomat.com" text="walutomat.com" />
          </p>
          <p>
            <i18n-t keypath="pages.integrations.walutomat.instructions.step2GoToSettings" tag="span">
              <template #settings>
                <strong class="text-foreground">Settings</strong>
              </template>
              <template #api>
                <strong class="text-foreground">API</strong>
              </template>
            </i18n-t>
          </p>
          <p>
            <i18n-t keypath="pages.integrations.walutomat.instructions.step2Upload" tag="span">
              <template #publicKey>
                <code class="bg-muted rounded px-1">public.key</code>
              </template>
            </i18n-t>
          </p>
          <p>{{ t('pages.integrations.walutomat.instructions.step2ApiKeyGenerated') }}</p>
        </InstructionStep>

        <InstructionStep
          :step="3"
          :title="t('pages.integrations.walutomat.instructions.step3Title')"
          content-class="space-y-2"
        >
          <p>{{ t('pages.integrations.walutomat.instructions.step3Intro') }}</p>
          <ul class="list-inside list-disc space-y-1">
            <li>
              <i18n-t keypath="pages.integrations.walutomat.instructions.step3ApiKeyDesc" tag="span">
                <template #apiKey>
                  <strong class="text-foreground">{{ t('pages.integrations.walutomat.apiKeyLabel') }}</strong>
                </template>
              </i18n-t>
            </li>
            <li>
              <i18n-t keypath="pages.integrations.walutomat.instructions.step3PrivateKeyDesc" tag="span">
                <template #privateKey>
                  <strong class="text-foreground">{{ t('pages.integrations.walutomat.privateKeyLabel') }}</strong>
                </template>
                <template #filename>
                  <code class="bg-muted rounded px-1">private.key</code>
                </template>
              </i18n-t>
            </li>
          </ul>
        </InstructionStep>
      </div>

      <div class="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        <div class="flex gap-2">
          <InfoIcon class="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p class="mb-1 font-semibold text-blue-900 dark:text-blue-100">
              {{ t('pages.integrations.walutomat.instructions.securityNoteTitle') }}
            </p>
            <p class="text-xs text-blue-800 dark:text-blue-200">
              {{ t('pages.integrations.walutomat.instructions.securityNoteText') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <UiButton @click="close">
        {{ t('pages.integrations.walutomat.instructions.closeButton') }}
      </UiButton>
    </template>
  </SharedInstructionsDialog>
</template>

<script lang="ts" setup>
import ClickToCopy from '@/components/common/click-to-copy.vue';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { InfoIcon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

import InstructionStep from '../shared/instruction-step.vue';
import SharedInstructionsDialog from '../shared/instructions-dialog.vue';

const { t } = useI18n();

defineProps<{
  open: boolean;
}>();

defineEmits<{
  'update:open': [value: boolean];
}>();
</script>
