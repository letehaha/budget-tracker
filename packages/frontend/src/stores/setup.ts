import { cloneDeep } from 'lodash-es';
import { Store, createPinia } from 'pinia';

export const store = createPinia();

const definedStores: Store[] = [];

export const resetAllDefinedStores = (): void => definedStores.forEach((s) => s.$reset());

// Adds $reset method to clear the store to the initial state
store.use(({ store: storage }) => {
  const initialState = cloneDeep(storage.$state);

  // eslint-disable-next-line no-param-reassign
  storage.$reset = () => storage.$patch(cloneDeep(initialState));
  definedStores.push(storage);
});
