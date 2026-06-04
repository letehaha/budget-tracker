<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <UiButton variant="outline" size="sm" :disabled="disabled" class="gap-1.5">
        <MoreHorizontalIcon class="size-4" />
        <span>{{ $t('payees.actions.menu') }}</span>
      </UiButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuItem @click="emit('rename')">
        <PencilIcon class="size-4" />
        {{ $t('payees.actions.rename') }}
      </DropdownMenuItem>
      <DropdownMenuItem @click="emit('merge')">
        <GitMergeIcon class="size-4" />
        {{ $t('payees.actions.merge') }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
        @click="emit('delete')"
      >
        <Trash2Icon class="size-4" />
        {{ $t('payees.actions.delete') }}
      </DropdownMenuItem>
      <DropdownMenuItem
        class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
        @click="emit('deleteAndIgnore')"
      >
        <ShieldOffIcon class="size-4" />
        {{ $t('payees.actions.deleteAndIgnore') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import { Button as UiButton } from '@/components/lib/ui/button';
import { GitMergeIcon, MoreHorizontalIcon, PencilIcon, ShieldOffIcon, Trash2Icon } from '@lucide/vue';

defineProps<{ disabled?: boolean }>();

const emit = defineEmits<{
  rename: [];
  merge: [];
  delete: [];
  deleteAndIgnore: [];
}>();
</script>
