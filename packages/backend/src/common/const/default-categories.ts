import { CATEGORY_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { logger } from '@js/utils/logger';

/**
 * Keys for category translation lookup.
 * These map to keys in i18n files under "defaultCategories.main.*"
 */
export const CATEGORY_KEYS = Object.freeze({
  food: 'food',
  shopping: 'shopping',
  housing: 'housing',
  transportation: 'transportation',
  vehicle: 'vehicle',
  life: 'life',
  communication: 'communication',
  financialExpenses: 'financialExpenses',
  investments: 'investments',
  income: 'income',
  other: 'other',
} as const);

/**
 * Category structure without translated names.
 * Names are resolved at runtime via i18n based on user's locale.
 */
export const DEFAULT_CATEGORY_STRUCTURE = Object.freeze({
  main: [
    { key: CATEGORY_KEYS.food, type: CATEGORY_TYPES.custom, color: '#e74c3c' },
    { key: CATEGORY_KEYS.shopping, type: CATEGORY_TYPES.custom, color: '#3498db' },
    { key: CATEGORY_KEYS.housing, type: CATEGORY_TYPES.custom, color: '#e67e22' },
    { key: CATEGORY_KEYS.transportation, type: CATEGORY_TYPES.custom, color: '#95a5a6' },
    { key: CATEGORY_KEYS.vehicle, type: CATEGORY_TYPES.custom, color: '#8e44ad' },
    { key: CATEGORY_KEYS.life, type: CATEGORY_TYPES.custom, color: '#2ecc71' },
    { key: CATEGORY_KEYS.communication, type: CATEGORY_TYPES.custom, color: '#2980b9' },
    { key: CATEGORY_KEYS.financialExpenses, type: CATEGORY_TYPES.custom, color: '#16a085' },
    { key: CATEGORY_KEYS.investments, type: CATEGORY_TYPES.custom, color: '#fda7df' },
    { key: CATEGORY_KEYS.income, type: CATEGORY_TYPES.custom, color: '#f1c40f' },
    { key: CATEGORY_KEYS.other, type: CATEGORY_TYPES.internal, color: '#7f8c8d' },
  ],
  subcategories: [
    {
      parentKey: CATEGORY_KEYS.food,
      values: [
        { key: 'groceries', type: CATEGORY_TYPES.custom },
        { key: 'restaurant', type: CATEGORY_TYPES.custom },
        { key: 'barCafe', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.shopping,
      values: [
        { key: 'clothesShoes', type: CATEGORY_TYPES.custom },
        { key: 'jewelsAccessories', type: CATEGORY_TYPES.custom },
        { key: 'healthBeauty', type: CATEGORY_TYPES.custom },
        { key: 'kids', type: CATEGORY_TYPES.custom },
        { key: 'homeGarden', type: CATEGORY_TYPES.custom },
        { key: 'petsAnimals', type: CATEGORY_TYPES.custom },
        { key: 'electronicsAccessories', type: CATEGORY_TYPES.custom },
        { key: 'giftsJoy', type: CATEGORY_TYPES.custom },
        { key: 'stationeryTools', type: CATEGORY_TYPES.custom },
        { key: 'freeTime', type: CATEGORY_TYPES.custom },
        { key: 'drugstoreChemist', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.housing,
      values: [
        { key: 'rent', type: CATEGORY_TYPES.custom },
        { key: 'mortgage', type: CATEGORY_TYPES.custom },
        { key: 'energyUtilities', type: CATEGORY_TYPES.custom },
        { key: 'services', type: CATEGORY_TYPES.custom },
        { key: 'maintenanceRepairs', type: CATEGORY_TYPES.custom },
        { key: 'propertyInsurance', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.transportation,
      values: [
        { key: 'publicTransport', type: CATEGORY_TYPES.custom },
        { key: 'taxi', type: CATEGORY_TYPES.custom },
        { key: 'longDistance', type: CATEGORY_TYPES.custom },
        { key: 'businessTrips', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.vehicle,
      values: [
        { key: 'fuel', type: CATEGORY_TYPES.custom },
        { key: 'parking', type: CATEGORY_TYPES.custom },
        { key: 'vehicleMaintenance', type: CATEGORY_TYPES.custom },
        { key: 'rentals', type: CATEGORY_TYPES.custom },
        { key: 'vehicleInsurance', type: CATEGORY_TYPES.custom },
        { key: 'leasing', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.life,
      values: [
        { key: 'healthCareDoctor', type: CATEGORY_TYPES.custom },
        { key: 'wellnessBeauty', type: CATEGORY_TYPES.custom },
        { key: 'activeSportFitness', type: CATEGORY_TYPES.custom },
        { key: 'cultureSportEvents', type: CATEGORY_TYPES.custom },
        { key: 'hobbies', type: CATEGORY_TYPES.custom },
        { key: 'educationDevelopment', type: CATEGORY_TYPES.custom },
        { key: 'booksAudioSubscriptions', type: CATEGORY_TYPES.custom },
        { key: 'tvStreaming', type: CATEGORY_TYPES.custom },
        { key: 'holidayTripsHotels', type: CATEGORY_TYPES.custom },
        { key: 'charityGifts', type: CATEGORY_TYPES.custom },
        { key: 'alcoholTobacco', type: CATEGORY_TYPES.custom },
        { key: 'lotteryGambling', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.communication,
      values: [
        { key: 'phoneCellPhone', type: CATEGORY_TYPES.custom },
        { key: 'internet', type: CATEGORY_TYPES.custom },
        { key: 'softwareAppsGames', type: CATEGORY_TYPES.custom },
        { key: 'postalServices', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.financialExpenses,
      values: [
        { key: 'taxes', type: CATEGORY_TYPES.custom },
        { key: 'insurances', type: CATEGORY_TYPES.custom },
        { key: 'loanInterests', type: CATEGORY_TYPES.custom },
        { key: 'fines', type: CATEGORY_TYPES.custom },
        { key: 'advisory', type: CATEGORY_TYPES.custom },
        { key: 'chargesFees', type: CATEGORY_TYPES.custom },
        { key: 'childSupport', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.investments,
      values: [
        { key: 'realty', type: CATEGORY_TYPES.custom },
        { key: 'vehiclesChattels', type: CATEGORY_TYPES.custom },
        { key: 'financialInvestments', type: CATEGORY_TYPES.custom },
        { key: 'savings', type: CATEGORY_TYPES.custom },
        { key: 'collections', type: CATEGORY_TYPES.custom },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.income,
      values: [
        { key: 'wageInvoices', type: CATEGORY_TYPES.custom },
        { key: 'interestsDividends', type: CATEGORY_TYPES.custom },
        { key: 'sale', type: CATEGORY_TYPES.custom },
        { key: 'rentalIncome', type: CATEGORY_TYPES.custom },
        { key: 'duesGrants', type: CATEGORY_TYPES.custom },
        { key: 'lendingRenting', type: CATEGORY_TYPES.custom },
        { key: 'checksCoupons', type: CATEGORY_TYPES.custom },
        { key: 'lotteryGambling', type: CATEGORY_TYPES.custom },
        { key: 'refunds', type: CATEGORY_TYPES.custom },
        { key: 'freelance', type: CATEGORY_TYPES.custom },
        { key: 'gifts', type: CATEGORY_TYPES.custom },
      ],
    },
  ],
  defaultCategoryKey: CATEGORY_KEYS.other,
});

/**
 * Get translated default categories for a given locale.
 * Returns category structure with names resolved via i18n.
 */
export function getTranslatedCategories({ locale }: { locale: string }) {
  // Debug: log first translation to verify i18n is working
  const testKey = 'defaultCategories.main.food';
  const testTranslation = t({ key: testKey, locale });
  if (testTranslation === testKey) {
    logger.warn(`i18n translation failed: "${testKey}" returned key instead of translation. Locale: ${locale}`);
  } else {
    logger.info(`i18n working: "${testKey}" -> "${testTranslation}"`);
  }

  return {
    main: DEFAULT_CATEGORY_STRUCTURE.main.map((cat) => ({
      name: t({ key: `defaultCategories.main.${cat.key}`, locale }),
      type: cat.type,
      color: cat.color,
      key: cat.key, // Keep key for subcategory matching
    })),
    subcategories: DEFAULT_CATEGORY_STRUCTURE.subcategories.map((subcat) => ({
      parentKey: subcat.parentKey,
      values: subcat.values.map((sub) => ({
        name: t({ key: `defaultCategories.subcategories.${subcat.parentKey}.${sub.key}`, locale }),
        type: sub.type,
      })),
    })),
    defaultCategoryKey: DEFAULT_CATEGORY_STRUCTURE.defaultCategoryKey,
  };
}
