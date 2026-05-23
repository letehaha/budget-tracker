<script setup lang="ts">
import FileDropzone from '@/components/common/file-dropzone.vue';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{
  fileLoaded: [data: { content: unknown[]; fileName: string; fileType: 'csv' | 'json' }];
  error: [message: string];
}>();

const { t } = useI18n();
const selectedFile = ref<File | null>(null);

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return [];

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote (doubled quotes like "")
          current += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator - only split on commas outside quotes
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]!);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    result.push(row);
  }

  return result;
}

async function handleFile(file: File) {
  const fileType = file.name.endsWith('.json') ? 'json' : file.name.endsWith('.csv') ? 'csv' : null;

  if (!fileType) {
    emit('error', t('settings.admin.priceUpload.fileUpload.errors.unsupportedFormat'));
    return;
  }

  try {
    const text = await file.text();

    if (fileType === 'json') {
      const parsed = JSON.parse(text);
      const content = Array.isArray(parsed) ? parsed : [parsed];
      emit('fileLoaded', { content, fileName: file.name, fileType: 'json' });
    } else {
      const content = parseCSV(text);
      emit('fileLoaded', { content, fileName: file.name, fileType: 'csv' });
    }
  } catch (error) {
    emit(
      'error',
      t('settings.admin.priceUpload.fileUpload.errors.parseFailed', {
        fileType: fileType.toUpperCase(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

watch(selectedFile, async (file) => {
  if (!file) return;
  await handleFile(file);
  // Reset the dropzone so the user can re-pick (especially after parse errors),
  // and so the visual stays consistent with the original fire-and-forget behavior.
  selectedFile.value = null;
});
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-sm font-medium">{{ $t('settings.admin.priceUpload.fileUpload.title') }}</h3>
    <FileDropzone v-model="selectedFile" accept=".csv,.json" height="min-h-[150px]" @error="emit('error', $event)">
      <template #hint>{{ $t('settings.admin.priceUpload.fileUpload.supportedFormats') }}</template>
    </FileDropzone>
  </div>
</template>
