import { t } from '@i18n/index';

/**
 * Keys for default tag translation lookup.
 * These map to keys in i18n files under "defaultTags.*"
 */
const DEFAULT_TAG_KEYS = Object.freeze({
  want: 'want',
  need: 'need',
  must: 'must',
} as const);

/**
 * Default tag structure without translated names.
 * Names are resolved at runtime via i18n based on user's locale.
 *
 * These tags are pre-populated for new users and are fully editable/deletable.
 * They have no special protection or system status.
 */
const DEFAULT_TAG_STRUCTURE = Object.freeze([
  { key: DEFAULT_TAG_KEYS.want, color: '#16a34a', icon: 'sparkles' },
  { key: DEFAULT_TAG_KEYS.need, color: '#c35a04', icon: 'target' },
  { key: DEFAULT_TAG_KEYS.must, color: '#c11401', icon: 'circle-alert' },
] as const);

/**
 * Get translated default tags for a given locale.
 * Returns tag structure with names and descriptions resolved via i18n.
 */
export function getTranslatedDefaultTags({ locale }: { locale: string }) {
  return DEFAULT_TAG_STRUCTURE.map((tag) => ({
    name: t({ key: `defaultTags.${tag.key}.name`, locale }),
    description: t({ key: `defaultTags.${tag.key}.description`, locale }),
    color: tag.color,
    icon: tag.icon,
  }));
}
