<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { SettingsIcon } from 'lucide-vue-next';

defineProps<{
  isEditMode: boolean;
}>();

const emit = defineEmits<{
  enter: [];
  save: [];
  cancel: [];
}>();
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="isEditMode">
      <Button variant="outline" size="sm" @click="emit('cancel')"> {{ $t('common.actions.cancel') }} </Button>
      <Button size="sm" @click="emit('save')"> {{ $t('common.actions.done') }} </Button>
    </template>
    <template v-else>
      <Button variant="outline" size="sm" @click="emit('enter')">
        <SettingsIcon class="mr-1.5 size-3.5" />
        {{ $t('dashboard.editMode.customize') }}
      </Button>
    </template>
  </div>
</template>
