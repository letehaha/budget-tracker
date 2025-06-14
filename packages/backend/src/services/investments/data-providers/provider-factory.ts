import { SECURITY_PROVIDER } from '@bt/shared/types/investments';

import { BaseSecurityDataProvider } from './base-provider';
import { PolygonDataProvider } from './polygon-provider';

class DataProviderFactory {
  private providers = new Map<SECURITY_PROVIDER, BaseSecurityDataProvider>();

  getProvider(providerName: SECURITY_PROVIDER = SECURITY_PROVIDER.polygon): BaseSecurityDataProvider {
    if (!this.providers.has(providerName)) {
      this.providers.set(providerName, this.createProvider(providerName));
    }
    return this.providers.get(providerName)!;
  }

  private createProvider(providerName: SECURITY_PROVIDER): BaseSecurityDataProvider {
    const apiKey = process.env.POLYGON_API_KEY as string;

    switch (providerName) {
      case SECURITY_PROVIDER.polygon:
        if (!apiKey) {
          throw new Error('Polygon API key not configured');
        }
        return new PolygonDataProvider(apiKey);

      case SECURITY_PROVIDER.other:
        throw new Error('Other providers not yet implemented');

      default:
        throw new Error(`Unsupported data provider: ${providerName}`);
    }
  }

  // Method to clear cached providers (useful for testing)
  clearCache() {
    this.providers.clear();
  }
}

export const dataProviderFactory = new DataProviderFactory();

export { DataProviderFactory };
