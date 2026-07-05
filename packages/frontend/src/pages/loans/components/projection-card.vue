<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="text-base font-semibold">{{ $t('loans.detail.projection.title') }}</div>
    </CardHeader>
    <CardContent>
      <ProjectionCardContent :loan="loan" />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { LoanApi } from '@/api/loans';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';

import ProjectionCardContent from './projection-card-content.vue';

defineProps<{ loan: LoanApi }>();
</script>
