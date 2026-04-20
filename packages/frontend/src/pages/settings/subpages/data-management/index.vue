<template>
  <Card class="@container/data-mgmt max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold text-balance">
        {{ $t('settings.dataManagement.title') }}
      </h2>
      <p class="text-sm opacity-80">{{ $t('settings.dataManagement.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6">
      <div class="grid grid-cols-1 gap-4 @lg/data-mgmt:grid-cols-2">
        <RouterLink
          :to="{ name: ROUTES_NAMES.importStatement }"
          class="border-border group hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-ring relative flex flex-col gap-4 rounded-lg border p-5 transition-[background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:outline-none"
        >
          <div class="flex items-start justify-between">
            <div class="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <SparklesIcon class="size-5" />
            </div>
            <span class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
              {{ $t('settings.dataManagement.textSource.aiBadge') }}
            </span>
          </div>

          <div class="flex flex-1 flex-col">
            <h3 class="mb-1.5 font-semibold text-balance">
              {{ $t('settings.dataManagement.textSource.title') }}
            </h3>
            <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
              {{ $t('settings.dataManagement.textSource.description') }}
            </p>
          </div>

          <div
            class="text-muted-foreground group-hover:text-primary flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
          >
            {{ $t('settings.dataManagement.textSource.cta') }}
            <ArrowRightIcon class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </RouterLink>

        <RouterLink
          :to="{ name: ROUTES_NAMES.importCsv }"
          class="border-border group hover:border-muted-foreground/30 hover:bg-muted/50 focus-visible:ring-ring relative flex flex-col gap-4 rounded-lg border p-5 transition-[background-color,border-color] duration-200 focus-visible:ring-2 focus-visible:outline-none"
        >
          <div>
            <div class="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
              <FileSpreadsheetIcon class="size-5" />
            </div>
          </div>

          <div class="flex flex-1 flex-col">
            <h3 class="mb-1.5 font-semibold text-balance">
              {{ $t('settings.dataManagement.csv.title') }}
            </h3>
            <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
              {{ $t('settings.dataManagement.csv.description') }}
            </p>
          </div>

          <div
            class="text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
          >
            {{ $t('settings.dataManagement.csv.cta') }}
            <ArrowRightIcon class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </RouterLink>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes';
import { ArrowRightIcon, FileSpreadsheetIcon, SparklesIcon } from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
</script>
