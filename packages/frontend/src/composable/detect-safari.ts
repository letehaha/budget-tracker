import { ref } from 'vue';

export function useSafariDetection() {
  const isSafari = ref(false);
  const isSafariMobile = ref(false);
  const isIOSChrome = ref(false);
  const isPWA = ref(false);

  // Detect Safari
  const userAgent = navigator.userAgent.toLowerCase();
  const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
  const isSafariBrowser =
    userAgent.includes('safari') && !userAgent.includes('chrome') && !userAgent.includes('android');

  // Detect iOS Chrome (CriOS = Chrome on iOS)
  // All iOS browsers use WebKit, but Chrome adds its own UI chrome
  isIOSChrome.value = isAppleDevice && userAgent.includes('crios');

  // Detect PWA/standalone mode
  // iOS uses navigator.standalone, other platforms use display-mode media query
  const isIOSStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  isPWA.value = isIOSStandalone || isDisplayModeStandalone;

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
    isIOSChrome,
    isPWA,
  };
}
