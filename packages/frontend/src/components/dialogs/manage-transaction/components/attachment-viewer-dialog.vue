<script lang="ts" setup>
import { loadAttachmentFile } from '@/api/attachments';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import type { TransactionAttachmentModel } from '@bt/shared/types';
import { DownloadIcon, ExternalLinkIcon, LoaderCircleIcon } from '@lucide/vue';
import { computed, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  attachment: TransactionAttachmentModel | null;
}>();

const isOpen = defineModel<boolean>('open', { default: false });

const blobUrl = ref<string | null>(null);
const isLoading = ref(false);
const isError = ref(false);

const isPdf = computed(() => props.attachment?.mimeType === 'application/pdf');

// Discards a response that lands after the user already switched files.
let activeRequest = 0;

const revoke = () => {
  if (!blobUrl.value) return;
  URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = null;
};

watch(
  () => (isOpen.value ? props.attachment : null),
  async (attachment) => {
    activeRequest += 1;
    const request = activeRequest;
    revoke();
    isError.value = false;
    if (!attachment) return;

    isLoading.value = true;
    try {
      const blob = await loadAttachmentFile({ id: attachment.id, mimeType: attachment.mimeType });
      if (request !== activeRequest) return;
      blobUrl.value = URL.createObjectURL(blob);
    } catch {
      if (request === activeRequest) isError.value = true;
    } finally {
      if (request === activeRequest) isLoading.value = false;
    }
  },
  { immediate: true },
);

onUnmounted(revoke);
</script>

<template>
  <ResponsiveDialog
    v-model:open="isOpen"
    no-internal-scroll
    dialog-content-class="h-[min(85dvh,50rem)] sm:max-w-3xl"
    drawer-content-class="h-[calc(100dvh-1.25rem)] max-h-[calc(100dvh-1.25rem)]"
  >
    <template #title>{{ attachment?.filename }}</template>

    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="bg-muted/40 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg">
        <LoaderCircleIcon v-if="isLoading" class="text-muted-foreground size-6 animate-spin" />

        <p v-else-if="isError || !blobUrl" class="text-muted-foreground p-6 text-center text-sm">
          {{ $t('dialogs.manageTransaction.form.attachments.viewer.loadFailed') }}
        </p>

        <iframe
          v-else-if="isPdf"
          :src="`${blobUrl}#navpanes=0&pagemode=none`"
          :title="attachment?.filename"
          class="h-full w-full border-0"
          allowfullscreen
        />

        <img v-else :src="blobUrl" :alt="attachment?.filename" class="max-h-full max-w-full object-contain" />
      </div>

      <div v-if="blobUrl" class="flex flex-wrap gap-2">
        <Button as-child variant="outline" size="sm">
          <a :href="blobUrl" target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon class="size-4" />
            {{ $t('dialogs.manageTransaction.form.attachments.viewer.openInNewTab') }}
          </a>
        </Button>

        <Button as-child variant="outline" size="sm">
          <a :href="blobUrl" :download="attachment?.filename">
            <DownloadIcon class="size-4" />
            {{ $t('dialogs.manageTransaction.form.attachments.viewer.download') }}
          </a>
        </Button>
      </div>
    </div>
  </ResponsiveDialog>
</template>
