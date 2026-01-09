import { identifyCurrentTheme, patchMetaViewportMaxScaleForiOS } from '@/common/utils';
import { clickOutside, nodeResizeObserver } from '@/directives';
import { i18n, initializeLocale, loadLanguageAsync } from '@/i18n';
import { initPostHog, setupPostHogRouterTracking } from '@/lib/posthog';
import { initSentry } from '@/lib/sentry';
import { router } from '@/routes';
import { store } from '@/stores/setup';
import '@/styles/global.css';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createHead } from '@unhead/vue/client';
import { createApp } from 'vue';

import App from './app.vue';
import './registerServiceWorker';

identifyCurrentTheme();
patchMetaViewportMaxScaleForiOS();

// Initialize locale from localStorage/browser
const initialLocale = initializeLocale();
if (initialLocale !== 'en') {
  // Lazy load non-English locale
  loadLanguageAsync(initialLocale);
}

const app = createApp(App);
const head = createHead();

// Initialize Sentry before mounting (must be early to catch errors)
initSentry({ app, router });

// Initialize PostHog analytics
initPostHog();
setupPostHogRouterTracking({ router });

app.directive('click-outside', clickOutside);
app.directive('node-resize-observer', nodeResizeObserver);

app.use(router);
app.use(store);
app.use(head);
app.use(i18n); // Register vue-i18n plugin

app.use(VueQueryPlugin);

app.mount('#app');
