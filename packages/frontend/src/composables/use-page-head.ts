import { useHead } from '@unhead/vue';
import type { MaybeRefOrGetter } from 'vue';

interface PageHeadOptions {
  title: MaybeRefOrGetter<string>;
  description?: MaybeRefOrGetter<string>;
}

const BASE_TITLE = 'MoneyMatter';

/**
 * Composable for setting page title and meta tags.
 * Title will be formatted as "Page Title | MoneyMatter"
 *
 * @example
 * // Basic usage
 * usePageHead({ title: 'Dashboard' });
 * // Result: "Dashboard | MoneyMatter"
 *
 * @example
 * // With description
 * usePageHead({
 *   title: 'Budgets',
 *   description: 'Manage your monthly budgets'
 * });
 *
 * @example
 * // With reactive title
 * const accountName = ref('Savings');
 * usePageHead({ title: () => accountName.value });
 */
export function usePageHead({ title, description }: PageHeadOptions) {
  useHead({
    title: () => {
      const titleValue = typeof title === 'function' ? title() : title;
      return `${titleValue} | ${BASE_TITLE}`;
    },
    meta: description
      ? [
          {
            name: 'description',
            content: description,
          },
        ]
      : [],
  });
}
