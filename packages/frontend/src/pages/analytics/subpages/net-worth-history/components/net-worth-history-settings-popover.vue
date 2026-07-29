<template>
  <DesktopOnlyTooltip :content="$t('netWorthHistory.settings.title')">
    <span class="inline-flex">
      <Popover>
        <PopoverTrigger as-child>
          <Button size="icon" variant="secondary" :aria-label="$t('netWorthHistory.settings.title')">
            <SettingsIcon class="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-72 p-0" align="end">
          <header class="border-b px-3 py-2 text-sm font-medium">{{ $t('netWorthHistory.settings.title') }}</header>

          <div class="p-2">
            <div class="flex items-center justify-between gap-3 rounded-md px-2 py-2">
              <div class="flex flex-col">
                <span class="text-sm font-medium">{{ $t('netWorthHistory.settings.zoomLiabilities') }}</span>
                <span class="text-muted-foreground text-xs">
                  {{ $t('netWorthHistory.settings.zoomLiabilitiesHint') }}
                </span>
              </div>
              <Switch
                :model-value="zoomLiabilitiesScale"
                @update:model-value="(value) => emit('update:zoomLiabilitiesScale', !!value)"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  </DesktopOnlyTooltip>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { Switch } from '@/components/lib/ui/switch';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { SettingsIcon } from '@lucide/vue';

defineProps<{ zoomLiabilitiesScale: boolean }>();

const emit = defineEmits<{ 'update:zoomLiabilitiesScale': [value: boolean] }>();
</script>
