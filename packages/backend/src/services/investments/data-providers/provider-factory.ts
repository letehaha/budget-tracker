import { SECURITY_PROVIDER } from '@bt/shared/types/investments';

import { AlphaVantageDataProvider } from './alphavantage-provider';
import { BaseSecurityDataProvider } from './base-provider';
import { CompositeDataProvider } from './composite-provider';
import { FmpDataProvider } from './fmp-provider';
import { PolygonDataProvider } from './polygon-provider';

class DataProviderFactory {
  private providers = new Map<SECURITY_PROVIDER, BaseSecurityDataProvider>();

  getProvider(providerName: SECURITY_PROVIDER = SECURITY_PROVIDER.composite): BaseSecurityDataProvider {
    if (!this.providers.has(providerName)) {
      this.providers.set(providerName, this.createProvider(providerName));
    }
    return this.providers.get(providerName)!;
  }

  private createProvider(providerName: SECURITY_PROVIDER): BaseSecurityDataProvider {
    switch (providerName) {
      case SECURITY_PROVIDER.alphavantage: {
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY as string;
        if (!apiKey) {
          throw new Error('Alpha Vantage API key not configured');
        }
        return new AlphaVantageDataProvider(apiKey);
      }

      case SECURITY_PROVIDER.polygon: {
        const apiKey = process.env.POLYGON_API_KEY as string;
        if (!apiKey) {
          throw new Error('Polygon API key not configured');
        }
        return new PolygonDataProvider(apiKey);
      }

      case SECURITY_PROVIDER.fmp: {
        const apiKey = process.env.FMP_API_KEY as string;
        if (!apiKey) {
          throw new Error('FMP API key not configured');
        }
        return new FmpDataProvider(apiKey);
      }

      case SECURITY_PROVIDER.composite: {
        return new CompositeDataProvider({
          fmpApiKey: process.env.FMP_API_KEY,
          polygonApiKey: process.env.POLYGON_API_KEY,
          alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
        });
      }

      default:
        throw new Error(`Unsupported data provider: ${providerName}`);
    }
  }

  /**
   * Used in tests to clear cached providers to avoid mocking issues
   */
  public clearCache() {
    return this.providers.clear();
  }
}

export const dataProviderFactory = new DataProviderFactory();

export { DataProviderFactory };
