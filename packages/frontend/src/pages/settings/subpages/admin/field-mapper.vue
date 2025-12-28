<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  fileFields: string[];
  requiredFields: string[];
}>();

const emit = defineEmits<{
  mappingComplete: [mapping: Record<string, string>, dateFormat: string];
  mappingChanged: [mapping: Record<string, string>, dateFormat: string];
}>();

// Map of required field -> selected file field
const fieldMapping = ref<Record<string, string>>({});

// Date format selection
const dateFormat = ref<string>('dd/MM/yyyy');

// Auto-detect common field names
function autoDetectFields() {
  const mapping: Record<string, string> = {};

  for (const required of props.requiredFields) {
    const lowerRequired = required.toLowerCase();
    const match = props.fileFields.find((field) => {
      const lowerField = field.toLowerCase();
      return (
        lowerField === lowerRequired ||
        lowerField.includes(lowerRequired) ||
        (lowerRequired === 'price' && (lowerField.includes('value') || lowerField.includes('amount')))
      );
    });

    if (match) {
      mapping[required] = match;
    }
  }

  fieldMapping.value = mapping;
}

// Check if mapping is complete
const isMappingComplete = computed(() => {
  return props.requiredFields.every((field) => fieldMapping.value[field]);
});

watch(
  () => props.fileFields,
  () => {
    autoDetectFields();
  },
  { immediate: true },
);

watch(
  [fieldMapping, dateFormat],
  ([mapping, format]) => {
    emit('mappingChanged', mapping, format);
    if (isMappingComplete.value) {
      emit('mappingComplete', mapping, format);
    }
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-medium">Map Fields</h3>
    <p class="text-muted-foreground text-xs">Match your file's fields to the required fields below.</p>

    <div class="space-y-2">
      <div
        v-for="required in requiredFields"
        :key="required"
        class="border-border flex items-center gap-3 rounded border p-3"
      >
        <div class="min-w-[100px] font-medium">
          {{ required }}
          <span class="text-destructive-text">*</span>
        </div>
        <div class="text-muted-foreground mx-2">→</div>
        <select
          v-model="fieldMapping[required]"
          class="border-border bg-background flex-1 rounded border px-3 py-2 text-sm"
        >
          <option value="">Select field...</option>
          <option v-for="field in fileFields" :key="field" :value="field">
            {{ field }}
          </option>
        </select>
      </div>
    </div>

    <!-- Date Format Selection -->
    <div class="border-border space-y-2 rounded border p-3">
      <label class="text-sm font-medium"> Date Format <span class="text-destructive-text">*</span> </label>
      <p class="text-muted-foreground text-xs">Select the date format used in your file</p>
      <select v-model="dateFormat" class="border-border bg-background w-full rounded border px-3 py-2 text-sm">
        <option value="dd/MM/yyyy">DD/MM/YYYY (e.g., 31/12/2024)</option>
        <option value="MM/dd/yyyy">MM/DD/YYYY (e.g., 12/31/2024)</option>
        <option value="yyyy-MM-dd">YYYY-MM-DD (e.g., 2024-12-31)</option>
        <option value="dd-MM-yyyy">DD-MM-YYYY (e.g., 31-12-2024)</option>
        <option value="MM-dd-yyyy">MM-DD-YYYY (e.g., 12-31-2024)</option>
      </select>
    </div>

    <div
      v-if="isMappingComplete"
      class="bg-success/20 text-success-text border-success/20 flex items-center gap-2 rounded border p-2 text-sm"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      All required fields mapped
    </div>
    <div v-else class="text-muted-foreground flex items-center gap-2 text-xs">
      Please map all required fields to continue
    </div>
  </div>
</template>
