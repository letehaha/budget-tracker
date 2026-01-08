<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.dataManagement.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.dataManagement.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.dataManagement.textSource.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.dataManagement.textSource.description') }}
        </p>

        <router-link :to="{ name: ROUTES_NAMES.importStatement }">
          <Button>
            <FileTextIcon class="mr-2 size-4" />
            {{ $t('settings.dataManagement.textSource.button') }}
          </Button>
        </router-link>
      </div>

      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.dataManagement.csv.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.dataManagement.csv.description') }}
        </p>

        <router-link :to="{ name: ROUTES_NAMES.importCsv }">
          <Button>
            <UploadIcon class="mr-2 size-4" />
            {{ $t('settings.dataManagement.csv.button') }}
          </Button>
        </router-link>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { ROUTES_NAMES } from '@/routes';
import { FileTextIcon, UploadIcon } from 'lucide-vue-next';
</script>
