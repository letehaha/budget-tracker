<template>
  <SharedInstructionsDialog
    :open="open"
    :title="t('pages.integrations.instructionsDialog.title')"
    @update:open="$emit('update:open', $event)"
  >
    <div class="space-y-4 text-sm">
      <div>
        <h3 class="mb-2 text-base font-semibold">
          {{ t('pages.integrations.instructionsDialog.overview.title') }}
        </h3>
        <p class="text-muted-foreground">
          {{ t('pages.integrations.instructionsDialog.overview.text') }}
        </p>
      </div>

      <div class="space-y-2">
        <InstructionStep
          :step="1"
          :title="t('pages.integrations.instructionsDialog.step1.title')"
          content-class="space-y-2"
          default-open
        >
          <p>
            <i18n-t keypath="pages.integrations.instructionsDialog.step1.intro" tag="span">
              <template #link>
                <ExternalLink href="https://enablebanking.com" text="enablebanking.com" />
              </template>
            </i18n-t>
          </p>
          <p class="text-foreground pt-2 font-medium">
            {{ t('pages.integrations.instructionsDialog.step1.createApp') }}
          </p>
          <div class="space-y-1">
            <div>
              1.
              {{ t('pages.integrations.instructionsDialog.step1.steps.login') }}
            </div>
            <div>
              <i18n-t keypath="pages.integrations.instructionsDialog.step1.steps.navigate" tag="span">
                <template #link>
                  <ExternalLink href="https://enablebanking.com/cp/applications" />
                </template>
              </i18n-t>
            </div>
            <div>
              3.
              {{ t('pages.integrations.instructionsDialog.step1.steps.lookForm') }}
            </div>
            <div>
              <i18n-t keypath="pages.integrations.instructionsDialog.step1.steps.selectEnv" tag="span">
                <template #strong>
                  <strong>{{ t('pages.integrations.instructionsDialog.step1.steps.selectEnvStrong') }}</strong>
                </template>
              </i18n-t>
            </div>
            <div>
              <i18n-t keypath="pages.integrations.instructionsDialog.step1.steps.generateKey" tag="span">
                <template #strong>
                  <strong>{{ t('pages.integrations.instructionsDialog.step1.steps.generateKeyStrong') }}</strong>
                </template>
                <template #warning>
                  <strong>{{ t('pages.integrations.instructionsDialog.step1.steps.generateKeyWarning') }}</strong>
                </template>
              </i18n-t>
            </div>
            <div>
              6.
              {{ t('pages.integrations.instructionsDialog.step1.steps.fillForm') }}
              <div class="mt-2 flex flex-col gap-1 pl-4">
                <div class="flex flex-wrap gap-1">
                  <span class="font-semibold">{{
                    t('pages.integrations.instructionsDialog.step1.steps.appName')
                  }}</span>
                  <ClickToCopy class="w-auto max-w-68.75 min-w-auto sm:max-w-125" value="Own testing" />
                </div>
                <div class="flex flex-wrap gap-1">
                  <span class="font-semibold">{{
                    t('pages.integrations.instructionsDialog.step1.steps.redirectUrls')
                  }}</span>
                  <ClickToCopy class="w-auto max-w-68.75 min-w-auto sm:max-w-125" :value="callbackUrl" />
                </div>
                <div class="flex flex-wrap gap-1">
                  <span class="font-semibold">{{
                    t('pages.integrations.instructionsDialog.step1.steps.appDescription')
                  }}</span>
                  <ClickToCopy class="w-auto max-w-68.75 min-w-auto sm:max-w-125" value="testing" />
                </div>
                <div class="flex flex-wrap gap-1">
                  <span class="font-semibold">{{
                    t('pages.integrations.instructionsDialog.step1.steps.emailProtection')
                  }}</span>
                  <ClickToCopy class="w-auto max-w-68.75 min-w-auto sm:max-w-125" value="test@gmail.com" />
                </div>
                <div class="flex flex-wrap gap-1">
                  <span class="font-semibold">{{
                    t('pages.integrations.instructionsDialog.step1.steps.privacyUrl')
                  }}</span>
                  <ClickToCopy
                    class="w-auto max-w-68.75 min-w-auto sm:max-w-125"
                    value="https://moneymatter.app/privacy-policy"
                  />
                </div>
                <div class="flex flex-wrap gap-1">
                  <span class="font-semibold">{{
                    t('pages.integrations.instructionsDialog.step1.steps.termsUrl')
                  }}</span>
                  <ClickToCopy
                    class="w-auto max-w-68.75 min-w-auto sm:max-w-125"
                    value="https://moneymatter.app/terms-of-use"
                  />
                </div>
              </div>
            </div>
            <div>
              7.
              {{ t('pages.integrations.instructionsDialog.step1.steps.clickRegister') }}
            </div>
            <div>
              8.
              {{ t('pages.integrations.instructionsDialog.step1.steps.downloadKey') }}
            </div>
          </div>
        </InstructionStep>

        <InstructionStep
          :step="2"
          :title="t('pages.integrations.instructionsDialog.step2.title')"
          content-class="flex flex-col gap-1"
        >
          <p>
            {{ t('pages.integrations.instructionsDialog.step2.intro') }}
          </p>
          <p>
            {{ t('pages.integrations.instructionsDialog.step2.breakdown') }}
          </p>
          <p>
            1.
            {{ t('pages.integrations.instructionsDialog.step2.steps.clickLink') }}
          </p>
          <div>
            2.
            {{ t('pages.integrations.instructionsDialog.step2.steps.newFields') }}

            <ul class="mt-1 flex flex-col gap-1 pl-4">
              <li>
                2.1
                {{ t('pages.integrations.instructionsDialog.step2.steps.country') }}
                <span class="text-white">{{
                  t('pages.integrations.instructionsDialog.step2.steps.countryValue')
                }}</span>
              </li>
              <li>
                2.2
                {{ t('pages.integrations.instructionsDialog.step2.steps.aspsp') }}
                <span class="text-white">{{ t('pages.integrations.instructionsDialog.step2.steps.aspspValue') }}</span>
              </li>
              <li>
                2.3
                {{ t('pages.integrations.instructionsDialog.step2.steps.usageType') }}
                <span class="text-white">{{
                  t('pages.integrations.instructionsDialog.step2.steps.usageTypeValue')
                }}</span>
              </li>
              <li>
                2.4
                {{ t('pages.integrations.instructionsDialog.step2.steps.clickSave') }}
              </li>
            </ul>
          </div>
          <p>
            3.
            {{ t('pages.integrations.instructionsDialog.step2.steps.redirect') }}
          </p>
          <p>
            4.
            {{ t('pages.integrations.instructionsDialog.step2.steps.finishAuth') }}
          </p>
          <p>
            5.
            {{ t('pages.integrations.instructionsDialog.step2.steps.waitAccounts') }}
          </p>

          <div class="mb-3 rounded border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon class="inline size-5" />
            {{ t('pages.integrations.instructionsDialog.step2.warningNotLinked') }}
          </div>

          <div
            class="rounded border border-blue-200 bg-blue-50 p-3 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
          >
            <InfoIcon class="inline size-5" />
            <i18n-t keypath="pages.integrations.instructionsDialog.step2.infoAddMore" tag="span">
              <template #strong>
                <strong>{{ t('pages.integrations.instructionsDialog.step2.infoAddMoreStrong') }}</strong>
              </template>
            </i18n-t>
          </div>
        </InstructionStep>

        <InstructionStep :step="3" :title="t('pages.integrations.instructionsDialog.step3.title')">
          <p class="mb-2">
            {{ t('pages.integrations.instructionsDialog.step3.intro') }}
          </p>
          <ul class="list-inside list-disc space-y-1">
            <li>
              <i18n-t keypath="pages.integrations.instructionsDialog.step3.appId" tag="span">
                <template #strong>
                  <strong>{{ t('pages.integrations.instructionsDialog.step3.appIdStrong') }}</strong>
                </template>
                <template #code>
                  <code class="bg-muted rounded px-1">{{
                    t('pages.integrations.instructionsDialog.step3.appIdCode')
                  }}</code>
                </template>
              </i18n-t>
              <br />
              {{ t('pages.integrations.instructionsDialog.step3.appIdExample') }}
              <code class="bg-muted rounded px-1"> 0f711c28-1682-27b5-946c-e221168abf79 </code>
            </li>
            <li>
              <i18n-t keypath="pages.integrations.instructionsDialog.step3.privateKey" tag="span">
                <template #strong>
                  <strong>{{ t('pages.integrations.instructionsDialog.step3.privateKeyStrong') }}</strong>
                </template>
                <template #code>
                  <code class="bg-muted rounded px-1">{{
                    t('pages.integrations.instructionsDialog.step3.privateKeyCode')
                  }}</code>
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
              {{ t('pages.integrations.instructionsDialog.securityNote.title') }}
            </p>
            <p class="text-xs text-blue-800 dark:text-blue-200">
              {{ t('pages.integrations.instructionsDialog.securityNote.text') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <UiButton @click="close">{{ t('pages.integrations.instructionsDialog.gotItButton') }}</UiButton>
    </template>
  </SharedInstructionsDialog>
</template>

<script lang="ts" setup>
import ClickToCopy from '@/components/common/click-to-copy.vue';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { InfoIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';
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

const callbackUrl = computed(() => `${window.location.origin}/bank-callback`);
</script>
