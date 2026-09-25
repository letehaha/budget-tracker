<template>
  <div class="@container/fire-aside flex animate-pulse flex-col gap-4" aria-hidden="true">
    <div class="bg-muted my-1 h-3 w-24 rounded" />

    <div class="divide-border flex flex-col divide-y *:py-1">
      <div>
        <div class="flex min-h-11 items-center gap-3 py-2">
          <div class="bg-muted size-7 shrink-0 rounded-lg" />
          <div class="bg-muted h-3 w-48 rounded" />
          <div class="bg-muted ml-auto size-4 shrink-0 rounded" />
        </div>
        <div v-if="openSections.spending" class="flex flex-col gap-2 pt-1 pb-2">
          <div class="bg-muted h-10 rounded-md md:h-9" />
          <div>
            <div class="bg-muted mt-0.5 mb-1.75 h-3 w-36 rounded" />
            <div class="bg-muted h-10 rounded-md md:h-9.5" />
          </div>
          <div class="bg-muted my-0.5 h-3 w-52 rounded" />
        </div>
      </div>

      <div>
        <div class="flex min-h-11 items-center gap-3 py-2">
          <div class="bg-muted size-7 shrink-0 rounded-lg" />
          <div class="bg-muted h-3 w-36 rounded" />
          <div class="bg-muted ml-auto size-4 shrink-0 rounded" />
        </div>
        <div v-if="openSections.contribution" class="flex flex-col gap-2 pt-1 pb-2">
          <div class="bg-muted h-10 rounded-md md:h-9" />
          <div class="bg-muted my-0.5 h-3 w-44 rounded" />
        </div>
      </div>

      <div>
        <div class="flex min-h-11 items-center gap-3 py-2">
          <div class="bg-muted size-7 shrink-0 rounded-lg" />
          <div class="bg-muted h-3 w-40 rounded" />
          <div class="bg-muted ml-auto size-4 shrink-0 rounded" />
        </div>
        <div v-if="openSections.counts" class="flex flex-col gap-2 pt-1 pb-2">
          <div v-for="n in COUNT_ROWS" :key="n" class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <div class="bg-muted h-6 w-11 shrink-0 rounded-full" />
              <div class="flex flex-col">
                <div class="bg-muted my-1 h-3 w-24 rounded" />
                <!-- The longest label wraps next to a six-figure amount in the 20rem aside. -->
                <div v-if="n === 2" class="bg-muted my-1 h-3 w-16 rounded @2xs/fire-aside:hidden" />
              </div>
            </div>
            <div class="bg-muted my-1 h-3 w-20 rounded" />
          </div>
          <div class="flex flex-col gap-1 py-0.5">
            <div class="bg-muted h-3 w-full max-w-xl rounded" />
            <div class="bg-muted h-3 w-full rounded @xl/fire-aside:hidden" />
            <div class="bg-muted h-3 w-1/3 rounded @2xs/fire-aside:hidden" />
          </div>
        </div>
      </div>

      <div>
        <div class="flex min-h-11 items-center gap-3 py-2">
          <div class="bg-muted size-7 shrink-0 rounded-lg" />
          <div class="bg-muted h-3 w-32 rounded" />
          <div class="bg-muted ml-auto size-4 shrink-0 rounded" />
        </div>
        <div v-if="openSections.return" class="flex flex-col gap-3 pt-1 pb-2">
          <div class="bg-muted h-10 rounded-md md:h-9" />
          <div class="flex items-center justify-between gap-2">
            <div class="bg-muted my-1 h-3 w-16 rounded" />
            <div class="bg-muted my-1 h-3 w-40 rounded" />
          </div>
        </div>
      </div>

      <div>
        <div class="flex min-h-11 items-center gap-3 py-2">
          <div class="bg-muted size-7 shrink-0 rounded-lg" />
          <div class="bg-muted h-3 w-28 rounded" />
          <div class="bg-muted ml-auto size-4 shrink-0 rounded" />
        </div>
        <div v-if="openSections.withdrawal" class="flex flex-col gap-2 pt-1 pb-2">
          <div class="bg-muted h-7.5 rounded-lg" />
          <div class="flex flex-col gap-1 py-0.5">
            <div class="bg-muted h-3 w-full rounded" />
            <div class="bg-muted h-3 w-full rounded" />
            <div class="bg-muted h-3 w-full rounded @xl/fire-aside:hidden" />
            <div class="bg-muted h-3 w-1/2 rounded @xl/fire-aside:hidden" />
          </div>
        </div>
      </div>

      <div>
        <div class="flex min-h-11 items-center gap-3 py-2">
          <div class="bg-muted size-7 shrink-0 rounded-lg" />
          <div class="flex flex-col">
            <div class="bg-muted my-1 h-3 w-12 rounded" />
            <div class="bg-muted my-0.5 h-3 w-40 rounded" />
          </div>
          <div class="bg-muted ml-auto size-4 shrink-0 rounded" />
        </div>
        <div v-if="openSections.more" class="flex flex-col gap-4 pt-1 pb-2">
          <div v-for="n in MORE_FIELDS" :key="n">
            <div class="bg-muted mt-0.5 mb-1.75 h-3 w-36 rounded" />
            <div class="bg-muted h-10 rounded-md md:h-9" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAssumptionSections } from '../composables/use-assumption-sections';

const COUNT_ROWS = 5;
const MORE_FIELDS = 5;

const { openSections } = useAssumptionSections();
</script>
