<script setup lang="ts">
import { getErrorMessage } from '@/common/utils/error-message';
import { formatFractionAsPercent } from '@/common/utils/percentage';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import VenturePlatformForm from '@/components/forms/venture-platform-form.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import DesktopOnlyTooltip from '@/components/lib/ui/tooltip/desktop-only-tooltip.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useDeleteVenturePlatform, useVenturePlatforms } from '@/composable/data-queries/venture/platforms';
import { ROUTES_NAMES } from '@/routes';
import type { VenturePlatformModel } from '@bt/shared/types';
import { ArrowLeftIcon, PencilIcon, PlusIcon, RocketIcon, Trash2Icon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { addNotification } = useNotificationCenter();

const { data, isPending } = useVenturePlatforms();
const platforms = computed<VenturePlatformModel[]>(() => data.value?.data ?? []);

const createDialogOpen = ref(false);
const editingPlatform = ref<VenturePlatformModel | null>(null);
const deletingPlatform = ref<VenturePlatformModel | null>(null);

const deleteMutation = useDeleteVenturePlatform();

const onCreated = () => {
  createDialogOpen.value = false;
};

const onUpdated = () => {
  editingPlatform.value = null;
};

const confirmDelete = async () => {
  if (!deletingPlatform.value) return;
  try {
    await deleteMutation.mutateAsync(deletingPlatform.value.id);
    addNotification({
      text: t('venture.platforms.notifications.deleted'),
      type: NotificationType.success,
    });
    deletingPlatform.value = null;
  } catch (err) {
    addNotification({
      text: getErrorMessage(err, t('venture.platforms.notifications.error')),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <div class="@container/venture-platforms mx-auto w-full p-4 md:p-6">
    <div class="mb-6">
      <router-link
        :to="{ name: ROUTES_NAMES.venture }"
        class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeftIcon class="size-4" />
        <span>{{ $t('venture.deals.backToDeals') }}</span>
      </router-link>
    </div>

    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl leading-tight font-semibold @md/venture-platforms:text-4xl">
          {{ $t('venture.platforms.title') }}
        </h1>
        <p class="text-muted-foreground mt-2 max-w-md text-sm">{{ $t('venture.platforms.subtitle') }}</p>
      </div>
      <UiButton @click="createDialogOpen = true">
        <PlusIcon class="size-4" />
        <span>{{ $t('venture.platforms.createButton') }}</span>
      </UiButton>
    </div>

    <div v-if="isPending" class="grid gap-4 @md/venture-platforms:grid-cols-2">
      <div v-for="i in 3" :key="i" class="bg-muted h-36 w-full animate-pulse rounded-xl" />
    </div>

    <div
      v-else-if="platforms.length === 0"
      class="bg-card border-border flex flex-col items-center gap-3 rounded-xl border py-12 text-center"
    >
      <RocketIcon class="text-muted-foreground size-10" />
      <h3 class="text-lg font-medium">{{ $t('venture.platforms.emptyTitle') }}</h3>
      <p class="text-muted-foreground max-w-md text-sm">{{ $t('venture.platforms.emptyDescription') }}</p>
      <UiButton @click="createDialogOpen = true">
        <PlusIcon class="size-4" />
        <span>{{ $t('venture.platforms.createButton') }}</span>
      </UiButton>
    </div>

    <div v-else class="grid gap-4 @md/venture-platforms:grid-cols-2">
      <div
        v-for="platform in platforms"
        :key="platform.id"
        class="bg-card border-border rounded-xl border p-5 transition-colors"
      >
        <div class="flex flex-col gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="truncate text-lg leading-tight font-semibold tracking-tight">{{ platform.name }}</h3>
              <a
                v-if="platform.website"
                :href="platform.website"
                target="_blank"
                rel="noopener"
                class="text-muted-foreground hover:text-foreground mt-1 inline-block truncate text-xs underline-offset-2 hover:underline"
              >
                {{ platform.website }}
              </a>
            </div>
            <div class="flex shrink-0 gap-1">
              <DesktopOnlyTooltip :content="$t('venture.platforms.editTooltip')">
                <UiButton
                  size="icon-sm"
                  variant="ghost"
                  :aria-label="$t('venture.platforms.editTooltip')"
                  @click="editingPlatform = platform"
                >
                  <PencilIcon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('venture.platforms.deleteTooltip')">
                <UiButton
                  size="icon-sm"
                  variant="ghost-destructive"
                  :aria-label="$t('venture.platforms.deleteTooltip')"
                  @click="deletingPlatform = platform"
                >
                  <Trash2Icon class="size-4" />
                </UiButton>
              </DesktopOnlyTooltip>
            </div>
          </div>

          <p v-if="platform.description" class="text-muted-foreground text-sm">{{ platform.description }}</p>

          <div class="border-border/60 grid grid-cols-2 gap-3 border-t pt-3 @sm/venture-platforms:grid-cols-4">
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.platforms.entryFee') }}
              </div>
              <div class="mt-0.5 text-base font-semibold tabular-nums">
                {{ formatFractionAsPercent(platform.defaultEntryFeePct) }}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.platforms.mgmtFee') }}
              </div>
              <div class="mt-0.5 text-base font-semibold tabular-nums">
                {{ formatFractionAsPercent(platform.defaultMgmtFeePct) }}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.platforms.carry') }}
              </div>
              <div class="mt-0.5 text-base font-semibold tabular-nums">
                {{ formatFractionAsPercent(platform.defaultCarryPct) }}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground text-[10px] tracking-wide uppercase">
                {{ $t('venture.platforms.hurdle') }}
              </div>
              <div class="mt-0.5 text-base font-semibold tabular-nums">
                {{ formatFractionAsPercent(platform.defaultHurdlePct) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ResponsiveDialog v-model:open="createDialogOpen" :hide-drawer-footer="true">
      <template #title>{{ $t('venture.platforms.createDialogTitle') }}</template>
      <template #description>{{ $t('venture.platforms.createDialogDescription') }}</template>
      <VenturePlatformForm @saved="onCreated" @cancel="createDialogOpen = false" />
    </ResponsiveDialog>

    <ResponsiveDialog
      :open="!!editingPlatform"
      :hide-drawer-footer="true"
      @update:open="(v) => !v && (editingPlatform = null)"
    >
      <template #title>{{ $t('venture.platforms.editDialogTitle') }}</template>
      <template #description>{{ $t('venture.platforms.editDialogDescription') }}</template>
      <VenturePlatformForm :platform="editingPlatform" @saved="onUpdated" @cancel="editingPlatform = null" />
    </ResponsiveDialog>

    <ResponsiveAlertDialog
      :open="!!deletingPlatform"
      :confirm-label="$t('venture.platforms.deleteConfirm')"
      confirm-variant="destructive"
      @update:open="(v) => !v && (deletingPlatform = null)"
      @confirm="confirmDelete"
    >
      <template #title>{{ $t('venture.platforms.deleteTitle') }}</template>
      <template #description>
        {{ $t('venture.platforms.deleteDescription', { name: deletingPlatform?.name ?? '' }) }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
