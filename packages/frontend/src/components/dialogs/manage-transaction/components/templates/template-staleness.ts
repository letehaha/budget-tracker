import type { TransactionTemplateModel } from '@bt/shared/types';

import { type TemplateFormSources, resolveMissingRefs } from '../../utils/template-to-form';

export type TemplateStaleReason = 'categoryDeleted' | 'accountUnavailable';

export const TEMPLATE_STALE_REASON_KEYS: Record<TemplateStaleReason, string> = {
  categoryDeleted: 'dialogs.manageTransaction.templates.stale.categoryDeleted',
  accountUnavailable: 'dialogs.manageTransaction.templates.stale.accountUnavailable',
};

/**
 * Only a reference the template can no longer resolve is stale. A field it was saved without
 * (no account, no category) is a deliberate blank the form fills in.
 */
export const getTemplateStaleReason = ({
  template,
  sources,
}: {
  template: TransactionTemplateModel;
  sources: TemplateFormSources;
}): TemplateStaleReason | null => {
  const missing = resolveMissingRefs({ template, sources });
  if (missing.includes('category')) return 'categoryDeleted';
  if (missing.includes('account')) return 'accountUnavailable';
  return null;
};
