<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  fileLoaded: [data: { content: unknown[]; fileName: string; fileType: 'csv' | 'json' }];
  error: [message: string];
}>();

const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

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

  const headers = parseLine(lines[0]);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
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
    emit('error', 'Unsupported file format. Please upload CSV or JSON file.');
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
      `Failed to parse ${fileType.toUpperCase()} file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    handleFile(file);
  }
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) {
    handleFile(file);
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function openFileDialog() {
  fileInputRef.value?.click();
}
</script>

<template>
  <div class="space-y-2">
    <h3 class="text-sm font-medium">Upload File</h3>
    <div
      class="border-border hover:border-primary flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors"
      :class="{ 'border-primary bg-primary/5': isDragging }"
      @click="openFileDialog"
      @drop.prevent="onDrop"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="text-muted-foreground mb-3 size-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p class="text-foreground mb-1 text-sm font-medium">Click to upload or drag and drop</p>
      <p class="text-muted-foreground text-xs">CSV or JSON files supported</p>
      <input ref="fileInputRef" type="file" accept=".csv,.json" class="hidden" @change="onFileChange" />
    </div>
  </div>
</template>
