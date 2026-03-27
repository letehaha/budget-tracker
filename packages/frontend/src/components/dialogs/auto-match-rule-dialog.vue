<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>
      {{ isEdit ? $t('settings.tags.editRule') : $t('settings.tags.addRule') }}
    </template>

    <div class="space-y-4 p-1">
      <!-- Type selector (only for create) -->
      <div v-if="!isEdit">
        <p class="text-sm font-medium">{{ $t('settings.tags.ruleType') }}</p>
        <div class="mt-2 flex gap-2">
          <Button
            :variant="form.type === TAG_RULE_TYPE.code ? 'default' : 'outline'"
            size="sm"
            :disabled="false"
            @click="form.type = TAG_RULE_TYPE.code"
          >
            {{ $t('settings.tags.ruleTypeCode') }}
          </Button>
          <Button
            :variant="form.type === TAG_RULE_TYPE.ai ? 'default' : 'outline'"
            size="sm"
            :disabled="aiLimitReached"
            @click="form.type = TAG_RULE_TYPE.ai"
          >
            {{ $t('settings.tags.ruleTypeAi') }}
          </Button>
        </div>
        <p v-if="aiLimitReached && !isEdit" class="text-muted-foreground mt-1 text-xs">
          {{ $t('settings.tags.aiRuleLimitReached') }}
        </p>
      </div>

      <!-- Code pattern field -->
      <InputField
        v-if="form.type === 'code'"
        v-model="form.codePattern"
        :label="$t('settings.tags.codePattern')"
        :placeholder="$t('settings.tags.codePatternPlaceholder')"
      />

      <!-- AI prompt field -->
      <TextareaField
        v-if="form.type === 'ai'"
        v-model="form.aiPrompt"
        :label="$t('settings.tags.aiPrompt')"
        :placeholder="$t('settings.tags.aiPromptPlaceholder')"
        :rows="3"
      />

      <!-- Approval mode -->
      <div>
        <p class="text-sm font-medium">{{ $t('settings.tags.approvalMode') }}</p>
        <div class="mt-2 flex gap-2">
          <Button
            :variant="form.approvalMode === TAG_RULE_APPROVAL_MODE.auto ? 'default' : 'outline'"
            size="sm"
            @click="form.approvalMode = TAG_RULE_APPROVAL_MODE.auto"
          >
            {{ $t('settings.tags.modeAuto') }}
          </Button>
          <Button
            :variant="form.approvalMode === TAG_RULE_APPROVAL_MODE.manual ? 'default' : 'outline'"
            size="sm"
            @click="form.approvalMode = TAG_RULE_APPROVAL_MODE.manual"
          >
            {{ $t('settings.tags.modeManual') }}
          </Button>
        </div>
        <p class="text-muted-foreground mt-1 text-xs">
          {{
            form.approvalMode === TAG_RULE_APPROVAL_MODE.auto
              ? $t('settings.tags.modeAutoDescription')
              : $t('settings.tags.modeManualDescription')
          }}
        </p>
      </div>
    </div>

    <template #footer>
      <Button
        :disabled="!isValid || saveMutation.isPending.value"
        :loading="saveMutation.isPending.value"
        @click="handleSave"
      >
        {{ isEdit ? $t('common.actions.save') : $t('common.actions.create') }}
      </Button>
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { createAutoMatchRule, updateAutoMatchRule } from '@/api/tags';
import { TAG_RULE_APPROVAL_MODE, TAG_RULE_TYPE, TagAutoMatchRuleModel } from '@bt/shared/types';
import { useMutation } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';

const props = defineProps<{
  tagId: number;
  rule?: TagAutoMatchRuleModel;
  existingRules: TagAutoMatchRuleModel[];
}>();

const emit = defineEmits<{
  saved: [];
}>();

const { addSuccessNotification } = useNotificationCenter();
const isOpen = defineModel<boolean>('open', { required: true });
const isEdit = computed(() => !!props.rule);

const aiLimitReached = computed(() => {
  return props.existingRules.some((r) => r.type === TAG_RULE_TYPE.ai);
});

const initialType = props.rule?.type ?? TAG_RULE_TYPE.code;
const form = reactive({
  type: initialType,
  codePattern: (props.rule?.type === TAG_RULE_TYPE.code ? props.rule.codePattern : '') ?? '',
  aiPrompt: (props.rule?.type === TAG_RULE_TYPE.ai ? props.rule.aiPrompt : '') ?? '',
  approvalMode:
    props.rule?.approvalMode ??
    (initialType === TAG_RULE_TYPE.ai ? TAG_RULE_APPROVAL_MODE.manual : TAG_RULE_APPROVAL_MODE.auto),
});

const isValid = computed(() => {
  if (form.type === TAG_RULE_TYPE.code) {
    return form.codePattern.trim().length > 0;
  }
  return form.aiPrompt.trim().length > 0;
});

const saveMutation = useMutation({
  mutationFn: async () => {
    if (isEdit.value && props.rule) {
      return updateAutoMatchRule({
        tagId: props.tagId,
        id: props.rule.id,
        payload: {
          approvalMode: form.approvalMode,
          ...(form.type === TAG_RULE_TYPE.code
            ? { codePattern: form.codePattern.trim() }
            : { aiPrompt: form.aiPrompt.trim() }),
        },
      });
    }

    const payload =
      form.type === TAG_RULE_TYPE.code
        ? { type: TAG_RULE_TYPE.code as const, approvalMode: form.approvalMode, codePattern: form.codePattern.trim() }
        : { type: TAG_RULE_TYPE.ai as const, approvalMode: form.approvalMode, aiPrompt: form.aiPrompt.trim() };

    return createAutoMatchRule({ tagId: props.tagId, payload });
  },
  onSuccess: () => {
    addSuccessNotification(isEdit.value ? 'Rule updated' : 'Rule created');
    emit('saved');
  },
});

const handleSave = () => {
  if (!isValid.value) return;
  saveMutation.mutate();
};
</script>
