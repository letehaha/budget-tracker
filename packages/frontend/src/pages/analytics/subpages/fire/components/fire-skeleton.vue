<template>
  <section
    class="border-border bg-card flex flex-col gap-6 rounded-lg border p-4 @2xl/fire:p-6"
    aria-busy="true"
    :aria-label="$t('analytics.fire.loading')"
  >
    <div class="@container/hero animate-pulse">
      <div class="flex flex-col gap-5 @2xl/hero:flex-row @2xl/hero:items-start @2xl/hero:justify-between">
        <div class="flex flex-col gap-1.5">
          <div class="bg-muted my-0.5 h-3 w-32 rounded" />
          <div
            class="grid grid-cols-[1fr_auto] items-end gap-x-3 @2xl/hero:flex @2xl/hero:flex-col @2xl/hero:items-start @2xl/hero:gap-1.5"
          >
            <div class="bg-muted my-px h-9 w-36 rounded-md @lg/hero:h-11 @lg/hero:w-44" />
            <div class="flex flex-col items-end gap-1 @2xl/hero:items-start">
              <div class="bg-muted my-0.5 h-3.75 w-24 rounded @2xl/hero:my-1 @2xl/hero:w-48" />
              <div class="bg-muted my-0.5 h-3 w-16 rounded @2xl/hero:hidden" />
            </div>
          </div>
          <div class="flex flex-col">
            <div class="bg-muted my-1 h-3 w-96 max-w-full rounded" />
            <div class="bg-muted my-1 h-3 w-24 rounded @sm/hero:hidden" />
          </div>
        </div>
        <div class="border-border flex flex-col border-t @2xl/hero:items-end @2xl/hero:gap-1 @2xl/hero:border-0">
          <div
            v-for="width in ASSUMPTION_WIDTHS"
            :key="width"
            class="border-border flex items-center justify-between gap-3 border-b py-2 @2xl/hero:block @2xl/hero:border-0 @2xl/hero:py-0"
          >
            <div :class="cn('bg-muted my-1 h-3 rounded', width)" />
            <div class="bg-muted h-4 w-10 rounded-full @2xl/hero:hidden" />
          </div>
        </div>
      </div>
    </div>

    <div class="flex animate-pulse flex-col gap-2">
      <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <div class="bg-muted my-1 h-3 w-32 rounded" />
        <div class="bg-muted my-1 h-3 w-36 rounded" />
      </div>
      <div class="bg-muted h-3.5 rounded-full" />
      <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <div class="bg-muted my-0.5 h-3 w-48 rounded" />
        <div class="bg-muted my-0.5 h-3 w-32 rounded" />
      </div>
    </div>

    <div class="@container/chips animate-pulse">
      <div class="hidden grid-cols-6 gap-2.5 @lg/chips:grid @3xl/chips:grid-cols-5">
        <div
          v-for="n in CHIP_COUNT"
          :key="n"
          :class="
            cn(
              'border-border flex flex-col gap-1 rounded-lg border p-3 @3xl/chips:col-span-1',
              n <= FIRE_TARGET_TYPES.length ? 'col-span-2' : 'col-span-3',
            )
          "
        >
          <div class="bg-muted my-0.5 h-3 w-16 max-w-full rounded" />
          <div class="bg-muted my-1 h-5 w-14 rounded" />
          <div class="flex flex-col gap-1.5 py-0.75">
            <div class="bg-muted h-2.5 w-full max-w-28 rounded" />
            <div class="bg-muted h-2.5 w-2/3 rounded @3xl/chips:block @5xl/chips:hidden" />
          </div>
          <div class="mt-1 flex flex-col gap-1 py-0.5">
            <div class="bg-muted h-3 w-full max-w-24 rounded" />
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 @lg/chips:hidden">
        <div class="border-border flex justify-between rounded-lg border px-3 py-2.5">
          <div class="flex flex-col gap-1.5 py-0.5">
            <div class="bg-muted h-3 w-20 rounded" />
            <div class="bg-muted h-2.5 w-28 rounded" />
          </div>
          <div class="flex flex-col items-end gap-1">
            <div class="bg-muted h-5 w-14 rounded" />
            <div class="bg-muted h-3 w-24 rounded" />
          </div>
        </div>
        <div class="flex h-8 items-center justify-between px-2">
          <div class="bg-muted h-3 w-14 rounded" />
          <div class="bg-muted size-4 rounded" />
        </div>
      </div>
    </div>
  </section>

  <section class="border-border bg-card flex flex-col gap-4 rounded-lg border p-4 @2xl/fire:p-6">
    <div class="bg-muted/60 h-72 animate-pulse rounded-md" />
    <div class="@container/milestones animate-pulse">
      <div class="grid grid-cols-1 gap-2.5 @md/milestones:grid-cols-2 @3xl/milestones:grid-cols-4">
        <div v-for="n in MILESTONE_COUNT" :key="n" class="flex items-center gap-2">
          <div class="bg-muted size-5.5 shrink-0 rounded-full" />
          <div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
            <div class="bg-muted h-3 w-40 max-w-full rounded" />
            <div class="bg-muted hidden h-3 w-16 rounded @3xl/milestones:block @5xl/milestones:hidden" />
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="flex animate-pulse flex-col gap-1 px-1 py-0.5">
    <div class="bg-muted h-3 w-full max-w-xl rounded" />
    <div class="bg-muted h-3 w-2/3 rounded @2xl/fire:hidden" />
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { FIRE_TARGET_TYPES } from '@bt/shared/types';

const ASSUMPTION_WIDTHS = ['w-36', 'w-32', 'w-44'];
const CHIP_COUNT = 5;
const MILESTONE_COUNT = 4;
</script>
