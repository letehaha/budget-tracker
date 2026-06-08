import type { Component } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export { default as RouterTabs } from './router-tabs.vue';

/**
 * Item descriptor for `RouterTabs`. `value` is the route name used to detect the
 * active tab; `to` defaults to `{ name: value }` for simple cases and can be
 * overridden when the link needs params, query, or a different target.
 */
export type RouterTabItem = { value: string; label: string; to?: RouteLocationRaw } & (
  | { icon?: undefined; iconClass?: never }
  | { icon: Component; iconClass?: string }
);
