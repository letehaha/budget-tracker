<template>
  <div class="flex h-full min-h-[250px] flex-col items-center justify-center">
    <div class="relative h-32 w-48">
      <!-- Animated circles that morph and move -->
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div class="relative">
          <!-- Center pulsing circle -->
          <div class="bg-primary/30 size-8 animate-ping rounded-full"></div>
          <!-- Orbiting dots -->
          <div class="absolute inset-0 animate-spin">
            <div class="bg-primary absolute -top-3 left-1/2 size-2 -translate-x-1/2 rounded-full"></div>
            <div class="bg-primary/60 absolute top-full left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"></div>
          </div>
          <!-- Counter-rotating ring -->
          <div
            class="absolute inset-0 -rotate-45 animate-spin"
            style="animation-duration: 2s; animation-direction: reverse"
          >
            <div class="bg-primary/40 absolute top-1/2 left-full h-1 w-1 -translate-y-1/2 rounded-full"></div>
            <div class="bg-primary/40 absolute top-1/2 right-full h-1 w-1 -translate-y-1/2 rounded-full"></div>
          </div>
        </div>
      </div>

      <!-- Corner accent elements -->
      <div class="bg-primary/20 absolute top-4 left-4 size-3 animate-pulse rounded-full delay-300"></div>
      <div class="bg-primary/20 absolute top-4 right-4 size-2 animate-pulse rounded-full delay-500"></div>
      <div class="bg-primary/20 absolute bottom-4 left-6 h-2.5 w-2.5 animate-pulse rounded-full delay-700"></div>
      <div class="bg-primary/20 absolute right-6 bottom-4 h-1.5 w-1.5 animate-pulse rounded-full delay-900"></div>
    </div>
  </div>
</template>
