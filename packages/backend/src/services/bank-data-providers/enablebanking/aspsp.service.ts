/**
 * Service for managing Enable Banking ASPSPs (banks)
 */
import { EnableBankingApiClient } from './api-client';
import { ASPSP, EnableBankingCredentials } from './types';

/**
 * Get list of all supported ASPSPs
 * @param credentials - Enable Banking credentials (just appId and privateKey needed)
 */
async function listASPSPs(credentials: EnableBankingCredentials): Promise<ASPSP[]> {
  const apiClient = new EnableBankingApiClient(credentials);
  return await apiClient.getASPSPs();
}

/**
 * Get list of unique countries that have supported banks
 */
export async function listCountries(credentials: EnableBankingCredentials): Promise<string[]> {
  const aspsps = await listASPSPs(credentials);
  const countries = new Set(aspsps.map((aspsp) => aspsp.country));
  return Array.from(countries).toSorted();
}

/**
 * Get list of banks for a specific country
 */
export async function listBanksByCountry(credentials: EnableBankingCredentials, countryCode: string): Promise<ASPSP[]> {
  const aspsps = await listASPSPs(credentials);
  return aspsps.filter((aspsp) => aspsp.country === countryCode).toSorted((a, b) => a.name.localeCompare(b.name));
}
