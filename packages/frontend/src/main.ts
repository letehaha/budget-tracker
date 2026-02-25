import '@/styles/global.css';
import './registerServiceWorker';

import { identifyCurrentTheme, patchMetaViewportMaxScaleForiOS } from '@/common/utils';
import { clickOutside, nodeResizeObserver } from '@/directives';
import { i18n, initializeLocale, loadChunks } from '@/i18n';
import { initPostHog, trackPageviews } from '@/lib/posthog';
import { initSentry } from '@/lib/sentry';
import { router } from '@/routes';
import { store } from '@/stores/setup';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createHead } from '@unhead/vue/client';
import { createApp } from 'vue';

import App from './app.vue';

identifyCurrentTheme();
patchMetaViewportMaxScaleForiOS();

// Initialize locale from localStorage/browser
const initialLocale = initializeLocale();

// Load common chunk for the initial locale (if not English, English is preloaded)
// The route guard will load page-specific chunks on navigation
const initI18n = async () => {
  if (initialLocale !== 'en') {
    // For non-English locales, load the common chunk
    await loadChunks({ locale: initialLocale, chunks: ['common'] });
    i18n.global.locale.value = initialLocale as 'en' | 'uk';
  }
};

// Initialize i18n before mounting
initI18n()
  .catch((err) => {
    console.warn('i18n initialization failed, using defaults:', err);
  })
  .finally(() => {
    const app = createApp(App);
    const head = createHead();

    // Initialize Sentry before mounting (must be early to catch errors)
    initSentry({ app, router });

    initPostHog();
    trackPageviews({ router });

    app.directive('click-outside', clickOutside);
    app.directive('node-resize-observer', nodeResizeObserver);

    app.use(router);
    app.use(store);
    app.use(head);
    app.use(i18n); // Register vue-i18n plugin

    app.use(VueQueryPlugin);

    app.mount('#app');
  });
