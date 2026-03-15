<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
      <DialogHeader class="mb-4">
        <DialogTitle>{{ t('pages.integrations.instructionsDialog.title') }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ t('pages.integrations.instructionsDialog.description') }}
        </DialogDescription>
      </DialogHeader>

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
          <!-- Step 1: Register & Create Application -->
          <Collapsible v-slot="{ open: isOpen }" :default-open="true" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                1
              </div>
              <span class="flex-1 font-semibold">{{ t('pages.integrations.instructionsDialog.step1.title') }}</span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground space-y-2 border-t px-3 py-3 pl-12">
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
                        <ClickToCopy
                          class="w-auto max-w-68.75 min-w-auto sm:max-w-125"
                          value="https://moneymatter.app/bank-callback https://moneymatter.app/bank-callback"
                        />
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
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Step 2: Link Your Bank Accounts -->
          <Collapsible v-slot="{ open: isOpen }" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                2
              </div>
              <span class="flex-1 font-semibold">{{ t('pages.integrations.instructionsDialog.step2.title') }}</span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground flex flex-col gap-1 border-t px-3 py-3 pl-12">
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
                      <span class="text-white">{{
                        t('pages.integrations.instructionsDialog.step2.steps.aspspValue')
                      }}</span>
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

                <div
                  class="mb-3 rounded border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400"
                >
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
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Step 3: Get Your Credentials -->
          <Collapsible v-slot="{ open: isOpen }" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                3
              </div>
              <span class="flex-1 font-semibold">{{ t('pages.integrations.instructionsDialog.step3.title') }}</span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground border-t px-3 py-3 pl-12">
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
              </div>
            </CollapsibleContent>
          </Collapsible>
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

      <DialogFooter class="mt-6">
        <UiButton @click="$emit('update:open', false)">{{
          t('pages.integrations.instructionsDialog.gotItButton')
        }}</UiButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import ClickToCopy from '@/components/common/click-to-copy.vue';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { ChevronDownIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  open: boolean;
}>();

defineEmits<{
  'update:open': [value: boolean];
}>();
</script>
