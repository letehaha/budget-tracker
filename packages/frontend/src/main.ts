import { identifyCurrentTheme, patchMetaViewportMaxScaleForiOS } from '@/common/utils';
import { clickOutside, nodeResizeObserver } from '@/directives';
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

const app = createApp(App);
const head = createHead();

app.directive('click-outside', clickOutside);
app.directive('node-resize-observer', nodeResizeObserver);

app.use(router);
app.use(store);
app.use(head);

app.use(VueQueryPlugin);

app.mount('#app');
