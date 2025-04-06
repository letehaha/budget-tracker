import { CATEGORY_TYPES } from '@bt/shared/types';

const CATEGORY_NAMES = Object.freeze({
  food: 'Food & Drinks',
  shopping: 'Shopping',
  housing: 'Housing',
  transportation: 'Transportation',
  veniche: 'Veniche',
  life: 'Life & Entertainment',
  communication: 'Communication, PC',
  financialExpenses: 'Financial expenses',
  investments: 'Investments',
  income: 'Income',
  other: 'Other',
});

export const DEFAULT_CATEGORIES = Object.freeze({
  main: [
    {
      name: CATEGORY_NAMES.food,
      type: CATEGORY_TYPES.custom,
      color: '#e74c3c',
    },
    {
      name: CATEGORY_NAMES.shopping,
      type: CATEGORY_TYPES.custom,
      color: '#3498db',
    },
    {
      name: CATEGORY_NAMES.housing,
      type: CATEGORY_TYPES.custom,
      color: '#e67e22',
    },
    {
      name: CATEGORY_NAMES.transportation,
      type: CATEGORY_TYPES.custom,
      color: '#95a5a6',
    },
    {
      name: CATEGORY_NAMES.veniche,
      type: CATEGORY_TYPES.custom,
      color: '#8e44ad',
    },
    {
      name: CATEGORY_NAMES.life,
      type: CATEGORY_TYPES.custom,
      color: '#2ecc71',
    },
    {
      name: CATEGORY_NAMES.communication,
      type: CATEGORY_TYPES.custom,
      color: '#2980b9',
    },
    {
      name: CATEGORY_NAMES.financialExpenses,
      type: CATEGORY_TYPES.custom,
      color: '#16a085',
    },
    {
      name: CATEGORY_NAMES.investments,
      type: CATEGORY_TYPES.custom,
      color: '#fda7df',
    },
    {
      name: CATEGORY_NAMES.income,
      type: CATEGORY_TYPES.custom,
      color: '#f1c40f',
    },
    {
      name: CATEGORY_NAMES.other,
      type: CATEGORY_TYPES.internal,
      color: '#7f8c8d',
    },
  ],
  subcategories: [
    {
      parentName: CATEGORY_NAMES.food,
      values: [
        {
          name: 'Groceries',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Restaurane, fast-food',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Bar, cafe',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.shopping,
      values: [
        {
          name: 'Clothes & shoes',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Jewels, accessories',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Health and beauty',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Kids',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Home, garden',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Pets, animals',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Electronics, accessories',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Gifts, joy',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Stationery, tools',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Free time',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Drug-store, chemist',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.housing,
      values: [
        {
          name: 'Rent',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Mortgage',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Energy, utilities',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Services',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Maintenance, repairs',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Property insurance',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.transportation,
      values: [
        {
          name: 'Public transport',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Taxi',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Long distance',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Business trips',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.veniche,
      values: [
        {
          name: 'Fuel',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Parking',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Vaniche maintenance',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Rentals',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Venicle insurance',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Leasing',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.life,
      values: [
        {
          name: 'Helth care, doctor',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Wellness, beauty',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Active sport, fitness',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Culture, sport events',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Hobbies',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Education, development',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Books, audio, subscriptions',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'TV, Streaming',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Holiday, trips, hotels',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Charity, gifts',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Alcohol, tobacco',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Lottery, gambling',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.communication,
      values: [
        {
          name: 'Phone, cell phone',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Internet',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Software, apps, games',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Postal services',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.financialExpenses,
      values: [
        {
          name: 'Taxes',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Insurances',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Loan, interests',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Fines',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Advisory',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Charges, Fees',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Child Support',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.investments,
      values: [
        {
          name: 'Realty',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Venicles, chattels',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Financial investments',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Savings',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Collections',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
    {
      parentName: CATEGORY_NAMES.income,
      values: [
        {
          name: 'Wage, invoices',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Interests, dividends',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Sale',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Rental income',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Dues & grants',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Lending, renting',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Checks, coupons',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Lottery, gambling',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Refunds (tax, purchase)',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Freelance',
          type: CATEGORY_TYPES.custom,
        },
        {
          name: 'Gifts',
          type: CATEGORY_TYPES.custom,
        },
      ],
    },
  ],
  names: CATEGORY_NAMES,
});
