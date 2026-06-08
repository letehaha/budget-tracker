import type { InjectionKey, Ref } from 'vue';

export type TabsVariant = 'default' | 'underline';

export const TabsVariantKey: InjectionKey<Ref<TabsVariant>> = Symbol('TabsVariant');
