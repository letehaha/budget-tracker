<template>
  <ResponsiveDialog
    :open="isVisible"
    :dismissible="false"
    custom-close
    sr-only-header
    no-internal-scroll
    drawer-custom-indicator
    dialog-content-class="z-(--z-app-lock) max-w-md"
    drawer-content-class="z-(--z-app-lock) pt-6"
  >
    <template #title>
      <template v-if="showProgress"><slot name="title" /></template>
      <template v-else>{{ failedTitle }}</template>
    </template>
    <template #description>
      <template v-if="showProgress"><slot name="description" /></template>
      <template v-else>{{ liveFailure }}</template>
    </template>

    <div class="text-center">
      <template v-if="showProgress">
        <div class="bg-primary/10 ring-primary/15 mx-auto flex size-12 items-center justify-center rounded-full ring-1">
          <slot name="icon" />
        </div>
        <h2 class="mt-5 text-lg font-semibold"><slot name="title" /></h2>
        <p class="text-muted-foreground mt-2 text-sm">
          <slot name="description" />
        </p>

        <slot name="progress" />

        <p v-if="isTakingLong" class="text-muted-foreground mt-5 text-sm">
          {{ takingLongLabel }}
        </p>

        <template v-if="statusUnreachable">
          <div class="border-border/60 mt-5 border-t pt-5">
            <p class="text-destructive-text text-sm font-medium">
              {{ unreachableTitle }}
            </p>

            <p class="text-muted-foreground mt-2 text-sm">
              {{ unreachableDescription }}
            </p>

            <Button ref="dismissButtonRef" variant="outline" class="mt-4" @click="emit('dismiss')">
              {{ dismissLabel }}
            </Button>
          </div>
        </template>
      </template>

      <template v-else-if="liveFailure">
        <div class="bg-destructive/10 mx-auto flex size-16 items-center justify-center rounded-full">
          <TriangleAlertIcon class="text-destructive-text size-8" aria-hidden="true" />
        </div>

        <h2 class="mt-5 text-lg font-semibold">
          {{ failedTitle }}
        </h2>

        <p class="text-muted-foreground mt-2 text-sm">{{ liveFailure }}</p>

        <Button ref="dismissButtonRef" variant="outline" class="mt-6" @click="emit('dismiss')">
          {{ dismissLabel }}
        </Button>
      </template>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { TriangleAlertIcon } from '@lucide/vue';
import { type ComponentPublicInstance, computed, nextTick, ref, watch } from 'vue';

/** Non-dismissible frame shared by the blocking job overlays: centered card on
 *  desktop, bottom sheet on mobile, above every other layer. */
const props = defineProps<{
  /** Show the progress frame — true while the job is queued/running (and the brief
   *  completed window before its reload). */
  showProgress: boolean;
  isTakingLong: boolean;
  takingLongLabel: string;
  statusUnreachable: boolean;
  unreachableTitle: string;
  unreachableDescription: string;
  /** Failure message to show in place of progress, or null when not failed. */
  liveFailure: string | null;
  failedTitle: string;
  dismissLabel: string;
}>();

const emit = defineEmits<{ dismiss: [] }>();

const isVisible = computed(() => props.showProgress || Boolean(props.liveFailure));

const dismissButtonRef = ref<ComponentPublicInstance | null>(null);

/** True whenever a panel with a dismiss button is showing (failure or unreachable). */
const dismissActionVisible = computed(() => Boolean(props.liveFailure) || props.statusUnreachable);

// Focus the dismiss button when the panel swaps in place: the dialog is already open,
// so its open-focus does not refire.
watch(dismissActionVisible, async (present) => {
  if (!present) return;
  await nextTick();
  (dismissButtonRef.value?.$el as HTMLElement | undefined)?.focus();
});
</script>
