import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import type { ComposerTranslation } from 'vue-i18n';

export const formatFrequency = ({
  frequency,
  t,
}: {
  frequency: SUBSCRIPTION_FREQUENCIES;
  t: ComposerTranslation;
}): string => {
  const map: Record<SUBSCRIPTION_FREQUENCIES, string> = {
    [SUBSCRIPTION_FREQUENCIES.weekly]: t('planned.subscriptions.frequency.weekly'),
    [SUBSCRIPTION_FREQUENCIES.biweekly]: t('planned.subscriptions.frequency.biweekly'),
    [SUBSCRIPTION_FREQUENCIES.monthly]: t('planned.subscriptions.frequency.monthly'),
    [SUBSCRIPTION_FREQUENCIES.quarterly]: t('planned.subscriptions.frequency.quarterly'),
    [SUBSCRIPTION_FREQUENCIES.semiAnnual]: t('planned.subscriptions.frequency.semiAnnual'),
    [SUBSCRIPTION_FREQUENCIES.annual]: t('planned.subscriptions.frequency.annual'),
  };
  return map[frequency] || frequency;
};

export const formatMatchSource = ({ source, t }: { source: string; t: ComposerTranslation }): string => {
  const map: Record<string, string> = {
    [SUBSCRIPTION_MATCH_SOURCE.manual]: t('planned.subscriptions.matchSource.manual'),
    [SUBSCRIPTION_MATCH_SOURCE.rule]: t('planned.subscriptions.matchSource.rule'),
    [SUBSCRIPTION_MATCH_SOURCE.ai]: t('planned.subscriptions.matchSource.ai'),
  };
  return map[source] || source;
};
