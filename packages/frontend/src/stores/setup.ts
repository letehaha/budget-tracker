import { isObject } from 'lodash-es';
import { Store, createPinia } from 'pinia';
import { isReadonly } from 'vue';

export const store = createPinia();

const definedStores: Store[] = [];

export const resetAllDefinedStores = (): void => definedStores.forEach((s) => s.$reset());

// Deep clone helper that skips readonly properties (like query data from TanStack Query)
// Prevents warnings are errors related to Tanstack when resetting a store
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cloneStateSkipReadonly = (state: any): any => {
  if (!isObject(state)) return state;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = Array.isArray(state) ? [] : {};

  for (const key in state) {
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      // Skip readonly refs (query data)
      if (isReadonly(state[key])) {
        continue;
      }

      if (isObject(state[key])) {
        result[key] = cloneStateSkipReadonly(state[key]);
      } else {
        result[key] = state[key];
      }
    }
  }

  return result;
};

// Adds $reset method to clear the store to the initial state
store.use(({ store: storage }) => {
  const initialState = cloneStateSkipReadonly(storage.$state);

  // eslint-disable-next-line no-param-reassign
  storage.$reset = () => {
    const resetState = cloneStateSkipReadonly(initialState);
    // Only patch non-readonly properties
    for (const key in resetState) {
      if (Object.prototype.hasOwnProperty.call(resetState, key)) {
        if (!isReadonly(storage.$state[key])) {
          storage.$state[key] = resetState[key];
        }
      }
    }
  };
  definedStores.push(storage);
});
