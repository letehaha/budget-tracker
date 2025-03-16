import { identifyCurrentTheme, patchMetaViewportMaxScaleForiOS } from '@/common/utils';
import { clickOutside, nodeResizeObserver } from '@/directives';
import { router } from '@/routes';
import { store } from '@/stores/setup';
import '@/styles/index.scss';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';

import App from './app.vue';
import './registerServiceWorker';

identifyCurrentTheme();
patchMetaViewportMaxScaleForiOS();

const app = createApp(App);

app.directive('click-outside', clickOutside);
app.directive('node-resize-observer', nodeResizeObserver);

app.use(router);
app.use(store);

app.use(VueQueryPlugin);

app.mount('#app');
