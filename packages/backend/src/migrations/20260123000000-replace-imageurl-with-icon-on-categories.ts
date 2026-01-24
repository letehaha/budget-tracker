import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to replace imageUrl with icon on Categories and Tags tables.
 * - Adds icon column (VARCHAR(50), nullable) to Categories
 * - Fixes "Veniche" typo to "Vehicle"
 * - Updates existing main categories with appropriate icons based on name matching (EN + UK)
 * - Converts any old icon names (Lucide/Solar) to Fluent equivalents in both Tags and Categories
 * - Drops imageUrl column from Categories
 */

// Name-to-icon mapping for existing categories (using Fluent 20-filled icons)
// Includes both English and Ukrainian translations
const CATEGORY_NAME_TO_ICON: Record<string, string> = {
  // English
  'Food & Drinks': 'food-20-filled',
  Shopping: 'shopping-bag-20-filled',
  Housing: 'home-20-filled',
  Transportation: 'vehicle-bus-20-filled',
  Vehicle: 'vehicle-car-20-filled',
  'Life & Entertainment': 'heart-20-filled',
  'Communication, PC': 'phone-20-filled',
  'Financial expenses': 'receipt-20-filled',
  Investments: 'arrow-trending-20-filled',
  Income: 'wallet-20-filled',
  Other: 'more-horizontal-20-filled',
  // Ukrainian
  'Їжа та напої': 'food-20-filled',
  Покупки: 'shopping-bag-20-filled',
  Житло: 'home-20-filled',
  Транспорт: 'vehicle-bus-20-filled',
  Авто: 'vehicle-car-20-filled',
  'Життя та розваги': 'heart-20-filled',
  "Зв'язок, ПК": 'phone-20-filled',
  'Фінансові витрати': 'receipt-20-filled',
  Інвестиції: 'arrow-trending-20-filled',
  Дохід: 'wallet-20-filled',
  Інше: 'more-horizontal-20-filled',
};

// Subcategory name-to-icon mapping (EN + UK)
const SUBCATEGORY_NAME_TO_ICON: Record<string, string> = {
  // Food & Drinks
  Groceries: 'cart-20-filled',
  'Restaurant, fast-food': 'food-pizza-20-filled',
  'Bar, cafe': 'drink-coffee-20-filled',
  Продукти: 'cart-20-filled',
  'Ресторан, фаст-фуд': 'food-pizza-20-filled',
  'Бар, кафе': 'drink-coffee-20-filled',

  // Shopping
  'Clothes & shoes': 'clothes-hanger-20-filled',
  'Jewels, accessories': 'diamond-20-filled',
  'Health and beauty': 'sparkle-20-filled',
  Kids: 'people-20-filled',
  'Home, garden': 'plant-grass-20-filled',
  'Pets, animals': 'animal-dog-20-filled',
  'Electronics, accessories': 'laptop-20-filled',
  'Gifts, joy': 'gift-20-filled',
  'Stationery, tools': 'pen-20-filled',
  'Free time': 'games-20-filled',
  'Drug-store, chemist': 'pill-20-filled',
  'Одяг та взуття': 'clothes-hanger-20-filled',
  'Прикраси, аксесуари': 'diamond-20-filled',
  "Здоров'я та краса": 'sparkle-20-filled',
  Діти: 'people-20-filled',
  'Дім, сад': 'plant-grass-20-filled',
  'Домашні тварини': 'animal-dog-20-filled',
  'Електроніка, аксесуари': 'laptop-20-filled',
  'Подарунки, радість': 'gift-20-filled',
  'Канцелярія, інструменти': 'pen-20-filled',
  'Вільний час': 'games-20-filled',
  'Аптека, хімія': 'pill-20-filled',

  // Housing
  Rent: 'key-20-filled',
  Mortgage: 'building-bank-20-filled',
  'Energy, utilities': 'flash-20-filled',
  Services: 'wrench-20-filled',
  'Maintenance, repairs': 'toolbox-20-filled',
  'Property insurance': 'shield-20-filled',
  Оренда: 'key-20-filled',
  Іпотека: 'building-bank-20-filled',
  'Енергія, комунальні': 'flash-20-filled',
  Послуги: 'wrench-20-filled',
  'Обслуговування, ремонт': 'toolbox-20-filled',
  'Страхування нерухомості': 'shield-20-filled',

  // Transportation
  'Public transport': 'ticket-20-filled',
  Taxi: 'vehicle-cab-20-filled',
  'Long distance': 'airplane-20-filled',
  'Business trips': 'briefcase-20-filled',
  'Громадський транспорт': 'ticket-20-filled',
  Таксі: 'vehicle-cab-20-filled',
  'Далекі поїздки': 'airplane-20-filled',
  Відрядження: 'briefcase-20-filled',

  // Vehicle
  Fuel: 'gas-pump-20-filled',
  Parking: 'vehicle-car-parking-20-filled',
  'Vehicle maintenance': 'toolbox-20-filled',
  Rentals: 'key-20-filled',
  'Vehicle insurance': 'shield-20-filled',
  Leasing: 'document-20-filled',
  Пальне: 'gas-pump-20-filled',
  Паркування: 'vehicle-car-parking-20-filled',
  'Обслуговування авто': 'toolbox-20-filled',
  // 'Оренда' already defined above (same icon)
  'Страхування авто': 'shield-20-filled',
  Лізинг: 'document-20-filled',

  // Life & Entertainment
  'Health care, doctor': 'stethoscope-20-filled',
  'Wellness, beauty': 'sparkle-20-filled',
  'Active sport, fitness': 'sport-20-filled',
  'Culture, sport events': 'ticket-20-filled',
  Hobbies: 'puzzle-piece-20-filled',
  'Education, development': 'hat-graduation-20-filled',
  'Books, audio, subscriptions': 'book-20-filled',
  'TV, Streaming': 'tv-20-filled',
  'Holiday, trips, hotels': 'beach-20-filled',
  'Charity, gifts': 'gift-20-filled',
  'Alcohol, tobacco': 'drink-wine-20-filled',
  'Lottery, gambling': 'games-20-filled',
  'Медицина, лікар': 'stethoscope-20-filled',
  'Велнес, краса': 'sparkle-20-filled',
  'Активний спорт, фітнес': 'sport-20-filled',
  'Культура, спортивні події': 'ticket-20-filled',
  Хобі: 'puzzle-piece-20-filled',
  'Освіта, розвиток': 'hat-graduation-20-filled',
  'Книги, аудіо, підписки': 'book-20-filled',
  'ТБ, стрімінг': 'tv-20-filled',
  'Відпустка, подорожі, готелі': 'beach-20-filled',
  'Благодійність, подарунки': 'gift-20-filled',
  'Алкоголь, тютюн': 'drink-wine-20-filled',
  'Лотерея, азартні ігри': 'games-20-filled',

  // Communication, PC
  'Phone, cell phone': 'call-20-filled',
  Internet: 'globe-20-filled',
  'Software, apps, games': 'apps-20-filled',
  'Postal services': 'mail-20-filled',
  'Телефон, мобільний': 'call-20-filled',
  Інтернет: 'globe-20-filled',
  'Програми, додатки, ігри': 'apps-20-filled',
  'Поштові послуги': 'mail-20-filled',

  // Financial Expenses
  Taxes: 'calculator-20-filled',
  Insurances: 'shield-20-filled',
  'Loan, interests': 'money-20-filled',
  Fines: 'gavel-20-filled',
  Advisory: 'person-support-20-filled',
  'Charges, Fees': 'receipt-money-20-filled',
  'Child Support': 'people-20-filled',
  Податки: 'calculator-20-filled',
  Страхування: 'shield-20-filled',
  'Кредит, відсотки': 'money-20-filled',
  Штрафи: 'gavel-20-filled',
  Консультації: 'person-support-20-filled',
  'Збори, комісії': 'receipt-money-20-filled',
  Аліменти: 'people-20-filled',

  // Investments
  Realty: 'building-20-filled',
  'Vehicles, chattels': 'vehicle-car-20-filled',
  'Financial investments': 'chart-multiple-20-filled',
  Savings: 'wallet-credit-card-20-filled',
  Collections: 'bookmark-20-filled',
  Нерухомість: 'building-20-filled',
  'Транспорт, майно': 'vehicle-car-20-filled',
  'Фінансові інвестиції': 'chart-multiple-20-filled',
  Заощадження: 'wallet-credit-card-20-filled',
  Колекції: 'bookmark-20-filled',

  // Income
  'Wage, invoices': 'money-20-filled',
  'Interests, dividends': 'money-calculator-20-filled',
  Sale: 'tag-20-filled',
  'Rental income': 'building-20-filled',
  'Dues & grants': 'certificate-20-filled',
  'Lending, renting': 'handshake-20-filled',
  'Checks, coupons': 'receipt-bag-20-filled',
  // 'Lottery, gambling' already defined above (same icon)
  'Refunds (tax, purchase)': 'arrow-undo-20-filled',
  Freelance: 'briefcase-20-filled',
  Gifts: 'gift-20-filled',
  'Зарплата, рахунки': 'money-20-filled',
  'Відсотки, дивіденди': 'money-calculator-20-filled',
  Продаж: 'tag-20-filled',
  'Дохід від оренди': 'building-20-filled',
  'Внески та гранти': 'certificate-20-filled',
  'Позики, здача в оренду': 'handshake-20-filled',
  'Чеки, купони': 'receipt-bag-20-filled',
  // 'Лотерея, азартні ігри' already defined above (same icon)
  'Повернення (податки, покупки)': 'arrow-undo-20-filled',
  Фріланс: 'briefcase-20-filled',
  Подарунки: 'gift-20-filled',
};

// Mapping from old icon names (Lucide/Solar) to Fluent equivalents
const OLD_TO_FLUENT: Record<string, string> = {
  // Lucide icons
  utensils: 'food-20-filled',
  'shopping-bag': 'shopping-bag-20-filled',
  house: 'home-20-filled',
  bus: 'vehicle-bus-20-filled',
  car: 'vehicle-car-20-filled',
  heart: 'heart-20-filled',
  smartphone: 'phone-20-filled',
  receipt: 'receipt-20-filled',
  'trending-up': 'arrow-trending-20-filled',
  wallet: 'wallet-20-filled',
  ellipsis: 'more-horizontal-20-filled',
  // Solar bold icons
  'chef-hat-bold': 'food-20-filled',
  'bag-bold': 'shopping-bag-20-filled',
  'home-bold': 'home-20-filled',
  'bus-bold': 'vehicle-bus-20-filled',
  'wheel-bold': 'vehicle-car-20-filled',
  'heart-bold': 'heart-20-filled',
  'smartphone-bold': 'phone-20-filled',
  'bill-bold': 'receipt-20-filled',
  'graph-up-bold': 'arrow-trending-20-filled',
  'wallet-2-bold': 'wallet-20-filled',
  'menu-dots-bold': 'more-horizontal-20-filled',
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Step 1: Add icon column
      await queryInterface.addColumn(
        'Categories',
        'icon',
        {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        { transaction: t },
      );

      // Step 2: Fix typo: rename "Veniche" to "Vehicle"
      await queryInterface.sequelize.query(`UPDATE "Categories" SET name = 'Vehicle' WHERE LOWER(name) = 'veniche'`, {
        transaction: t,
      });

      // Step 3: Update main categories (parentId IS NULL) with icons based on name
      for (const [name, icon] of Object.entries(CATEGORY_NAME_TO_ICON)) {
        await queryInterface.sequelize.query(
          `UPDATE "Categories" SET icon = :icon WHERE name = :name AND "parentId" IS NULL`,
          {
            replacements: { icon, name },
            transaction: t,
          },
        );
      }

      // Step 4: Update subcategories (parentId IS NOT NULL) with icons based on name
      for (const [name, icon] of Object.entries(SUBCATEGORY_NAME_TO_ICON)) {
        await queryInterface.sequelize.query(
          `UPDATE "Categories" SET icon = :icon WHERE name = :name AND "parentId" IS NOT NULL`,
          {
            replacements: { icon, name },
            transaction: t,
          },
        );
      }

      // Step 5: Convert any old icon names (Lucide/Solar) to Fluent in Tags table
      for (const [oldIcon, fluentIcon] of Object.entries(OLD_TO_FLUENT)) {
        await queryInterface.sequelize.query(`UPDATE "Tags" SET icon = :fluentIcon WHERE icon = :oldIcon`, {
          replacements: { oldIcon, fluentIcon },
          transaction: t,
        });
      }

      // Step 6: Convert any old icon names in Categories table (for any that weren't matched by name)
      for (const [oldIcon, fluentIcon] of Object.entries(OLD_TO_FLUENT)) {
        await queryInterface.sequelize.query(`UPDATE "Categories" SET icon = :fluentIcon WHERE icon = :oldIcon`, {
          replacements: { oldIcon, fluentIcon },
          transaction: t,
        });
      }

      // Step 7: Drop imageUrl column
      await queryInterface.removeColumn('Categories', 'imageUrl', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Restore imageUrl column
      await queryInterface.addColumn(
        'Categories',
        'imageUrl',
        {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        { transaction: t },
      );

      // Drop icon column
      await queryInterface.removeColumn('Categories', 'icon', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
