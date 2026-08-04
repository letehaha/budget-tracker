<template>
  <div class="@container/ai-endpoints space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-medium">{{ $t('settings.ai.customEndpoint.title') }}</h3>
        <p class="text-muted-foreground text-sm">{{ $t('settings.ai.customEndpoint.description') }}</p>
      </div>

      <Button v-if="hasEndpoints" @click="openAddDialog">
        <PlusIcon class="size-4" />
        {{ $t('settings.ai.customEndpoint.addButton') }}
      </Button>
    </div>

    <div v-if="isLoadingCustomEndpoints" class="text-muted-foreground flex items-center gap-2 py-4 text-sm">
      <Loader2Icon class="size-4 animate-spin" />
      {{ $t('settings.ai.customEndpoint.loading') }}
    </div>

    <!-- Ahead of the empty state: a failed fetch would otherwise say "no endpoints yet"
    and invite re-adding ones that are still saved. -->
    <div
      v-else-if="isCustomEndpointsError"
      class="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
    >
      <TriangleAlertIcon class="text-destructive-text size-8" aria-hidden="true" />
      <h4 class="font-medium">{{ $t('settings.ai.customEndpoint.loadError.title') }}</h4>
      <p class="text-muted-foreground max-w-md text-sm">
        {{ $t('settings.ai.customEndpoint.loadError.description') }}
      </p>
      <Button
        type="button"
        variant="outline"
        class="mt-2"
        :disabled="isFetchingCustomEndpoints"
        @click="refetchCustomEndpoints()"
      >
        <RotateCwIcon class="size-4" />
        {{ $t('settings.ai.customEndpoint.loadError.retry') }}
      </Button>
    </div>

    <template v-else>
      <div v-if="hasEndpoints" class="space-y-2">
        <CustomEndpointRow
          v-for="endpoint in customEndpoints"
          :key="endpoint.id"
          :endpoint="endpoint"
          @edit="openEditDialog({ id: endpoint.id })"
        />
      </div>

      <div v-else class="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
        <PlugZapIcon class="text-muted-foreground size-8" />
        <h4 class="font-medium">{{ $t('settings.ai.customEndpoint.empty.title') }}</h4>
        <p class="text-muted-foreground max-w-md text-sm">
          {{ $t('settings.ai.customEndpoint.empty.description') }}
        </p>
        <Button class="mt-2" @click="openAddDialog">
          <PlusIcon class="size-4" />
          {{ $t('settings.ai.customEndpoint.addButton') }}
        </Button>
      </div>

      <p class="text-muted-foreground text-xs leading-relaxed">
        {{ $t('settings.ai.customEndpoint.compatibilityHint') }}
      </p>
    </template>

    <CustomEndpointDialog v-model:open="isDialogOpen" :endpoint="editedEndpoint" />
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiCustomEndpoints } from '@/composable/data-queries/use-ai-custom-endpoints';
import { Loader2Icon, PlugZapIcon, PlusIcon, RotateCwIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import CustomEndpointDialog from './custom-endpoint-dialog.vue';
import CustomEndpointRow from './custom-endpoint-row.vue';

const { t } = useI18n();
const { addInfoNotification } = useNotificationCenter();

const {
  customEndpoints,
  isLoadingCustomEndpoints,
  isCustomEndpointsError,
  isFetchingCustomEndpoints,
  refetchCustomEndpoints,
} = useAiCustomEndpoints();

const isDialogOpen = ref(false);
// Held as an id, not the object, so the dialog keeps seeing the live copy after a write invalidates the list.
const editedEndpointId = ref<string | null>(null);

const hasEndpoints = computed(() => customEndpoints.value.length > 0);
const editedEndpoint = computed(
  () => customEndpoints.value.find((endpoint) => endpoint.id === editedEndpointId.value) ?? null,
);

// An endpoint deleted elsewhere leaves the dialog editing nothing, and saving would create a
// duplicate. Closing it needs a reason, or it reads as the form losing the user's work.
watch(editedEndpoint, (endpoint) => {
  if (isDialogOpen.value && editedEndpointId.value && !endpoint) {
    isDialogOpen.value = false;
    addInfoNotification(t('settings.ai.customEndpoint.notifications.editedEndpointGone'));
  }
});

const openAddDialog = () => {
  editedEndpointId.value = null;
  isDialogOpen.value = true;
};

const openEditDialog = ({ id }: { id: string }) => {
  editedEndpointId.value = id;
  isDialogOpen.value = true;
};
</script>
