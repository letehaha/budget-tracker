<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
      <DialogHeader class="mb-4">
        <DialogTitle>{{ t('pages.integrations.walutomat.instructions.title') }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ t('pages.integrations.walutomat.instructions.description') }}
        </DialogDescription>
      </DialogHeader>

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
          <!-- Step 1: Generate RSA Keys -->
          <Collapsible v-slot="{ open: isOpen }" :default-open="true" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                1
              </div>
              <span class="flex-1 font-semibold">
                {{ t('pages.integrations.walutomat.instructions.step1Title') }}
              </span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground space-y-2 border-t px-3 py-3 pl-12">
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
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Step 2: Upload Public Key -->
          <Collapsible v-slot="{ open: isOpen }" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                2
              </div>
              <span class="flex-1 font-semibold">
                {{ t('pages.integrations.walutomat.instructions.step2Title') }}
              </span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground space-y-2 border-t px-3 py-3 pl-12">
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
              </div>
            </CollapsibleContent>
          </Collapsible>

          <!-- Step 3: Enter Credentials -->
          <Collapsible v-slot="{ open: isOpen }" class="rounded-lg border">
            <CollapsibleTrigger
              class="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors"
            >
              <div
                class="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                3
              </div>
              <span class="flex-1 font-semibold">
                {{ t('pages.integrations.walutomat.instructions.step3Title') }}
              </span>
              <ChevronDownIcon
                class="size-5 shrink-0 transition-transform duration-200"
                :class="{ 'rotate-180': isOpen }"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="text-muted-foreground space-y-2 border-t px-3 py-3 pl-12">
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
              </div>
            </CollapsibleContent>
          </Collapsible>
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

      <DialogFooter class="mt-6">
        <UiButton @click="$emit('update:open', false)">
          {{ t('pages.integrations.walutomat.instructions.closeButton') }}
        </UiButton>
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
import { ChevronDownIcon, InfoIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  open: boolean;
}>();

defineEmits<{
  'update:open': [value: boolean];
}>();
</script>
