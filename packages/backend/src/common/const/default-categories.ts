import { CATEGORY_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { logger } from '@js/utils/logger';

/**
 * Keys for category translation lookup.
 * These map to keys in i18n files under "defaultCategories.main.*"
 */
const CATEGORY_KEYS = Object.freeze({
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
const DEFAULT_CATEGORY_STRUCTURE = Object.freeze({
  main: [
    { key: CATEGORY_KEYS.food, type: CATEGORY_TYPES.custom, color: '#e74c3c', icon: 'food-20-filled' },
    { key: CATEGORY_KEYS.shopping, type: CATEGORY_TYPES.custom, color: '#3498db', icon: 'shopping-bag-20-filled' },
    { key: CATEGORY_KEYS.housing, type: CATEGORY_TYPES.custom, color: '#e67e22', icon: 'home-20-filled' },
    { key: CATEGORY_KEYS.transportation, type: CATEGORY_TYPES.custom, color: '#95a5a6', icon: 'vehicle-bus-20-filled' },
    { key: CATEGORY_KEYS.vehicle, type: CATEGORY_TYPES.custom, color: '#8e44ad', icon: 'vehicle-car-20-filled' },
    { key: CATEGORY_KEYS.life, type: CATEGORY_TYPES.custom, color: '#2ecc71', icon: 'heart-20-filled' },
    { key: CATEGORY_KEYS.communication, type: CATEGORY_TYPES.custom, color: '#2980b9', icon: 'phone-20-filled' },
    { key: CATEGORY_KEYS.financialExpenses, type: CATEGORY_TYPES.custom, color: '#16a085', icon: 'receipt-20-filled' },
    { key: CATEGORY_KEYS.investments, type: CATEGORY_TYPES.custom, color: '#fda7df', icon: 'arrow-trending-20-filled' },
    { key: CATEGORY_KEYS.income, type: CATEGORY_TYPES.custom, color: '#f1c40f', icon: 'wallet-20-filled' },
    { key: CATEGORY_KEYS.other, type: CATEGORY_TYPES.internal, color: '#7f8c8d', icon: 'more-horizontal-20-filled' },
  ],
  subcategories: [
    {
      parentKey: CATEGORY_KEYS.food,
      values: [
        { key: 'groceries', type: CATEGORY_TYPES.custom, icon: 'cart-20-filled' },
        { key: 'restaurant', type: CATEGORY_TYPES.custom, icon: 'food-pizza-20-filled' },
        { key: 'barCafe', type: CATEGORY_TYPES.custom, icon: 'drink-coffee-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.shopping,
      values: [
        { key: 'clothesShoes', type: CATEGORY_TYPES.custom, icon: 'clothes-hanger-20-filled' },
        { key: 'jewelsAccessories', type: CATEGORY_TYPES.custom, icon: 'diamond-20-filled' },
        { key: 'healthBeauty', type: CATEGORY_TYPES.custom, icon: 'sparkle-20-filled' },
        { key: 'kids', type: CATEGORY_TYPES.custom, icon: 'people-20-filled' },
        { key: 'homeGarden', type: CATEGORY_TYPES.custom, icon: 'plant-grass-20-filled' },
        { key: 'petsAnimals', type: CATEGORY_TYPES.custom, icon: 'animal-dog-20-filled' },
        { key: 'electronicsAccessories', type: CATEGORY_TYPES.custom, icon: 'laptop-20-filled' },
        { key: 'giftsJoy', type: CATEGORY_TYPES.custom, icon: 'gift-20-filled' },
        { key: 'stationeryTools', type: CATEGORY_TYPES.custom, icon: 'pen-20-filled' },
        { key: 'freeTime', type: CATEGORY_TYPES.custom, icon: 'games-20-filled' },
        { key: 'drugstoreChemist', type: CATEGORY_TYPES.custom, icon: 'pill-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.housing,
      values: [
        { key: 'rent', type: CATEGORY_TYPES.custom, icon: 'key-20-filled' },
        { key: 'mortgage', type: CATEGORY_TYPES.custom, icon: 'building-bank-20-filled' },
        { key: 'energyUtilities', type: CATEGORY_TYPES.custom, icon: 'flash-20-filled' },
        { key: 'services', type: CATEGORY_TYPES.custom, icon: 'wrench-20-filled' },
        { key: 'maintenanceRepairs', type: CATEGORY_TYPES.custom, icon: 'toolbox-20-filled' },
        { key: 'propertyInsurance', type: CATEGORY_TYPES.custom, icon: 'shield-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.transportation,
      values: [
        { key: 'publicTransport', type: CATEGORY_TYPES.custom, icon: 'ticket-20-filled' },
        { key: 'taxi', type: CATEGORY_TYPES.custom, icon: 'vehicle-cab-20-filled' },
        { key: 'longDistance', type: CATEGORY_TYPES.custom, icon: 'airplane-20-filled' },
        { key: 'businessTrips', type: CATEGORY_TYPES.custom, icon: 'briefcase-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.vehicle,
      values: [
        { key: 'fuel', type: CATEGORY_TYPES.custom, icon: 'gas-pump-20-filled' },
        { key: 'parking', type: CATEGORY_TYPES.custom, icon: 'vehicle-car-parking-20-filled' },
        { key: 'vehicleMaintenance', type: CATEGORY_TYPES.custom, icon: 'toolbox-20-filled' },
        { key: 'rentals', type: CATEGORY_TYPES.custom, icon: 'key-20-filled' },
        { key: 'vehicleInsurance', type: CATEGORY_TYPES.custom, icon: 'shield-20-filled' },
        { key: 'leasing', type: CATEGORY_TYPES.custom, icon: 'document-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.life,
      values: [
        { key: 'healthCareDoctor', type: CATEGORY_TYPES.custom, icon: 'stethoscope-20-filled' },
        { key: 'wellnessBeauty', type: CATEGORY_TYPES.custom, icon: 'sparkle-20-filled' },
        { key: 'activeSportFitness', type: CATEGORY_TYPES.custom, icon: 'sport-20-filled' },
        { key: 'cultureSportEvents', type: CATEGORY_TYPES.custom, icon: 'ticket-20-filled' },
        { key: 'hobbies', type: CATEGORY_TYPES.custom, icon: 'puzzle-piece-20-filled' },
        { key: 'educationDevelopment', type: CATEGORY_TYPES.custom, icon: 'hat-graduation-20-filled' },
        { key: 'booksAudioSubscriptions', type: CATEGORY_TYPES.custom, icon: 'book-20-filled' },
        { key: 'tvStreaming', type: CATEGORY_TYPES.custom, icon: 'tv-20-filled' },
        { key: 'holidayTripsHotels', type: CATEGORY_TYPES.custom, icon: 'beach-20-filled' },
        { key: 'charityGifts', type: CATEGORY_TYPES.custom, icon: 'gift-20-filled' },
        { key: 'alcoholTobacco', type: CATEGORY_TYPES.custom, icon: 'drink-wine-20-filled' },
        { key: 'lotteryGambling', type: CATEGORY_TYPES.custom, icon: 'games-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.communication,
      values: [
        { key: 'phoneCellPhone', type: CATEGORY_TYPES.custom, icon: 'call-20-filled' },
        { key: 'internet', type: CATEGORY_TYPES.custom, icon: 'globe-20-filled' },
        { key: 'softwareAppsGames', type: CATEGORY_TYPES.custom, icon: 'apps-20-filled' },
        { key: 'postalServices', type: CATEGORY_TYPES.custom, icon: 'mail-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.financialExpenses,
      values: [
        { key: 'taxes', type: CATEGORY_TYPES.custom, icon: 'calculator-20-filled' },
        { key: 'insurances', type: CATEGORY_TYPES.custom, icon: 'shield-20-filled' },
        { key: 'loanInterests', type: CATEGORY_TYPES.custom, icon: 'money-20-filled' },
        { key: 'fines', type: CATEGORY_TYPES.custom, icon: 'gavel-20-filled' },
        { key: 'advisory', type: CATEGORY_TYPES.custom, icon: 'person-support-20-filled' },
        { key: 'chargesFees', type: CATEGORY_TYPES.custom, icon: 'receipt-money-20-filled' },
        { key: 'childSupport', type: CATEGORY_TYPES.custom, icon: 'people-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.investments,
      values: [
        { key: 'realty', type: CATEGORY_TYPES.custom, icon: 'building-20-filled' },
        { key: 'vehiclesChattels', type: CATEGORY_TYPES.custom, icon: 'vehicle-car-20-filled' },
        { key: 'financialInvestments', type: CATEGORY_TYPES.custom, icon: 'chart-multiple-20-filled' },
        { key: 'savings', type: CATEGORY_TYPES.custom, icon: 'wallet-credit-card-20-filled' },
        { key: 'collections', type: CATEGORY_TYPES.custom, icon: 'bookmark-20-filled' },
      ],
    },
    {
      parentKey: CATEGORY_KEYS.income,
      values: [
        { key: 'wageInvoices', type: CATEGORY_TYPES.custom, icon: 'money-20-filled' },
        { key: 'interestsDividends', type: CATEGORY_TYPES.custom, icon: 'money-calculator-20-filled' },
        { key: 'sale', type: CATEGORY_TYPES.custom, icon: 'tag-20-filled' },
        { key: 'rentalIncome', type: CATEGORY_TYPES.custom, icon: 'building-20-filled' },
        { key: 'duesGrants', type: CATEGORY_TYPES.custom, icon: 'certificate-20-filled' },
        { key: 'lendingRenting', type: CATEGORY_TYPES.custom, icon: 'handshake-20-filled' },
        { key: 'checksCoupons', type: CATEGORY_TYPES.custom, icon: 'receipt-bag-20-filled' },
        { key: 'lotteryGambling', type: CATEGORY_TYPES.custom, icon: 'games-20-filled' },
        { key: 'refunds', type: CATEGORY_TYPES.custom, icon: 'arrow-undo-20-filled' },
        { key: 'freelance', type: CATEGORY_TYPES.custom, icon: 'briefcase-20-filled' },
        { key: 'gifts', type: CATEGORY_TYPES.custom, icon: 'gift-20-filled' },
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
      icon: cat.icon,
      key: cat.key, // Keep key for subcategory matching
    })),
    subcategories: DEFAULT_CATEGORY_STRUCTURE.subcategories.map((subcat) => ({
      parentKey: subcat.parentKey,
      values: subcat.values.map((sub) => ({
        name: t({ key: `defaultCategories.subcategories.${subcat.parentKey}.${sub.key}`, locale }),
        type: sub.type,
        icon: sub.icon,
      })),
    })),
    defaultCategoryKey: DEFAULT_CATEGORY_STRUCTURE.defaultCategoryKey,
  };
}
