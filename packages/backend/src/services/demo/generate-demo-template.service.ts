import { PAYMENT_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import { addDays, eachDayOfInterval, endOfMonth, isWeekend, setDate, startOfMonth, subMonths } from 'date-fns';

import { DEMO_CONFIG } from './seed-demo-data.service';

interface DemoTemplateTransaction {
  accountKey: string;
  categoryKey: string;
  amount: number; // cents (always positive)
  transactionType: TRANSACTION_TYPES;
  dayOffset: number; // days before generatedAt (0 = generatedAt day, 1 = day before, etc.)
  note: string;
  paymentType: PAYMENT_TYPES;
}

export interface DemoTemplate {
  generatedAt: Date;
  transactions: DemoTemplateTransaction[];
}

interface RecurringItem {
  dayOfMonth: number;
  amount: number | { min: number; max: number };
  transactionType: TRANSACTION_TYPES;
  categoryKey: string;
  note: string;
  paymentType: PAYMENT_TYPES;
}

const RECURRING_MONTHLY: RecurringItem[] = [
  {
    dayOfMonth: 1,
    amount: { min: 420000, max: 480000 },
    transactionType: TRANSACTION_TYPES.income,
    categoryKey: 'income',
    note: 'Monthly Salary',
    paymentType: PAYMENT_TYPES.bankTransfer,
  },
  {
    dayOfMonth: 5,
    amount: 140000,
    transactionType: TRANSACTION_TYPES.expense,
    categoryKey: 'housing',
    note: 'Monthly Rent',
    paymentType: PAYMENT_TYPES.bankTransfer,
  },
  {
    dayOfMonth: 1,
    amount: 4500,
    transactionType: TRANSACTION_TYPES.expense,
    categoryKey: 'life',
    note: 'Gym Membership',
    paymentType: PAYMENT_TYPES.debitCard,
  },
  {
    dayOfMonth: 15,
    amount: 1599,
    transactionType: TRANSACTION_TYPES.expense,
    categoryKey: 'life',
    note: 'Netflix Subscription',
    paymentType: PAYMENT_TYPES.debitCard,
  },
  {
    dayOfMonth: 10,
    amount: 999,
    transactionType: TRANSACTION_TYPES.expense,
    categoryKey: 'life',
    note: 'Spotify Premium',
    paymentType: PAYMENT_TYPES.debitCard,
  },
  {
    dayOfMonth: 20,
    amount: { min: 8000, max: 18000 },
    transactionType: TRANSACTION_TYPES.expense,
    categoryKey: 'housing',
    note: 'Utilities Bill',
    paymentType: PAYMENT_TYPES.bankTransfer,
  },
  {
    dayOfMonth: 25,
    amount: 6500,
    transactionType: TRANSACTION_TYPES.expense,
    categoryKey: 'housing',
    note: 'Internet Service',
    paymentType: PAYMENT_TYPES.bankTransfer,
  },
];

/**
 * Generates a pure demo data template without touching the database.
 * Uses a fixed faker seed for reproducible data across all demo users.
 * Transactions use symbolic keys (accountKey, categoryKey) and dayOffsets
 * instead of DB IDs and absolute dates.
 */
export function generateDemoTemplate(): DemoTemplate {
  faker.seed(12345);

  const generatedAt = new Date();
  const startDate = subMonths(generatedAt, DEMO_CONFIG.historyMonths);

  const transactions: DemoTemplateTransaction[] = [];

  let currentDate = startDate;
  while (currentDate <= generatedAt) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    // Recurring monthly transactions (salary, rent, subscriptions, utilities)
    for (const item of RECURRING_MONTHLY) {
      const date = setDate(currentDate, item.dayOfMonth);
      if (date >= startDate && date <= generatedAt) {
        const resolvedAmount = typeof item.amount === 'number' ? item.amount : faker.number.int(item.amount);

        transactions.push({
          amount: resolvedAmount,
          transactionType: item.transactionType,
          categoryKey: item.categoryKey,
          accountKey: 'main_checking',
          dayOffset: daysBetween({ from: date, to: generatedAt }),
          note: item.note,
          paymentType: item.paymentType,
        });
      }
    }

    // Variable expenses throughout the month
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    for (const day of daysInMonth) {
      if (day < startDate || day > generatedAt) continue;
      const offset = daysBetween({ from: day, to: generatedAt });

      // Groceries - 2-3x per week
      if (faker.number.int({ min: 1, max: 3 }) === 1) {
        transactions.push({
          amount: faker.number.int({ min: 4000, max: 12000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'food',
          accountKey: 'main_checking',
          dayOffset: offset,
          note: faker.helpers.arrayElement(['Whole Foods', "Trader Joe's", 'Costco', 'Safeway', 'Local Market']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Dining out - 1-2x per week
      if (faker.number.int({ min: 1, max: 5 }) === 1) {
        transactions.push({
          amount: faker.number.int({ min: 2500, max: 8000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'food',
          accountKey: 'main_checking',
          dayOffset: offset,
          note: faker.helpers.arrayElement(['Restaurant', 'Chipotle', 'Sushi Place', 'Italian Bistro', 'Thai Kitchen']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Coffee - 3-4x per week (weekdays mostly)
      if (!isWeekend(day) && faker.number.int({ min: 1, max: 2 }) === 1) {
        transactions.push({
          amount: faker.number.int({ min: 400, max: 800 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'food',
          accountKey: 'main_checking',
          dayOffset: offset,
          note: faker.helpers.arrayElement(['Starbucks', 'Local Coffee Shop', "Dunkin'", 'Blue Bottle']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Transport - weekly (Mondays)
      if (day.getDay() === 1) {
        transactions.push({
          amount: faker.number.int({ min: 3000, max: 6000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'transportation',
          accountKey: 'main_checking',
          dayOffset: offset,
          note: faker.helpers.arrayElement(['Uber', 'Gas Station', 'Metro Card', 'Parking']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Random entertainment - occasional
      if (faker.number.int({ min: 1, max: 10 }) === 1) {
        transactions.push({
          amount: faker.number.int({ min: 1500, max: 8000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'life',
          accountKey: 'main_checking',
          dayOffset: offset,
          note: faker.helpers.arrayElement(['Movie Theater', 'Concert Tickets', 'Bowling', 'Arcade', 'Mini Golf']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }

      // Shopping - occasional
      if (faker.number.int({ min: 1, max: 15 }) === 1) {
        transactions.push({
          amount: faker.number.int({ min: 10000, max: 50000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'shopping',
          accountKey: 'main_checking',
          dayOffset: offset,
          note: faker.helpers.arrayElement(['Amazon', 'Target', 'Best Buy', 'Nike', 'Apple Store']),
          paymentType: PAYMENT_TYPES.debitCard,
        });
      }
    }

    // Travel expenses on travel card (occasional, in EUR)
    if (faker.number.int({ min: 1, max: 3 }) === 1) {
      const travelDay = faker.date.between({ from: monthStart, to: monthEnd });
      if (travelDay >= startDate && travelDay <= generatedAt) {
        transactions.push({
          amount: faker.number.int({ min: 5000, max: 30000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'life',
          accountKey: 'travel_card',
          dayOffset: daysBetween({ from: travelDay, to: generatedAt }),
          note: faker.helpers.arrayElement([
            'Hotel Booking',
            'Flight Ticket',
            'Train Ticket',
            'Airbnb',
            'Travel Insurance',
          ]),
          paymentType: PAYMENT_TYPES.creditCard,
        });
      }
    }

    // Cash withdrawals and expenses (PLN)
    if (faker.number.int({ min: 1, max: 4 }) === 1) {
      const cashDay = faker.date.between({ from: monthStart, to: monthEnd });
      if (cashDay >= startDate && cashDay <= generatedAt) {
        transactions.push({
          amount: faker.number.int({ min: 5000, max: 20000 }),
          transactionType: TRANSACTION_TYPES.expense,
          categoryKey: 'other',
          accountKey: 'cash',
          dayOffset: daysBetween({ from: cashDay, to: generatedAt }),
          note: faker.helpers.arrayElement(['Local Market', 'Street Food', 'Tips', 'Small Purchases']),
          paymentType: PAYMENT_TYPES.cash,
        });
      }
    }

    // Move to next month
    currentDate = addDays(monthEnd, 1);
  }

  // Reset faker to random mode to avoid polluting global state (e.g. in e2e tests)
  faker.seed();

  return { generatedAt, transactions };
}

function daysBetween({ from, to }: { from: Date; to: Date }): number {
  const msPerDay = 86400000;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / msPerDay));
}
