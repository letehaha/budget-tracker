<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="max-w-xl">
    <template #title>{{ $t('settings.ai.customEndpoint.setupHelp.trigger') }}</template>

    <div class="flex flex-col gap-4 text-sm">
      <div class="bg-muted/50 flex flex-col gap-1 rounded-md p-3">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.rule" tag="p" class="font-medium">
          <template #path>
            <SetupHelpCode>/chat/completions</SetupHelpCode>
          </template>
          <template #suffix>
            <SetupHelpCode>/v1</SetupHelpCode>
          </template>
        </i18n-t>

        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.ruleCheck" tag="p" class="text-muted-foreground">
          <template #url>
            <SetupHelpCode>&lt;your-base-url&gt;/models</SetupHelpCode>
          </template>
        </i18n-t>
      </div>

      <!-- Only a self-hosted backend can reach the user's own machine, so the Docker
      hostname tip belongs there and the reachability warning does not. -->
      <Callout v-if="config.isSelfHost" variant="info">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.dockerHost" tag="p">
          <template #dockerHost>
            <SetupHelpCode>host.docker.internal</SetupHelpCode>
          </template>
          <template #ip>
            <SetupHelpCode>127.0.0.1</SetupHelpCode>
          </template>
        </i18n-t>
      </Callout>

      <Callout v-else variant="warning">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.localNetworkOnly" tag="p">
          <template #ip>
            <SetupHelpCode>127.0.0.1</SetupHelpCode>
          </template>
          <template #hostname>
            <SetupHelpCode>localhost</SetupHelpCode>
          </template>
        </i18n-t>
      </Callout>

      <PillTabs
        :items="providerTabs"
        :model-value="activeProvider"
        @update:model-value="activeProvider = $event as ProviderTab"
      />

      <section v-if="activeProvider === 'lmStudio'" class="flex flex-col gap-1.5">
        <p class="text-muted-foreground">{{ $t('settings.ai.customEndpoint.setupHelp.lmStudio.startServer') }}</p>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.baseUrlLabel')">
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.lmStudio.baseUrl" tag="span">
            <template #suffix>
              <SetupHelpCode>/v1</SetupHelpCode>
            </template>
            <template #example>
              <SetupHelpCode>http://127.0.0.1:1234/v1</SetupHelpCode>
            </template>
          </i18n-t>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.modelLabel')">
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.lmStudio.model" tag="span">
            <template #url>
              <SetupHelpCode>http://127.0.0.1:1234/v1/models</SetupHelpCode>
            </template>
          </i18n-t>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.apiKeyLabel')">
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.apiKeyEmpty') }}</span>
        </SetupHelpRow>
      </section>

      <section v-else-if="activeProvider === 'ollama'" class="flex flex-col gap-1.5">
        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.baseUrlLabel')">
          <SetupHelpCode>http://127.0.0.1:11434/v1</SetupHelpCode>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.modelLabel')">
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.ollama.model" tag="span">
            <template #command>
              <SetupHelpCode>ollama list</SetupHelpCode>
            </template>
            <template #example>
              <SetupHelpCode>llama3.2:3b</SetupHelpCode>
            </template>
          </i18n-t>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.apiKeyLabel')">
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.apiKeyEmpty') }}</span>
        </SetupHelpRow>
      </section>

      <section v-else-if="activeProvider === 'openRouter'" class="flex flex-col gap-1.5">
        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.baseUrlLabel')">
          <SetupHelpCode>https://openrouter.ai/api/v1</SetupHelpCode>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.modelLabel')">
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.openRouter.model" tag="span">
            <template #example>
              <SetupHelpCode>anthropic/claude-sonnet-4.5</SetupHelpCode>
            </template>
          </i18n-t>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.apiKeyLabel')">
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.openRouter.apiKeyRequired') }}</span>
        </SetupHelpRow>
      </section>

      <section v-else class="flex flex-col gap-1.5">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.other.title" tag="h5" class="font-medium">
          <template #name>vLLM</template>
        </i18n-t>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.baseUrlLabel')">
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.other.baseUrl" tag="span">
            <template #suffix>
              <SetupHelpCode>/v1</SetupHelpCode>
            </template>
          </i18n-t>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.modelLabel')">
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.other.model" tag="span">
            <template #request>
              <SetupHelpCode>GET &lt;base-url&gt;/models</SetupHelpCode>
            </template>
            <template #field>
              <SetupHelpCode>id</SetupHelpCode>
            </template>
          </i18n-t>
        </SetupHelpRow>

        <SetupHelpRow :label="$t('settings.ai.customEndpoint.form.apiKeyLabel')">
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.other.apiKey') }}</span>
        </SetupHelpRow>
      </section>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { config } from '@/common/config';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Callout } from '@/components/lib/ui/callout';
import { PillTabs, type PillTabItem } from '@/components/lib/ui/pill-tabs';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import SetupHelpCode from './shared/setup-help-code.vue';
import SetupHelpRow from './shared/setup-help-row.vue';

const isOpen = defineModel<boolean>('open', { default: false });

const { t } = useI18n();

type ProviderTab = 'lmStudio' | 'ollama' | 'openRouter' | 'other';

const activeProvider = ref<ProviderTab>('lmStudio');

// Vendor names are brands and stay untranslated.
const providerTabs = computed<PillTabItem[]>(() => [
  { value: 'lmStudio', label: 'LM Studio' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openRouter', label: 'OpenRouter' },
  { value: 'other', label: t('settings.ai.customEndpoint.setupHelp.other.tabLabel') },
]);
</script>
