import { makePortfolioIndicatorId } from '@bt/shared/types';
import type { PortfolioAnnualizedReturnModel } from '@bt/shared/types/investments/portfolio-annualized-return.model';
import type { ComposerTranslation } from 'vue-i18n';

type MarketIndicator = { id: string; avgAnnualReturn: number } & ({ label: string } | { labelKey: string });

export const CUSTOM_INDICATOR_ID = 'custom';

export const MARKET_INDICATORS: MarketIndicator[] = [
  { id: 'sp500', label: 'S&P 500', avgAnnualReturn: 10 },
  { id: 'nasdaq', label: 'NASDAQ Composite', avgAnnualReturn: 12 },
  { id: 'djia', label: 'Dow Jones', avgAnnualReturn: 7.5 },
  { id: 'world-stock', labelKey: 'analytics.investmentCalculator.indicators.worldStock', avgAnnualReturn: 8 },
  { id: 'us-treasury', labelKey: 'analytics.investmentCalculator.indicators.usTreasury', avgAnnualReturn: 5 },
  { id: 'corporate-bonds', labelKey: 'analytics.investmentCalculator.indicators.corporateBonds', avgAnnualReturn: 6 },
];

export const getIndicatorLabel = ({
  indicator,
  t,
}: {
  indicator: MarketIndicator;
  t: (key: string) => string;
}): string => ('labelKey' in indicator ? t(indicator.labelKey) : indicator.label);

export const getIndicatorById = ({ id }: { id: string }): MarketIndicator | undefined =>
  MARKET_INDICATORS.find((i) => i.id === id);

export type ReturnOption = { id: string; label: string; disabled?: boolean };

// Portfolios first, then market presets, then "Custom". A portfolio without enough history
// (`annualizedReturn === null`) stays listed but disabled so the option is discoverable.
export const buildReturnOptions = ({
  portfolioReturns,
  t,
  formatPresetLabel,
}: {
  portfolioReturns: PortfolioAnnualizedReturnModel[];
  t: ComposerTranslation;
  formatPresetLabel?: (params: { label: string; nominalPct: number }) => string;
}): ReturnOption[] => [
  ...portfolioReturns.map((portfolio) => ({
    id: makePortfolioIndicatorId({ portfolioId: portfolio.portfolioId }),
    ...(portfolio.annualizedReturn !== null
      ? {
          label: t('analytics.investmentCalculator.portfolioReturnOption', {
            name: portfolio.portfolioName,
            rate: portfolio.annualizedReturn.toFixed(1),
          }),
        }
      : {
          label: t('analytics.investmentCalculator.portfolioNoHistoryOption', { name: portfolio.portfolioName }),
          disabled: true,
        }),
  })),
  ...MARKET_INDICATORS.map((indicator) => {
    const label = getIndicatorLabel({ indicator, t });
    return {
      id: indicator.id,
      label: formatPresetLabel
        ? formatPresetLabel({ label, nominalPct: indicator.avgAnnualReturn })
        : t('analytics.investmentCalculator.presetReturnOption', { label, rate: indicator.avgAnnualReturn }),
    };
  }),
  { id: CUSTOM_INDICATOR_ID, label: t('analytics.investmentCalculator.customIndicator') },
];
