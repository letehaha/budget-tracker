<template>
  <div class="max-w-150">
    <Button variant="ghost" size="sm" class="mb-4 gap-1.5" @click="goBack">
      <ArrowLeftIcon class="size-4" />
      {{ $t('common.actions.back') }}
    </Button>

    <template v-if="tag">
      <!-- Tag header -->
      <Card class="mb-4 px-4 py-4">
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-full"
            :style="{ backgroundColor: tag.color }"
          >
            <TagIcon v-if="tag.icon" :name="tag.icon" class="size-5 text-white" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold">{{ tag.name }}</h2>
            <p v-if="tag.description" class="text-muted-foreground text-sm">
              {{ tag.description }}
            </p>
          </div>
          <Button variant="outline" size="sm" @click="openEditDialog">
            <PencilIcon class="size-4" />
            {{ $t('common.actions.edit') }}
          </Button>
        </div>
      </Card>

      <!-- Tabs -->
      <Tabs default-value="auto-match" class="w-full">
        <TabsList class="w-full">
          <TabsTrigger value="reminders" class="flex-1">
            {{ $t('settings.tags.reminders') }}
            <span v-if="remindersCount > 0" class="text-muted-foreground ml-1 text-xs">({{ remindersCount }})</span>
          </TabsTrigger>
          <TabsTrigger value="auto-match" class="flex-1">
            {{ $t('settings.tags.autoMatch') }}
            <span v-if="rulesCount > 0" class="text-muted-foreground ml-1 text-xs">({{ rulesCount }})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reminders">
          <Card class="px-4 py-4">
            <p class="text-muted-foreground py-8 text-center text-sm">
              {{ $t('settings.tags.remindersTabPlaceholder') }}
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="auto-match">
          <Card class="px-4 py-4">
            <div class="mb-4 flex items-center justify-between">
              <p class="text-muted-foreground text-sm">
                {{ $t('settings.tags.autoMatchDescription') }}
              </p>
              <Button variant="outline" size="sm" class="shrink-0 gap-1.5" @click="openRuleDialog()">
                <PlusIcon class="size-4" />
                {{ $t('settings.tags.addRule') }}
              </Button>
            </div>

            <!-- Rules list -->
            <div v-if="isLoadingRules" class="space-y-2">
              <div v-for="i in 2" :key="i" class="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex items-center gap-2">
                    <div class="bg-muted h-5 w-12 animate-pulse rounded-full" />
                    <div class="bg-muted h-3.5 w-14 animate-pulse rounded" />
                  </div>
                  <div class="bg-muted h-4 w-40 animate-pulse rounded" />
                </div>
              </div>
            </div>
            <div v-else-if="rules.length === 0" class="text-muted-foreground py-8 text-center text-sm">
              {{ $t('settings.tags.noRules') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="rule in rules"
                :key="rule.id"
                class="bg-muted/50 flex items-center gap-3 rounded-lg p-3"
                :class="{ 'opacity-50': !rule.isEnabled }"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      :class="rule.type === 'code' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning-text'"
                    >
                      {{ rule.type === 'code' ? $t('settings.tags.ruleTypeCode') : $t('settings.tags.ruleTypeAi') }}
                    </span>
                    <span class="text-muted-foreground text-xs">
                      {{ rule.approvalMode === 'auto' ? $t('settings.tags.modeAuto') : $t('settings.tags.modeManual') }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-sm">
                    {{ rule.type === 'code' ? rule.codePattern : rule.aiPrompt }}
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-1">
                  <DesktopOnlyTooltip
                    :content="rule.isEnabled ? $t('common.actions.disable') : $t('common.actions.enable')"
                  >
                    <Button variant="ghost" size="icon-sm" @click="handleToggleRule(rule)">
                      <PowerIcon class="size-4" />
                    </Button>
                  </DesktopOnlyTooltip>
                  <DesktopOnlyTooltip :content="$t('common.actions.edit')">
                    <Button variant="ghost" size="icon-sm" @click="openRuleDialog(rule)">
                      <PencilIcon class="size-4" />
                    </Button>
                  </DesktopOnlyTooltip>
                  <DesktopOnlyTooltip :content="$t('common.actions.delete')">
                    <Button variant="ghost-destructive" size="icon-sm" @click="confirmDeleteRule(rule)">
                      <Trash2Icon class="size-4" />
                    </Button>
                  </DesktopOnlyTooltip>
                </div>
              </div>
            </div>

            <!-- Rule counts -->
            <div v-if="rules.length > 0" class="text-muted-foreground mt-3 text-xs">
              {{ codeRulesCount }}/5 {{ $t('settings.tags.ruleTypeCode') }} &middot; {{ aiRulesCount }}/1
              {{ $t('settings.tags.ruleTypeAi') }}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </template>

    <template v-else>
      <Card class="mb-4 px-4 py-4">
        <div class="flex items-center gap-3">
          <div class="bg-muted size-10 animate-pulse rounded-full" />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="bg-muted h-5 w-32 animate-pulse rounded" />
            <div class="bg-muted h-4 w-48 animate-pulse rounded" />
          </div>
        </div>
      </Card>
    </template>

    <!-- Edit tag dialog (reuses existing) -->
    <TagFormDialog
      v-model:open="editDialogOpen"
      :key="editDialogKey"
      :tag="tag"
      @saved="handleTagSaved"
      @deleted="handleTagDeleted"
    />

    <!-- Rule form dialog -->
    <AutoMatchRuleDialog
      v-model:open="ruleDialogOpen"
      :key="ruleDialogKey"
      :tag-id="tagId!"
      :rule="editingRule"
      :existing-rules="rules"
      @saved="handleRuleSaved"
    />

    <!-- Delete rule confirmation -->
    <ResponsiveAlertDialog
      v-model:open="deleteRuleDialogOpen"
      confirm-variant="destructive"
      @confirm="handleDeleteRule"
    >
      <template #title>{{ $t('settings.tags.deleteRuleTitle') }}</template>
      <template #description>{{ $t('settings.tags.deleteRuleDescription') }}</template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import AutoMatchRuleDialog from '@/components/dialogs/auto-match-rule-dialog.vue';
import TagIcon from '@/components/common/icons/tag-icon.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import TagFormDialog from '@/components/dialogs/tag-form-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { ROUTES_NAMES } from '@/routes/constants';
import { useTagsStore } from '@/stores';
import { loadAutoMatchRules, toggleAutoMatchRule, deleteAutoMatchRule } from '@/api/tags';
import { TagAutoMatchRuleModel } from '@bt/shared/types';
import { useQuery, useQueryClient, useMutation } from '@tanstack/vue-query';
import { ArrowLeftIcon, PencilIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-vue-next';
import { useRouter, useRoute } from 'vue-router';
import { computed, ref } from 'vue';
import { useNotificationCenter } from '@/components/notification-center';

defineOptions({
  name: 'settings-tag-details',
});

const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();
const tagsStore = useTagsStore();
const { addSuccessNotification } = useNotificationCenter();

const tagId = computed(() => {
  const id = Number(route.params.id);
  return Number.isFinite(id) ? id : null;
});
const tag = computed(() => (tagId.value !== null ? tagsStore.getTagById(tagId.value) : undefined));
const remindersCount = computed(() => tag.value?.remindersCount ?? 0);

// Load tag if not in store, redirect on error
if (!tag.value) {
  tagsStore.loadTags().catch(() => {
    router.push({ name: ROUTES_NAMES.settingsTags });
  });
}

// Redirect if tagId is invalid
if (tagId.value === null) {
  router.push({ name: ROUTES_NAMES.settingsTags });
}

// Auto-match rules
const { data: rulesData, isLoading: isLoadingRules } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.tagAutoMatchRules, tagId] as const,
  queryFn: () => loadAutoMatchRules({ tagId: tagId.value! }),
  enabled: computed(() => tagId.value !== null),
});
const rules = computed(() => rulesData.value ?? []);

const rulesCount = computed(() => rules.value.length);
const codeRulesCount = computed(() => rules.value.filter((r) => r.type === 'code').length);
const aiRulesCount = computed(() => rules.value.filter((r) => r.type === 'ai').length);

// Edit tag dialog
const editDialogOpen = ref(false);
const editDialogKey = ref(0);
const openEditDialog = () => {
  editDialogKey.value++;
  editDialogOpen.value = true;
};

// Rule dialog
const ruleDialogOpen = ref(false);
const ruleDialogKey = ref(0);
const editingRule = ref<TagAutoMatchRuleModel | undefined>();
const openRuleDialog = (rule?: TagAutoMatchRuleModel) => {
  editingRule.value = rule;
  ruleDialogKey.value++;
  ruleDialogOpen.value = true;
};

// Toggle rule
const toggleMutation = useMutation({
  mutationFn: toggleAutoMatchRule,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.tagAutoMatchRules });
  },
});

const handleToggleRule = (rule: TagAutoMatchRuleModel) => {
  if (tagId.value === null) return;
  toggleMutation.mutate({ tagId: tagId.value, id: rule.id });
};

// Delete rule
const deleteRuleDialogOpen = ref(false);
const deletingRule = ref<TagAutoMatchRuleModel | undefined>();

const confirmDeleteRule = (rule: TagAutoMatchRuleModel) => {
  deletingRule.value = rule;
  deleteRuleDialogOpen.value = true;
};

const deleteMutation = useMutation({
  mutationFn: deleteAutoMatchRule,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.tagAutoMatchRules });
    addSuccessNotification('Rule deleted');
  },
});

const handleDeleteRule = () => {
  if (!deletingRule.value || tagId.value === null) return;
  deleteMutation.mutate({ tagId: tagId.value, id: deletingRule.value.id });
};

const handleRuleSaved = () => {
  ruleDialogOpen.value = false;
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.tagAutoMatchRules });
  addSuccessNotification('Rule saved');
};

const handleTagSaved = () => {
  editDialogOpen.value = false;
};

const handleTagDeleted = () => {
  editDialogOpen.value = false;
  router.push({ name: ROUTES_NAMES.settingsTags });
};

const goBack = () => {
  router.push({ name: ROUTES_NAMES.settingsTags });
};
</script>
