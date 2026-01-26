<template>
  <div class="orbs-container pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <!-- Noise texture overlay to reduce gradient banding -->
    <svg class="absolute inset-0 z-10 size-full opacity-[0.1] mix-blend-overlay" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>

    <!-- Hero area orbs - SVG with radialGradient for smooth color transitions -->
    <svg
      class="hero-orb hero-orb-1 absolute -top-[10%] left-1/2 size-200 -translate-x-1/2"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb1-grad">
          <stop offset="0%" stop-color="rgb(168,85,247)" stop-opacity="0.20" />
          <stop offset="8%" stop-color="rgb(168,85,247)" stop-opacity="0.17" />
          <stop offset="16%" stop-color="rgb(168,85,247)" stop-opacity="0.14" />
          <stop offset="24%" stop-color="rgb(168,85,247)" stop-opacity="0.115" />
          <stop offset="32%" stop-color="rgb(168,85,247)" stop-opacity="0.09" />
          <stop offset="40%" stop-color="rgb(168,85,247)" stop-opacity="0.07" />
          <stop offset="50%" stop-color="rgb(168,85,247)" stop-opacity="0.05" />
          <stop offset="60%" stop-color="rgb(168,85,247)" stop-opacity="0.035" />
          <stop offset="70%" stop-color="rgb(168,85,247)" stop-opacity="0.022" />
          <stop offset="80%" stop-color="rgb(168,85,247)" stop-opacity="0.012" />
          <stop offset="90%" stop-color="rgb(168,85,247)" stop-opacity="0.005" />
          <stop offset="100%" stop-color="rgb(168,85,247)" stop-opacity="0.001" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#orb1-grad)" />
    </svg>
    <svg
      class="hero-orb hero-orb-2 absolute top-[15%] right-0 size-150 translate-x-1/3"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb2-grad">
          <stop offset="0%" stop-color="rgb(59,130,246)" stop-opacity="0.15" />
          <stop offset="10%" stop-color="rgb(59,130,246)" stop-opacity="0.125" />
          <stop offset="20%" stop-color="rgb(59,130,246)" stop-opacity="0.10" />
          <stop offset="30%" stop-color="rgb(6,182,212)" stop-opacity="0.08" />
          <stop offset="40%" stop-color="rgb(6,182,212)" stop-opacity="0.06" />
          <stop offset="50%" stop-color="rgb(6,182,212)" stop-opacity="0.045" />
          <stop offset="60%" stop-color="rgb(6,182,212)" stop-opacity="0.03" />
          <stop offset="70%" stop-color="rgb(6,182,212)" stop-opacity="0.018" />
          <stop offset="80%" stop-color="rgb(6,182,212)" stop-opacity="0.01" />
          <stop offset="90%" stop-color="rgb(6,182,212)" stop-opacity="0.004" />
          <stop offset="100%" stop-color="rgb(6,182,212)" stop-opacity="0.001" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#orb2-grad)" />
    </svg>
    <!-- Features area orbs -->
    <svg
      class="hero-orb hero-orb-3 absolute top-[40%] -left-[10%] size-125"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb3-grad">
          <stop offset="0%" stop-color="rgb(236,72,153)" stop-opacity="0.15" />
          <stop offset="10%" stop-color="rgb(236,72,153)" stop-opacity="0.125" />
          <stop offset="20%" stop-color="rgb(236,72,153)" stop-opacity="0.10" />
          <stop offset="30%" stop-color="rgb(168,85,247)" stop-opacity="0.08" />
          <stop offset="40%" stop-color="rgb(168,85,247)" stop-opacity="0.06" />
          <stop offset="50%" stop-color="rgb(168,85,247)" stop-opacity="0.045" />
          <stop offset="60%" stop-color="rgb(168,85,247)" stop-opacity="0.03" />
          <stop offset="70%" stop-color="rgb(168,85,247)" stop-opacity="0.018" />
          <stop offset="80%" stop-color="rgb(168,85,247)" stop-opacity="0.01" />
          <stop offset="90%" stop-color="rgb(168,85,247)" stop-opacity="0.004" />
          <stop offset="100%" stop-color="rgb(168,85,247)" stop-opacity="0.001" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#orb3-grad)" />
    </svg>
    <!-- Self-host area orbs -->
    <svg
      class="hero-orb hero-orb-1 absolute top-[55%] -right-[5%] size-112.5"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb4-grad">
          <stop offset="0%" stop-color="rgb(34,197,94)" stop-opacity="0.15" />
          <stop offset="10%" stop-color="rgb(34,197,94)" stop-opacity="0.125" />
          <stop offset="20%" stop-color="rgb(34,197,94)" stop-opacity="0.10" />
          <stop offset="30%" stop-color="rgb(16,185,129)" stop-opacity="0.08" />
          <stop offset="40%" stop-color="rgb(16,185,129)" stop-opacity="0.06" />
          <stop offset="50%" stop-color="rgb(16,185,129)" stop-opacity="0.045" />
          <stop offset="60%" stop-color="rgb(16,185,129)" stop-opacity="0.03" />
          <stop offset="70%" stop-color="rgb(16,185,129)" stop-opacity="0.018" />
          <stop offset="80%" stop-color="rgb(16,185,129)" stop-opacity="0.01" />
          <stop offset="90%" stop-color="rgb(16,185,129)" stop-opacity="0.004" />
          <stop offset="100%" stop-color="rgb(16,185,129)" stop-opacity="0.001" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#orb4-grad)" />
    </svg>
    <!-- CTA/Footer area orbs -->
    <svg
      class="hero-orb hero-orb-2 absolute top-[75%] left-[10%] size-125"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb5-grad">
          <stop offset="0%" stop-color="rgb(168,85,247)" stop-opacity="0.15" />
          <stop offset="10%" stop-color="rgb(168,85,247)" stop-opacity="0.125" />
          <stop offset="20%" stop-color="rgb(168,85,247)" stop-opacity="0.10" />
          <stop offset="30%" stop-color="rgb(236,72,153)" stop-opacity="0.08" />
          <stop offset="40%" stop-color="rgb(236,72,153)" stop-opacity="0.06" />
          <stop offset="50%" stop-color="rgb(236,72,153)" stop-opacity="0.045" />
          <stop offset="60%" stop-color="rgb(236,72,153)" stop-opacity="0.03" />
          <stop offset="70%" stop-color="rgb(236,72,153)" stop-opacity="0.018" />
          <stop offset="80%" stop-color="rgb(236,72,153)" stop-opacity="0.01" />
          <stop offset="90%" stop-color="rgb(236,72,153)" stop-opacity="0.004" />
          <stop offset="100%" stop-color="rgb(236,72,153)" stop-opacity="0.001" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#orb5-grad)" />
    </svg>
    <svg
      class="hero-orb hero-orb-3 absolute top-[85%] right-[5%] size-100"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb6-grad">
          <stop offset="0%" stop-color="rgb(236,72,153)" stop-opacity="0.15" />
          <stop offset="10%" stop-color="rgb(236,72,153)" stop-opacity="0.125" />
          <stop offset="20%" stop-color="rgb(236,72,153)" stop-opacity="0.10" />
          <stop offset="30%" stop-color="rgb(168,85,247)" stop-opacity="0.08" />
          <stop offset="40%" stop-color="rgb(168,85,247)" stop-opacity="0.06" />
          <stop offset="50%" stop-color="rgb(168,85,247)" stop-opacity="0.045" />
          <stop offset="60%" stop-color="rgb(168,85,247)" stop-opacity="0.03" />
          <stop offset="70%" stop-color="rgb(168,85,247)" stop-opacity="0.018" />
          <stop offset="80%" stop-color="rgb(168,85,247)" stop-opacity="0.01" />
          <stop offset="90%" stop-color="rgb(168,85,247)" stop-opacity="0.004" />
          <stop offset="100%" stop-color="rgb(168,85,247)" stop-opacity="0.001" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#orb6-grad)" />
    </svg>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
/* Floating orb animations */
.hero-orb {
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  /* Reduce banding artifacts on Retina displays */
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
  filter: blur(80px); /* Override blur-3xl (64px) with smoother blur */
}

.hero-orb-1 {
  animation:
    float-1 12s infinite,
    pulse 4s ease-in-out infinite;
}

.hero-orb-2 {
  animation:
    float-2 15s infinite,
    pulse 5s ease-in-out infinite 1s;
}

.hero-orb-3 {
  animation:
    float-3 13s infinite,
    pulse 6s ease-in-out infinite 2s;
}

@keyframes float-1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(3%, 4%);
  }
  66% {
    transform: translate(-2%, -2%);
  }
}

@keyframes float-2 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-4%, 3%);
  }
}

@keyframes float-3 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  40% {
    transform: translate(5%, -3%);
  }
  70% {
    transform: translate(-3%, 2%);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
    scale: 1;
  }
  50% {
    opacity: 0.8;
    scale: 1.15;
  }
}
</style>
