import type { TransactionModel, TransactionTemplateModel } from '@bt/shared/types';
import { type Ref, ref } from 'vue';

import type { UI_FORM_STRUCT } from '../types';
import {
  type TemplateFormSources,
  type TemplateMissingRef,
  resolveMissingRefs,
  templateToForm,
} from '../utils/template-to-form';
import type { TransferDestinationType } from './transfer-form';

export interface AppliedTemplateSession {
  form: Ref<UI_FORM_STRUCT>;
  transferDestinationType: Ref<TransferDestinationType>;
  linkedTransaction: Ref<TransactionModel | null>;
}

/** `from-form` templates were built out of the current form, so every reference resolves. */
type AdoptMode = 'edit' | 'from-form';

export const useAppliedTemplate = ({ session }: { session: AppliedTemplateSession }) => {
  const applied = ref<TransactionTemplateModel | null>(null);
  const missing = ref<TemplateMissingRef[]>([]);

  const apply = ({ template, sources }: { template: TransactionTemplateModel; sources: TemplateFormSources }) => {
    const result = templateToForm({ template, current: session.form.value, sources });

    session.form.value = result.form;
    session.transferDestinationType.value = 'account';
    session.linkedTransaction.value = null;

    applied.value = template;
    missing.value = result.missing;
  };

  /**
   * Marks a template active without writing it over the form. Use after saving or editing:
   * `apply` would drop the fields the template does not carry.
   */
  const adopt = ({
    template,
    mode,
    sources,
  }: {
    template: TransactionTemplateModel;
    mode: AdoptMode;
    sources: TemplateFormSources;
  }) => {
    applied.value = template;
    missing.value = mode === 'edit' ? resolveMissingRefs({ template, sources }) : [];
  };

  /** Detaches the template. The form keeps whatever the template put there. */
  const dismiss = () => {
    applied.value = null;
    missing.value = [];
  };

  return { applied, missing, apply, adopt, dismiss };
};
