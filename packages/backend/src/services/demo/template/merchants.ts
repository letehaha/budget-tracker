/**
 * Merchant vocabulary for generated demo transactions.
 *
 * Every spending row picks its merchant from here; the seeder turns this list
 * into `Payees` rows keyed by `name`.
 *
 * - `domain` is stored as `logoDomain` with `logoSource: 'manual'`, so logos
 *   render immediately and the brand-logo worker skips a per-merchant lookup.
 * - `categoryKey` is the payee's default category, making payee-driven
 *   categorization visible in the demo.
 */
export interface DemoMerchant {
  name: string;
  domain: string;
  /** Subcategory key in `parent/child` form, matching `subcategoryMapKey`. */
  categoryKey: string;
}

/**
 * Grouped so the generator can draw from one bucket per spending habit. A flat
 * list would force the generator to hardcode which names belong together.
 */
export const DEMO_MERCHANTS = {
  groceries: [
    { name: 'Whole Foods Market', domain: 'wholefoodsmarket.com', categoryKey: 'food/groceries' },
    { name: "Trader Joe's", domain: 'traderjoes.com', categoryKey: 'food/groceries' },
    { name: 'Costco', domain: 'costco.com', categoryKey: 'food/groceries' },
    { name: 'Safeway', domain: 'safeway.com', categoryKey: 'food/groceries' },
    { name: 'Aldi', domain: 'aldi.us', categoryKey: 'food/groceries' },
  ],
  restaurants: [
    { name: 'Chipotle', domain: 'chipotle.com', categoryKey: 'food/restaurant' },
    { name: 'Sweetgreen', domain: 'sweetgreen.com', categoryKey: 'food/restaurant' },
    { name: 'Shake Shack', domain: 'shakeshack.com', categoryKey: 'food/restaurant' },
    { name: "Domino's Pizza", domain: 'dominos.com', categoryKey: 'food/restaurant' },
    { name: 'Panera Bread', domain: 'panerabread.com', categoryKey: 'food/restaurant' },
  ],
  coffee: [
    { name: 'Starbucks', domain: 'starbucks.com', categoryKey: 'food/bar-cafe' },
    { name: 'Blue Bottle Coffee', domain: 'bluebottlecoffee.com', categoryKey: 'food/bar-cafe' },
    { name: "Dunkin'", domain: 'dunkindonuts.com', categoryKey: 'food/bar-cafe' },
    { name: "Peet's Coffee", domain: 'peets.com', categoryKey: 'food/bar-cafe' },
  ],
  transit: [
    { name: 'Uber', domain: 'uber.com', categoryKey: 'transportation/taxi' },
    { name: 'Lyft', domain: 'lyft.com', categoryKey: 'transportation/taxi' },
    { name: 'Metro Transit', domain: 'metrotransit.org', categoryKey: 'transportation/public-transport' },
  ],
  fuel: [
    { name: 'Shell', domain: 'shell.com', categoryKey: 'vehicle/fuel' },
    { name: 'Chevron', domain: 'chevron.com', categoryKey: 'vehicle/fuel' },
    { name: 'BP', domain: 'bp.com', categoryKey: 'vehicle/fuel' },
  ],
  parking: [{ name: 'SpotHero', domain: 'spothero.com', categoryKey: 'vehicle/parking' }],
  shopping: [
    { name: 'Amazon', domain: 'amazon.com', categoryKey: 'shopping/electronics-accessories' },
    { name: 'Target', domain: 'target.com', categoryKey: 'shopping/home-garden' },
    { name: 'IKEA', domain: 'ikea.com', categoryKey: 'shopping/home-garden' },
    { name: 'Nike', domain: 'nike.com', categoryKey: 'shopping/clothes-shoes' },
    { name: 'Uniqlo', domain: 'uniqlo.com', categoryKey: 'shopping/clothes-shoes' },
    { name: 'Best Buy', domain: 'bestbuy.com', categoryKey: 'shopping/electronics-accessories' },
    { name: 'Sephora', domain: 'sephora.com', categoryKey: 'shopping/health-beauty' },
  ],
  pharmacy: [
    { name: 'CVS Pharmacy', domain: 'cvs.com', categoryKey: 'shopping/drugstore-chemist' },
    { name: 'Walgreens', domain: 'walgreens.com', categoryKey: 'shopping/drugstore-chemist' },
  ],
  entertainment: [
    { name: 'AMC Theatres', domain: 'amctheatres.com', categoryKey: 'life/culture-sport-events' },
    { name: 'Ticketmaster', domain: 'ticketmaster.com', categoryKey: 'life/culture-sport-events' },
    { name: 'Steam', domain: 'steampowered.com', categoryKey: 'life/hobbies' },
  ],
  fitness: [{ name: 'Equinox', domain: 'equinox.com', categoryKey: 'life/active-sport-fitness' }],
  education: [
    { name: 'Coursera', domain: 'coursera.org', categoryKey: 'life/education-development' },
    { name: 'Audible', domain: 'audible.com', categoryKey: 'life/books-audio-subscriptions' },
  ],
  health: [{ name: 'City Medical Group', domain: 'onemedical.com', categoryKey: 'life/health-care-doctor' }],
  // EUR. Kept distinct from the USD buckets so the generator can drive non-USD
  // volume without leaking euro merchants into USD spending.
  travel: [
    { name: 'Booking.com', domain: 'booking.com', categoryKey: 'life/holiday-trips-hotels' },
    { name: 'Airbnb', domain: 'airbnb.com', categoryKey: 'life/holiday-trips-hotels' },
    { name: 'Lufthansa', domain: 'lufthansa.com', categoryKey: 'transportation/long-distance' },
    { name: 'Trainline', domain: 'thetrainline.com', categoryKey: 'transportation/long-distance' },
    { name: 'Deutsche Bahn', domain: 'bahn.de', categoryKey: 'transportation/long-distance' },
  ],
  // EUR routine spending abroad, spread across categories. An all-restaurant
  // bucket here (the abolished alternative) pushes food past half of total
  // spending and fails the category-balance test.
  travelDining: [
    { name: 'Vapiano', domain: 'vapiano.com', categoryKey: 'food/restaurant' },
    { name: 'Le Pain Quotidien', domain: 'lepainquotidien.com', categoryKey: 'food/restaurant' },
    { name: 'Zara', domain: 'zara.com', categoryKey: 'shopping/clothes-shoes' },
    { name: 'MediaMarkt', domain: 'mediamarkt.de', categoryKey: 'shopping/electronics-accessories' },
    { name: 'DM Drogerie', domain: 'dm.de', categoryKey: 'shopping/drugstore-chemist' },
    { name: 'Bolt', domain: 'bolt.eu', categoryKey: 'transportation/taxi' },
    { name: 'Decathlon', domain: 'decathlon.com', categoryKey: 'life/active-sport-fitness' },
  ],
  // PLN cash spending. Local names so the currency reads as a real place
  // rather than the same US merchants in another currency.
  cash: [
    { name: 'Żabka', domain: 'zabka.pl', categoryKey: 'food/groceries' },
    { name: 'Biedronka', domain: 'biedronka.pl', categoryKey: 'food/groceries' },
    { name: 'Bar Mleczny', domain: 'barmleczny.pl', categoryKey: 'food/restaurant' },
    { name: 'Empik', domain: 'empik.com', categoryKey: 'shopping/stationery-tools' },
    { name: 'Rossmann', domain: 'rossmann.pl', categoryKey: 'shopping/drugstore-chemist' },
    { name: 'Kiosk Ruchu', domain: 'ruch.com.pl', categoryKey: 'shopping/stationery-tools' },
    { name: 'MPK Kraków', domain: 'mpk.krakow.pl', categoryKey: 'transportation/public-transport' },
    { name: 'Kino Kijów', domain: 'kijow.pl', categoryKey: 'life/culture-sport-events' },
  ],
} satisfies Record<string, DemoMerchant[]>;

/** Every merchant across all buckets, deduplicated by name. */
export function allDemoMerchants(): DemoMerchant[] {
  const byName = new Map<string, DemoMerchant>();
  for (const bucket of Object.values(DEMO_MERCHANTS)) {
    for (const merchant of bucket) {
      byName.set(merchant.name, merchant);
    }
  }
  return [...byName.values()];
}
