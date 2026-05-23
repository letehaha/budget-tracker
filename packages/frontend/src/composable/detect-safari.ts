export function useSafariDetection() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
  const isSafariBrowser =
    userAgent.includes('safari') && !userAgent.includes('chrome') && !userAgent.includes('android');

  // CriOS = Chrome on iOS. All iOS browsers use WebKit, but Chrome adds its own UI chrome.
  const isIOSChrome = isAppleDevice && userAgent.includes('crios');

  // iOS uses navigator.standalone, other platforms use display-mode media query.
  const isIOSStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isPWA = isIOSStandalone || isDisplayModeStandalone;

  const isSafari = isSafariBrowser;
  const isSafariMobile = isSafariBrowser && isAppleDevice && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  return {
    isSafari,
    isSafariMobile,
    isIOSChrome,
    isPWA,
  };
}
