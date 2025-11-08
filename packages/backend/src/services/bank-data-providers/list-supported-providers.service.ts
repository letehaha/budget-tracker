import { bankProviderRegistry } from '@services/bank-data-providers';

export const listSupportedProviders = () => {
  const providers = bankProviderRegistry.listAll();

  return providers;
};
