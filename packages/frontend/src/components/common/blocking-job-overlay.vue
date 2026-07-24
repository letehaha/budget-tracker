<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      ref="overlayRef"
      class="bg-background/95 fixed inset-0 z-(--z-app-lock) flex items-center justify-center p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="blocking-job-overlay-title"
      aria-describedby="blocking-job-overlay-description"
      tabindex="-1"
    >
      <Card class="w-full max-w-md shadow-lg">
        <CardContent class="p-6 text-center sm:pt-6">
          <template v-if="showProgress">
            <!-- Job-specific hero, title, description and progress bar. -->
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

            <h2 id="blocking-job-overlay-title" class="mt-5 text-lg font-semibold">
              {{ failedTitle }}
            </h2>

            <p id="blocking-job-overlay-description" class="text-muted-foreground mt-2 text-sm">{{ liveFailure }}</p>

            <Button ref="dismissButtonRef" variant="outline" class="mt-6" @click="emit('dismiss')">
              {{ dismissLabel }}
            </Button>
          </template>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent } from '@/components/lib/ui/card';
import { TriangleAlertIcon } from '@lucide/vue';
import { type ComponentPublicInstance, computed, nextTick, onUnmounted, ref, watch } from 'vue';

/**
 * Frame shared by every blocking background-job overlay (base-currency change, data
 * restore, …). It owns the parts that are identical across jobs: the full-screen
 * teleported backdrop, keeping the app behind it inert + focus-trapped, the failure
 * panel, and the dismissible "can't reach the server" escape hatch. The job-specific
 * progress visual (hero, title, progress bar) is supplied through the `progress` slot.
 */
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

const overlayRef = ref<HTMLElement | null>(null);
const dismissButtonRef = ref<ComponentPublicInstance | null>(null);

/** True whenever a panel with a dismiss button is showing (failure or unreachable). */
const dismissActionVisible = computed(() => Boolean(props.liveFailure) || props.statusUnreachable);

/** The app mount root; inerting it keeps Tab from reaching the app behind the overlay. */
const appRoot = (): HTMLElement | null => document.getElementById('app');

watch(isVisible, async (visible) => {
  const root = appRoot();
  if (visible) {
    root?.setAttribute('inert', '');
    await nextTick();
    overlayRef.value?.focus();
  } else {
    root?.removeAttribute('inert');
  }
});

// The overlay can swap from progress to the failure/unreachable panel without ever
// hiding, so the isVisible watch above won't fire. Move focus to the dismiss button
// on that in-place switch so keyboard users land on the only remaining action.
watch(dismissActionVisible, async (present) => {
  if (!present) return;
  await nextTick();
  (dismissButtonRef.value?.$el as HTMLElement | undefined)?.focus();
});

onUnmounted(() => {
  // A leaked inert attribute would dead-lock the whole UI, so always clear it.
  appRoot()?.removeAttribute('inert');
});
</script>
