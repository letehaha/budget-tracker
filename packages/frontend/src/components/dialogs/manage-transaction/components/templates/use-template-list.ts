import { VERBOSE_PAYMENT_TYPES } from '@/common/const';
import type { ButtonVariantProps } from '@/components/lib/ui/button';
import { formatUIAmount } from '@/js/helpers';
import type { AccountModel, TransactionTemplateModel } from '@bt/shared/types';
import { PlusIcon } from '@lucide/vue';
import { type EmitFn, type ShortEmitsToObject, computed, ref } from 'vue';
import { type ComposerTranslation, useI18n } from 'vue-i18n';

import type { TemplateFormSources } from '../../utils/template-to-form';
import { getTemplateStaleReason } from './template-staleness';

export const EMPTY_FIELD_LABEL = '—';
const SUMMARY_SEPARATOR = ' · ';

export interface TemplateListProps {
  templates: TransactionTemplateModel[];
  applied: TransactionTemplateModel | null;
  disabled: boolean;
  canSaveCurrent: boolean;
  sources: TemplateFormSources;
  open: boolean;
  isError: boolean;
  isLoading: boolean;
}

export type TemplateListEmits = {
  'update:open': [value: boolean];
  apply: [template: TransactionTemplateModel];
  clear: [];
  edit: [template: TransactionTemplateModel];
  'save-current': [];
  'update-current': [];
  'save-as-new': [];
  new: [];
  retry: [];
  prefetch: [];
  'closed-after-apply': [];
};

/** The template fields the transaction form shows no control for, so the UI has to name them. */
export const getTemplateHiddenFields = ({
  template,
  t,
}: {
  template: TransactionTemplateModel;
  t: ComposerTranslation;
}): string => {
  const parts: string[] = [];
  const paymentType = VERBOSE_PAYMENT_TYPES.find((item) => item.value === template.paymentType);
  if (paymentType) parts.push(t(paymentType.label));
  if (template.tagIds.length) {
    parts.push(t('dialogs.manageTransaction.templates.tagsCount', { count: template.tagIds.length }));
  }
  if (template.note) parts.push(t('dialogs.manageTransaction.form.noteLabel'));
  return parts.join(SUMMARY_SEPARATOR);
};

/** Everything the desktop popover and the mobile drawer share; each owns only its markup. */
export const useTemplateList = ({
  props,
  emit,
}: {
  props: TemplateListProps;
  emit: EmitFn<ShortEmitsToObject<TemplateListEmits>>;
}) => {
  const { t } = useI18n();

  const query = ref('');

  const isOpen = computed({
    get: () => props.open,
    set: (value: boolean) => emit('update:open', value),
  });

  const filtered = computed(() => {
    const search = query.value.trim().toLowerCase();
    if (!search) return props.templates;
    return props.templates.filter((template) => template.name.toLowerCase().includes(search));
  });

  const accountOf = ({ template }: { template: TransactionTemplateModel }): AccountModel | null =>
    template.accountId ? (props.sources.sourceAccounts.find((item) => item.id === template.accountId) ?? null) : null;

  // An amount is stored in its pinned account's currency, so without that account there is
  // nothing to render it as — `formatUIAmount` would silently fall back to `$`.
  const amountLabelOf = ({ template }: { template: TransactionTemplateModel }) => {
    const currency = accountOf({ template })?.currencyCode;
    if (template.amount == null || !currency) return EMPTY_FIELD_LABEL;
    return formatUIAmount(template.amount, { currency });
  };

  const staleReasonOf = ({ template }: { template: TransactionTemplateModel }) =>
    getTemplateStaleReason({ template, sources: props.sources });

  const closeAnd = ({ run }: { run: () => void }) => {
    isOpen.value = false;
    run();
  };

  const openEditor = ({ template }: { template: TransactionTemplateModel }) => {
    isOpen.value = false;
    emit('edit', template);
  };

  const footerActions = computed(() => {
    const { applied } = props;

    return [
      {
        key: 'save-current',
        label: t('dialogs.manageTransaction.templates.saveCurrent'),
        variant: 'secondary' as ButtonVariantProps['variant'],
        disabled: !props.canSaveCurrent,
        run: () => emit('save-current'),
      },
      ...(applied
        ? [
            {
              key: 'update-current',
              label: t('dialogs.manageTransaction.templates.updateApplied', { name: applied.name }),
              variant: 'secondary' as ButtonVariantProps['variant'],
              disabled: false,
              run: () => emit('update-current'),
            },
            {
              key: 'save-as-new',
              label: t('dialogs.manageTransaction.templates.saveAsNew'),
              variant: 'ghost' as ButtonVariantProps['variant'],
              disabled: !props.canSaveCurrent,
              run: () => emit('save-as-new'),
            },
          ]
        : []),
      {
        key: 'new',
        label: t('dialogs.manageTransaction.templates.newTemplate'),
        variant: 'ghost-primary' as ButtonVariantProps['variant'],
        icon: PlusIcon,
        disabled: false,
        run: () => emit('new'),
      },
    ];
  });

  return {
    query,
    isOpen,
    filtered,
    amountLabelOf,
    staleReasonOf,
    footerActions,
    closeAnd,
    openEditor,
  };
};
