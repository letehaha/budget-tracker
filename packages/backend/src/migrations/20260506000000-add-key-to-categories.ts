import { DataTypes, QueryTypes } from '@sequelize/core';
import type { AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Adds a stable `key` column to `Categories` and best-effort backfills it for existing
 * users whose seeded categories were never renamed.
 *
 * `key` is a kebab-case identifier shared with the seed structure in
 * `default-categories.ts`. New users have it stamped at signup; existing users get it
 * via this backfill, matched purely by the row's stored `name` against a flat snapshot
 * of every supported locale's seed names.
 *
 * Why match by raw name across all locales (not by user's current locale): a user may
 * have signed up on `uk` (rows seeded with Ukrainian names) and later switched their
 * settings to `en`. Filtering by current locale would silently miss every one of their
 * categories. Flattening across locales is safe because (a) en/uk use different scripts
 * so normalized names don't collide and (b) within-locale duplicates (e.g. uk "Оренда"
 * under both `housing.rent` and `vehicle.rentals`) stay disambiguated by per-parent
 * scoping in the subcategory pass.
 *
 * Per project convention migrations are frozen history and cannot import from `src/services`
 * or `src/common` (the prod Docker image only ships `src/migrations`). The per-locale
 * snapshot is therefore inlined verbatim from the locale JSON at the time of writing.
 * Misses (renamed by user, deleted-then-recreated) leave `key` NULL — that's intentional;
 * downstream features fall back to name-based merging for unkeyed rows.
 */

interface SeedSnapshot {
  /** Lowercased, trimmed name → key for top-level categories. */
  main: Record<string, string>;
  /** parentKey → (lowercased trimmed sub name → sub key). Scoped per-parent because
   *  some locales reuse the same display name across parents (e.g. uk "Оренда" appears
   *  under both `housing` and `vehicle`). */
  subcat: Record<string, Record<string, string>>;
}

const NAME_TO_KEY_PER_LOCALE: Record<string, SeedSnapshot> = {
  en: {
    main: {
      'food & drinks': 'food',
      shopping: 'shopping',
      housing: 'housing',
      transportation: 'transportation',
      vehicle: 'vehicle',
      'life & entertainment': 'life',
      'communication, pc': 'communication',
      'financial expenses': 'financial-expenses',
      investments: 'investments',
      income: 'income',
      other: 'other',
    },
    subcat: {
      food: {
        groceries: 'groceries',
        'restaurant, fast-food': 'restaurant',
        'bar, cafe': 'bar-cafe',
      },
      shopping: {
        'clothes & shoes': 'clothes-shoes',
        'jewels, accessories': 'jewels-accessories',
        'health and beauty': 'health-beauty',
        kids: 'kids',
        'home, garden': 'home-garden',
        'pets, animals': 'pets-animals',
        'electronics, accessories': 'electronics-accessories',
        'gifts, joy': 'gifts-joy',
        'stationery, tools': 'stationery-tools',
        'free time': 'free-time',
        'drug-store, chemist': 'drugstore-chemist',
      },
      housing: {
        rent: 'rent',
        mortgage: 'mortgage',
        'energy, utilities': 'energy-utilities',
        services: 'services',
        'maintenance, repairs': 'maintenance-repairs',
        'property insurance': 'property-insurance',
      },
      transportation: {
        'public transport': 'public-transport',
        taxi: 'taxi',
        'long distance': 'long-distance',
        'business trips': 'business-trips',
      },
      vehicle: {
        fuel: 'fuel',
        parking: 'parking',
        'vehicle maintenance': 'vehicle-maintenance',
        rentals: 'rentals',
        'vehicle insurance': 'vehicle-insurance',
        leasing: 'leasing',
      },
      life: {
        'health care, doctor': 'health-care-doctor',
        'wellness, beauty': 'wellness-beauty',
        'active sport, fitness': 'active-sport-fitness',
        'culture, sport events': 'culture-sport-events',
        hobbies: 'hobbies',
        'education, development': 'education-development',
        'books, audio, subscriptions': 'books-audio-subscriptions',
        'tv, streaming': 'tv-streaming',
        'holiday, trips, hotels': 'holiday-trips-hotels',
        'charity, gifts': 'charity-gifts',
        'alcohol, tobacco': 'alcohol-tobacco',
        'lottery, gambling': 'lottery-gambling',
      },
      communication: {
        'phone, cell phone': 'phone-cell-phone',
        internet: 'internet',
        'software, apps, games': 'software-apps-games',
        'postal services': 'postal-services',
      },
      'financial-expenses': {
        taxes: 'taxes',
        insurances: 'insurances',
        'loan, interests': 'loan-interests',
        fines: 'fines',
        advisory: 'advisory',
        'charges, fees': 'charges-fees',
        'child support': 'child-support',
      },
      investments: {
        realty: 'realty',
        'vehicles, chattels': 'vehicles-chattels',
        'financial investments': 'financial-investments',
        savings: 'savings',
        collections: 'collections',
      },
      income: {
        'wage, invoices': 'wage-invoices',
        'interests, dividends': 'interests-dividends',
        sale: 'sale',
        'rental income': 'rental-income',
        'dues & grants': 'dues-grants',
        'lending, renting': 'lending-renting',
        'checks, coupons': 'checks-coupons',
        'lottery, gambling': 'lottery-gambling',
        'refunds (tax, purchase)': 'refunds',
        freelance: 'freelance',
        gifts: 'gifts',
      },
    },
  },
  /**
   * Legacy aliases — names that were persisted by older seed-code paths but no longer
   * appear in the live locale JSON. Kept here so the backfill stamps `key` on existing
   * rows. NOT used for new signups; the en/uk entries above are the canonical seed path.
   *
   * Two cohorts of rows are recovered:
   *
   * 1. Five subcategory typos that existed in earlier `default-categories.ts` and were
   *    later corrected in the source. Approx. 42 users were seeded during the typo
   *    window and still carry the misspelled names.
   *
   * 2. The full canonical set as raw i18n key paths (camelCase, pre-rename) — one user
   *    signed up while i18next was uninitialized and `t()` returned the lookup path
   *    instead of the translation. The display `name` for that user is permanently
   *    broken (separate manual fix), but stamping `key` here lets downstream merging
   *    work for them. Note these use the OLD camelCase i18n segments, not the new
   *    kebab-case ones.
   */
  legacy: {
    main: {
      'defaultcategories.main.food': 'food',
      'defaultcategories.main.shopping': 'shopping',
      'defaultcategories.main.housing': 'housing',
      'defaultcategories.main.transportation': 'transportation',
      'defaultcategories.main.vehicle': 'vehicle',
      'defaultcategories.main.life': 'life',
      'defaultcategories.main.communication': 'communication',
      'defaultcategories.main.financialexpenses': 'financial-expenses',
      'defaultcategories.main.investments': 'investments',
      'defaultcategories.main.income': 'income',
      'defaultcategories.main.other': 'other',
    },
    subcat: {
      food: {
        'defaultcategories.subcategories.food.groceries': 'groceries',
        'defaultcategories.subcategories.food.restaurant': 'restaurant',
        'defaultcategories.subcategories.food.barcafe': 'bar-cafe',
        'restaurane, fast-food': 'restaurant',
      },
      shopping: {
        'defaultcategories.subcategories.shopping.clothesshoes': 'clothes-shoes',
        'defaultcategories.subcategories.shopping.jewelsaccessories': 'jewels-accessories',
        'defaultcategories.subcategories.shopping.healthbeauty': 'health-beauty',
        'defaultcategories.subcategories.shopping.kids': 'kids',
        'defaultcategories.subcategories.shopping.homegarden': 'home-garden',
        'defaultcategories.subcategories.shopping.petsanimals': 'pets-animals',
        'defaultcategories.subcategories.shopping.electronicsaccessories': 'electronics-accessories',
        'defaultcategories.subcategories.shopping.giftsjoy': 'gifts-joy',
        'defaultcategories.subcategories.shopping.stationerytools': 'stationery-tools',
        'defaultcategories.subcategories.shopping.freetime': 'free-time',
        'defaultcategories.subcategories.shopping.drugstorechemist': 'drugstore-chemist',
      },
      housing: {
        'defaultcategories.subcategories.housing.rent': 'rent',
        'defaultcategories.subcategories.housing.mortgage': 'mortgage',
        'defaultcategories.subcategories.housing.energyutilities': 'energy-utilities',
        'defaultcategories.subcategories.housing.services': 'services',
        'defaultcategories.subcategories.housing.maintenancerepairs': 'maintenance-repairs',
        'defaultcategories.subcategories.housing.propertyinsurance': 'property-insurance',
      },
      transportation: {
        'defaultcategories.subcategories.transportation.publictransport': 'public-transport',
        'defaultcategories.subcategories.transportation.taxi': 'taxi',
        'defaultcategories.subcategories.transportation.longdistance': 'long-distance',
        'defaultcategories.subcategories.transportation.businesstrips': 'business-trips',
      },
      vehicle: {
        'defaultcategories.subcategories.vehicle.fuel': 'fuel',
        'defaultcategories.subcategories.vehicle.parking': 'parking',
        'defaultcategories.subcategories.vehicle.vehiclemaintenance': 'vehicle-maintenance',
        'defaultcategories.subcategories.vehicle.rentals': 'rentals',
        'defaultcategories.subcategories.vehicle.vehicleinsurance': 'vehicle-insurance',
        'defaultcategories.subcategories.vehicle.leasing': 'leasing',
        'vaniche maintenance': 'vehicle-maintenance',
        'venicle insurance': 'vehicle-insurance',
      },
      life: {
        'defaultcategories.subcategories.life.healthcaredoctor': 'health-care-doctor',
        'defaultcategories.subcategories.life.wellnessbeauty': 'wellness-beauty',
        'defaultcategories.subcategories.life.activesportfitness': 'active-sport-fitness',
        'defaultcategories.subcategories.life.culturesportevents': 'culture-sport-events',
        'defaultcategories.subcategories.life.hobbies': 'hobbies',
        'defaultcategories.subcategories.life.educationdevelopment': 'education-development',
        'defaultcategories.subcategories.life.booksaudiosubscriptions': 'books-audio-subscriptions',
        'defaultcategories.subcategories.life.tvstreaming': 'tv-streaming',
        'defaultcategories.subcategories.life.holidaytripshotels': 'holiday-trips-hotels',
        'defaultcategories.subcategories.life.charitygifts': 'charity-gifts',
        'defaultcategories.subcategories.life.alcoholtobacco': 'alcohol-tobacco',
        'defaultcategories.subcategories.life.lotterygambling': 'lottery-gambling',
        'helth care, doctor': 'health-care-doctor',
      },
      communication: {
        'defaultcategories.subcategories.communication.phonecellphone': 'phone-cell-phone',
        'defaultcategories.subcategories.communication.internet': 'internet',
        'defaultcategories.subcategories.communication.softwareappsgames': 'software-apps-games',
        'defaultcategories.subcategories.communication.postalservices': 'postal-services',
      },
      'financial-expenses': {
        'defaultcategories.subcategories.financialexpenses.taxes': 'taxes',
        'defaultcategories.subcategories.financialexpenses.insurances': 'insurances',
        'defaultcategories.subcategories.financialexpenses.loaninterests': 'loan-interests',
        'defaultcategories.subcategories.financialexpenses.fines': 'fines',
        'defaultcategories.subcategories.financialexpenses.advisory': 'advisory',
        'defaultcategories.subcategories.financialexpenses.chargesfees': 'charges-fees',
        'defaultcategories.subcategories.financialexpenses.childsupport': 'child-support',
      },
      investments: {
        'defaultcategories.subcategories.investments.realty': 'realty',
        'defaultcategories.subcategories.investments.vehicleschattels': 'vehicles-chattels',
        'defaultcategories.subcategories.investments.financialinvestments': 'financial-investments',
        'defaultcategories.subcategories.investments.savings': 'savings',
        'defaultcategories.subcategories.investments.collections': 'collections',
        'venicles, chattels': 'vehicles-chattels',
      },
      income: {
        'defaultcategories.subcategories.income.wageinvoices': 'wage-invoices',
        'defaultcategories.subcategories.income.interestsdividends': 'interests-dividends',
        'defaultcategories.subcategories.income.sale': 'sale',
        'defaultcategories.subcategories.income.rentalincome': 'rental-income',
        'defaultcategories.subcategories.income.duesgrants': 'dues-grants',
        'defaultcategories.subcategories.income.lendingrenting': 'lending-renting',
        'defaultcategories.subcategories.income.checkscoupons': 'checks-coupons',
        'defaultcategories.subcategories.income.lotterygambling': 'lottery-gambling',
        'defaultcategories.subcategories.income.refunds': 'refunds',
        'defaultcategories.subcategories.income.freelance': 'freelance',
        'defaultcategories.subcategories.income.gifts': 'gifts',
      },
    },
  },
  uk: {
    main: {
      'їжа та напої': 'food',
      покупки: 'shopping',
      житло: 'housing',
      транспорт: 'transportation',
      авто: 'vehicle',
      'життя та розваги': 'life',
      "зв'язок, пк": 'communication',
      'фінансові витрати': 'financial-expenses',
      інвестиції: 'investments',
      дохід: 'income',
      інше: 'other',
    },
    subcat: {
      food: {
        продукти: 'groceries',
        'ресторан, фаст-фуд': 'restaurant',
        'бар, кафе': 'bar-cafe',
      },
      shopping: {
        'одяг та взуття': 'clothes-shoes',
        'прикраси, аксесуари': 'jewels-accessories',
        "здоров'я та краса": 'health-beauty',
        діти: 'kids',
        'дім, сад': 'home-garden',
        'домашні тварини': 'pets-animals',
        'електроніка, аксесуари': 'electronics-accessories',
        'подарунки, радість': 'gifts-joy',
        'канцелярія, інструменти': 'stationery-tools',
        'вільний час': 'free-time',
        'аптека, хімія': 'drugstore-chemist',
      },
      housing: {
        оренда: 'rent',
        іпотека: 'mortgage',
        'енергія, комунальні': 'energy-utilities',
        послуги: 'services',
        'обслуговування, ремонт': 'maintenance-repairs',
        'страхування нерухомості': 'property-insurance',
      },
      transportation: {
        'громадський транспорт': 'public-transport',
        таксі: 'taxi',
        'далекі поїздки': 'long-distance',
        відрядження: 'business-trips',
      },
      vehicle: {
        пальне: 'fuel',
        паркування: 'parking',
        'обслуговування авто': 'vehicle-maintenance',
        оренда: 'rentals',
        'страхування авто': 'vehicle-insurance',
        лізинг: 'leasing',
      },
      life: {
        'медицина, лікар': 'health-care-doctor',
        'велнес, краса': 'wellness-beauty',
        'активний спорт, фітнес': 'active-sport-fitness',
        'культура, спортивні події': 'culture-sport-events',
        хобі: 'hobbies',
        'освіта, розвиток': 'education-development',
        'книги, аудіо, підписки': 'books-audio-subscriptions',
        'тб, стрімінг': 'tv-streaming',
        'відпустка, подорожі, готелі': 'holiday-trips-hotels',
        'благодійність, подарунки': 'charity-gifts',
        'алкоголь, тютюн': 'alcohol-tobacco',
        'лотерея, азартні ігри': 'lottery-gambling',
      },
      communication: {
        'телефон, мобільний': 'phone-cell-phone',
        інтернет: 'internet',
        'програми, додатки, ігри': 'software-apps-games',
        'поштові послуги': 'postal-services',
      },
      'financial-expenses': {
        податки: 'taxes',
        страхування: 'insurances',
        'кредит, відсотки': 'loan-interests',
        штрафи: 'fines',
        консультації: 'advisory',
        'збори, комісії': 'charges-fees',
        аліменти: 'child-support',
      },
      investments: {
        нерухомість: 'realty',
        'транспорт, майно': 'vehicles-chattels',
        'фінансові інвестиції': 'financial-investments',
        заощадження: 'savings',
        колекції: 'collections',
      },
      income: {
        'зарплата, рахунки': 'wage-invoices',
        'відсотки, дивіденди': 'interests-dividends',
        продаж: 'sale',
        'дохід від оренди': 'rental-income',
        'внески та гранти': 'dues-grants',
        'позики, здача в оренду': 'lending-renting',
        'чеки, купони': 'checks-coupons',
        'лотерея, азартні ігри': 'lottery-gambling',
        'повернення (податки, покупки)': 'refunds',
        фріланс: 'freelance',
        подарунки: 'gifts',
      },
    },
  },
};

/** Doubles a single quote per the SQL string-literal convention. Names are our own
 *  constants (not user input), so escaping is purely a defensive correctness step
 *  for entries that contain apostrophes (e.g. uk "зв'язок, пк"). */
const sqlEscape = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Flat (name_lower, key) tuples for top-level categories, across all locales. */
const MAIN_VALUES_LITERAL = Object.values(NAME_TO_KEY_PER_LOCALE)
  .flatMap((snapshot) => Object.entries(snapshot.main))
  .map(([name, key]) => `(${sqlEscape(name)}, ${sqlEscape(key)})`)
  .join(', ');

/** Flat (parent_key, name_lower, sub_key) tuples for subcategories. The parent_key is
 *  the canonical kebab-case identifier — same value the parent's row will have been
 *  stamped with after the main-pass UPDATE. */
const SUB_VALUES_LITERAL = Object.values(NAME_TO_KEY_PER_LOCALE)
  .flatMap((snapshot) =>
    Object.entries(snapshot.subcat).flatMap(([parentKey, subMap]) =>
      Object.entries(subMap).map(([name, subKey]) => [parentKey, name, subKey] as const),
    ),
  )
  .map(([parent, name, subKey]) => `(${sqlEscape(parent)}, ${sqlEscape(name)}, ${sqlEscape(subKey)})`)
  .join(', ');

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Categories',
        'key',
        {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        { transaction: t },
      );

      // Pass 1: stamp top-level categories. Match the row's stored name (normalized)
      // against the flattened cross-locale name → key map. Per-parent scoping is not
      // needed at this level because main-category names are unique within each locale
      // and don't collide cross-locale.
      const [, mainResult] = (await queryInterface.sequelize.query(
        `UPDATE "Categories" c
            SET "key" = m.key
           FROM (VALUES ${MAIN_VALUES_LITERAL}) AS m(name_lower, key)
          WHERE c."parentId" IS NULL
            AND lower(trim(c.name)) = m.name_lower
            AND c."key" IS NULL`,
        { transaction: t },
      )) as [unknown, { rowCount?: number }];

      // Pass 2: stamp subcategories. Joins each row's parent against the just-stamped
      // parent.key, then disambiguates by (parent_key, name_lower) → sub_key. This is
      // what handles within-locale name collisions like uk "Оренда" appearing under
      // both `housing` and `vehicle`.
      const [, subResult] = (await queryInterface.sequelize.query(
        `UPDATE "Categories" c
            SET "key" = s.sub_key
           FROM "Categories" p, (VALUES ${SUB_VALUES_LITERAL}) AS s(parent_key, name_lower, sub_key)
          WHERE c."parentId" = p.id
            AND p."key" = s.parent_key
            AND lower(trim(c.name)) = s.name_lower
            AND c."key" IS NULL`,
        { transaction: t },
      )) as [unknown, { rowCount?: number }];

      const [mainTotal] = (await queryInterface.sequelize.query(
        `SELECT count(*)::int AS total FROM "Categories" WHERE "parentId" IS NULL`,
        { type: QueryTypes.SELECT, transaction: t },
      )) as [{ total: number }];

      const [subTotal] = (await queryInterface.sequelize.query(
        `SELECT count(*)::int AS total FROM "Categories" WHERE "parentId" IS NOT NULL`,
        { type: QueryTypes.SELECT, transaction: t },
      )) as [{ total: number }];

      const mainMatched = mainResult.rowCount ?? 0;
      const subMatched = subResult.rowCount ?? 0;
      const mainPct = mainTotal.total > 0 ? ((mainMatched / mainTotal.total) * 100).toFixed(1) : '0.0';
      const subPct = subTotal.total > 0 ? ((subMatched / subTotal.total) * 100).toFixed(1) : '0.0';

      // eslint-disable-next-line no-console -- migration output goes to deploy logs
      console.log(
        `[migration 20260506000000] backfilled key on ${mainMatched}/${mainTotal.total} main categories (${mainPct}%) and ${subMatched}/${subTotal.total} subcategories (${subPct}%)`,
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.removeColumn('Categories', 'key');
  },
};
