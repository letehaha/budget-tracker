import { ref } from 'vue';

export function useSafariDetection() {
  const isSafari = ref(false);
  const isSafariMobile = ref(false);

  // Detect Safari
  const userAgent = navigator.userAgent.toLowerCase();
  const isAppleDevice = /iphone|ipad|ipod|macintosh/.test(userAgent);
  const isSafariBrowser =
    userAgent.includes('safari') && !userAgent.includes('chrome') && !userAgent.includes('android');

  if (isSafariBrowser) {
    isSafari.value = true;

    // Further detect if it's mobile Safari
    if (isAppleDevice && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      isSafariMobile.value = true;
    }
  }

  return {
    isSafari,
    isSafariMobile,
  };
}
