import type { InjectionKey } from 'vue';

/** Provided by every `Drawer`, so a `Drawer` further down the tree knows it is a nested one. */
export const IS_INSIDE_DRAWER: InjectionKey<boolean> = Symbol('is-inside-drawer');
