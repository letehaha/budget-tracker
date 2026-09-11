import { useUserSettings } from '@/composable/data-queries/user-settings';
import type { TransactionOptionalField } from '@bt/shared/types';
import { computed } from 'vue';

// Applies only until the user saves the setting once; an explicit empty list stays empty.
const DEFAULT_OPTIONAL_FIELDS: TransactionOptionalField[] = ['originalAmount'];

/**
 * Read/write access to the per-user "optional transaction fields" preference. The transaction form
 * renders such a field when it is enabled here or already holds a value; the settings page flips it.
 */
export const useOptionalFields = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const enabled = computed<TransactionOptionalField[]>(
    () => userSettings.value?.ui?.transactionForm?.optionalFields ?? DEFAULT_OPTIONAL_FIELDS,
  );

  const isEnabled = (field: TransactionOptionalField) => enabled.value.includes(field);

  const setEnabled = ({ field, value }: { field: TransactionOptionalField; value: boolean }) =>
    patchAsync({
      ui: {
        transactionForm: {
          optionalFields: value ? [...new Set([...enabled.value, field])] : enabled.value.filter((f) => f !== field),
        },
      },
    });

  return { enabled, isEnabled, setEnabled, isUpdating: isPatching };
};
