<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { formatBytes } from '@/common/utils/format-bytes';
import { cn } from '@/lib/utils';
import { FileTextIcon, FileUpIcon, XIcon } from 'lucide-vue-next';
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    /** Currently-selected file. v-model bound. `null` means empty state. */
    modelValue: File | null;
    /** Native `accept` attribute, e.g. `.csv,.pdf,text/csv,application/pdf`. */
    accept?: string;
    /** Max size in bytes. Files larger than this emit `error` instead of being set. */
    maxSize?: number;
    /** Custom validator. Return an error string to reject the file, or null to accept. */
    validator?: (file: File) => string | null;
    /** Disables click + drop + remove. */
    disabled?: boolean;
    /** Tailwind height class for the dropzone. Default `h-48`. */
    height?: string;
  }>(),
  {
    accept: undefined,
    maxSize: undefined,
    validator: undefined,
    disabled: false,
    height: 'h-48',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', file: File | null): void;
  (e: 'error', message: string): void;
}>();

const { t } = useI18n();
const inputId = useId();
const isDragging = ref(false);

const acceptedFile = computed<File | null>({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function validate(file: File): string | null {
  if (props.maxSize !== undefined && file.size > props.maxSize) {
    return t('fileDropzone.fileTooLarge', { max: formatBytes({ bytes: props.maxSize }) });
  }
  return props.validator ? props.validator(file) : null;
}

function commit(file: File) {
  const err = validate(file);
  if (err) {
    emit('error', err);
    return;
  }
  acceptedFile.value = file;
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) commit(file);
  // Reset so re-selecting the same file fires `change` again.
  target.value = '';
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (props.disabled) return;
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  if (props.disabled) return;
  const file = e.dataTransfer?.files?.[0];
  if (file) commit(file);
}

function clear() {
  acceptedFile.value = null;
}
</script>

<template>
  <div class="space-y-3">
    <label
      :for="inputId"
      :class="
        cn(
          'group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-sm transition-all',
          props.height,
          disabled ? 'border-input pointer-events-none opacity-60' : 'cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-input hover:border-primary/60 hover:bg-primary/5',
        )
      "
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <slot name="empty" :is-dragging="isDragging">
        <div
          :class="
            cn(
              'flex size-14 items-center justify-center rounded-2xl transition-all',
              isDragging
                ? 'bg-primary/20 ring-primary/40 scale-110 ring-2'
                : 'bg-primary/10 ring-primary/10 ring-1 group-hover:scale-105',
            )
          "
        >
          <FileUpIcon class="text-primary size-7" />
        </div>
        <div class="space-y-1 text-center">
          <p class="text-sm font-medium">
            {{ isDragging ? t('fileDropzone.dropHere') : t('fileDropzone.clickOrDrag') }}
          </p>
          <p v-if="$slots.hint" class="text-muted-foreground text-xs">
            <slot name="hint" />
          </p>
        </div>
      </slot>
    </label>

    <input :id="inputId" type="file" class="hidden" :accept="accept" :disabled="disabled" @change="onFileChange" />

    <slot name="selected" :file="acceptedFile" :clear="clear">
      <div
        v-if="acceptedFile"
        class="border-border/60 bg-muted/30 flex items-center justify-between gap-3 rounded-lg border p-3"
      >
        <div class="flex min-w-0 items-center gap-3">
          <div class="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <FileTextIcon class="text-primary size-4" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ acceptedFile.name }}</p>
            <p class="text-muted-foreground text-xs">{{ formatBytes({ bytes: acceptedFile.size }) }}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          :disabled="disabled"
          :aria-label="t('fileDropzone.removeFile')"
          @click="clear"
        >
          <XIcon class="size-4" />
        </Button>
      </div>
    </slot>
  </div>
</template>
