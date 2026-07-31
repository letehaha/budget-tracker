<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="max-w-xl">
    <template #title>{{ $t('settings.ai.customEndpoint.setupHelp.trigger') }}</template>

    <div class="flex flex-col gap-4 text-sm">
      <div class="bg-muted/50 flex flex-col gap-1 rounded-md p-3">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.rule" tag="p" class="font-medium">
          <template #path>
            <code :class="CODE_CLASS">/chat/completions</code>
          </template>
          <template #suffix>
            <code :class="CODE_CLASS">/v1</code>
          </template>
        </i18n-t>

        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.ruleCheck" tag="p" class="text-muted-foreground">
          <template #url>
            <code :class="CODE_CLASS">&lt;your-base-url&gt;/models</code>
          </template>
        </i18n-t>
      </div>

      <!-- A self-hosted backend can reach the user's machine, so the reachability warning
      is wrong there and the Docker hostname tip applies only there. -->
      <Callout v-if="config.isSelfHost" variant="info">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.dockerHost" tag="p">
          <template #dockerHost>
            <code :class="CODE_CLASS">host.docker.internal</code>
          </template>
          <template #ip>
            <code :class="CODE_CLASS">127.0.0.1</code>
          </template>
        </i18n-t>
      </Callout>

      <Callout v-else variant="warning">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.localNetworkOnly" tag="p">
          <template #ip>
            <code :class="CODE_CLASS">127.0.0.1</code>
          </template>
          <template #hostname>
            <code :class="CODE_CLASS">localhost</code>
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

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.baseUrlLabel') }}</span>
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.lmStudio.baseUrl" tag="span">
            <template #suffix>
              <code :class="CODE_CLASS">/v1</code>
            </template>
            <template #example>
              <code :class="CODE_CLASS">http://127.0.0.1:1234/v1</code>
            </template>
          </i18n-t>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.modelLabel') }}</span>
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.lmStudio.model" tag="span">
            <template #url>
              <code :class="CODE_CLASS">http://127.0.0.1:1234/v1/models</code>
            </template>
          </i18n-t>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.apiKeyLabel') }}</span>
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.apiKeyEmpty') }}</span>
        </div>
      </section>

      <section v-else-if="activeProvider === 'ollama'" class="flex flex-col gap-1.5">
        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.baseUrlLabel') }}</span>
          <code :class="CODE_CLASS">http://127.0.0.1:11434/v1</code>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.modelLabel') }}</span>
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.ollama.model" tag="span">
            <template #command>
              <code :class="CODE_CLASS">ollama list</code>
            </template>
            <template #example>
              <code :class="CODE_CLASS">llama3.2:3b</code>
            </template>
          </i18n-t>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.apiKeyLabel') }}</span>
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.apiKeyEmpty') }}</span>
        </div>
      </section>

      <section v-else-if="activeProvider === 'openRouter'" class="flex flex-col gap-1.5">
        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.baseUrlLabel') }}</span>
          <code :class="CODE_CLASS">https://openrouter.ai/api/v1</code>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.modelLabel') }}</span>
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.openRouter.model" tag="span">
            <template #example>
              <code :class="CODE_CLASS">anthropic/claude-sonnet-4.5</code>
            </template>
          </i18n-t>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.apiKeyLabel') }}</span>
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.openRouter.apiKeyRequired') }}</span>
        </div>
      </section>

      <section v-else class="flex flex-col gap-1.5">
        <i18n-t keypath="settings.ai.customEndpoint.setupHelp.other.title" tag="h5" class="font-medium">
          <template #name>vLLM</template>
        </i18n-t>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.baseUrlLabel') }}</span>
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.other.baseUrl" tag="span">
            <template #suffix>
              <code :class="CODE_CLASS">/v1</code>
            </template>
          </i18n-t>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.modelLabel') }}</span>
          <i18n-t keypath="settings.ai.customEndpoint.setupHelp.other.model" tag="span">
            <template #request>
              <code :class="CODE_CLASS">GET &lt;base-url&gt;/models</code>
            </template>
            <template #field>
              <code :class="CODE_CLASS">id</code>
            </template>
          </i18n-t>
        </div>

        <div :class="ROW_CLASS">
          <span :class="LABEL_CLASS">{{ $t('settings.ai.customEndpoint.form.apiKeyLabel') }}</span>
          <span>{{ $t('settings.ai.customEndpoint.setupHelp.other.apiKey') }}</span>
        </div>
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

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

type ProviderTab = 'lmStudio' | 'ollama' | 'openRouter' | 'other';

const activeProvider = ref<ProviderTab>('lmStudio');

// Vendor names are brands and stay untranslated; only the catch-all tab gets a localized label.
const providerTabs = computed<PillTabItem[]>(() => [
  { value: 'lmStudio', label: 'LM Studio' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openRouter', label: 'OpenRouter' },
  { value: 'other', label: t('settings.ai.customEndpoint.setupHelp.other.tabLabel') },
]);

// `break-all` keeps long URLs inside the card instead of widening it on narrow containers.
const CODE_CLASS = 'bg-muted rounded px-1 py-0.5 font-mono text-xs break-all';
const ROW_CLASS = 'flex flex-wrap items-baseline gap-x-2 gap-y-1';
const LABEL_CLASS = 'text-muted-foreground shrink-0';
</script>
