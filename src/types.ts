/** One attraction's entry window inside a time slot. */
export interface SlotEvent {
  code: string;                  // attraction code, e.g. 'EXP_MKC' — see attractionNames
  from: string;                  // HH:MM
  to: string;                    // HH:MM
}

/**
 * A bookable time slot for a given date. The store sells each slot as its own
 * product variant, and only still-purchasable variants come back — so a slot
 * appearing here means it is available.
 */
export interface TimeSlot {
  variantCode: string;           // e.g. 'E4DKT23D10A093'
  from: string;                  // HH:MM — start of the earliest timed entry
  to: string;                    // HH:MM — end of the latest timed entry
  /**
   * Tickets left in this slot. Also the party-size limit: the store stops
   * offering a slot once a party is larger than what remains, so the UI can
   * answer "which slots fit N people" with availableUnits >= N and never has
   * to ask the store itself. null = the per-slot lookup failed.
   */
  availableUnits: number | null;
  events: SlotEvent[];
}

export interface DateSlot {
  date: string;                  // YYYY-MM-DD
  dayOfWeek: number;             // 0=Sun … 6=Sat (locale-neutral; the UI renders the label)
  available: boolean;
  availableUnits: number | null; // null = platform does not expose an exact count
  maxAvailable: number | null;   // max per order
  totalCapacity: number | null;
  pricePerPerson: number | null;
  formattedPrice: string;        // platform's own string, e.g. "¥26,800"
  timeSlots: TimeSlot[] | null;  // null = not fetched for this date (e.g. sold out)
  /**
   * When timeSlots was last looked up, so a run can tell fresh slot data from
   * data it is carrying over. null whenever timeSlots is null.
   */
  slotsFetchedAt: string | null;  // ISO8601
}

/**
 * A product as the catalogue lists it, before any availability is looked up.
 * Everything here comes from the search endpoint.
 */
export interface CatalogEntry {
  code: string;                  // e.g. 'EXP0069'
  name: string;                  // e.g. '～トロッコ＆ジョーズ～'
  eyebrow: string;               // e.g. 'ユニバーサル・エクスプレス・パス 4'
  imageUrl: string;
  legalDesc: string;             // HTML — the covered-attractions blurb
  fromPrice: number | null;      // cheapest listed price; the calendar has the per-date truth
  /**
   * True when this product came from an earlier run rather than from the
   * listing. It is still fetched, but it does not count as seen — otherwise
   * carrying it forward would keep resetting the clock that eventually
   * delists it.
   */
  carriedOver?: boolean;
}

/** One product's availability over the fetched range. */
export interface ProductResult {
  code: string;
  name: string;
  eyebrow: string;
  imageUrl: string;
  legalDesc: string;
  url: string;                   // public page for this ticket
  currency: string;              // ISO 4217, e.g. 'JPY'
  /** Party size the snapshot was fetched at — 1, so nothing is filtered out. */
  people: number;
  /** Whether time slots were looked up at all — see WATCHLIST in sources/usj.ts. */
  deep: boolean;
  fetchedAt: string;             // ISO8601
  calendarStart: string;         // YYYY-MM-DD
  calendarEnd: string;           // YYYY-MM-DD
  latestDate: string;            // YYYY-MM-DD — latest date still on sale
  dates: DateSlot[];
  /** Attraction code -> display name, hoisted out of the slots to keep them small. */
  attractionNames: Record<string, string>;
  /** Attractions the pass covers with no fixed entry window. */
  nonTimedAttractions: string[];
  error?: string;
}

/**
 * The index's per-product row. Deliberately small: the page loads this for
 * every product to draw the picker, then pulls one product file on demand.
 */
export interface ProductSummary {
  code: string;
  name: string;
  eyebrow: string;
  imageUrl: string;
  url: string;
  fromPrice: number | null;
  currency: string;
  deep: boolean;
  latestDate: string;
  availableDateCount: number;
  slotDateCount: number;         // dates whose slots are known
  fetchedAt: string;             // ISO8601
  /** Last run that saw this product in the catalogue — drives the delisting sweep. */
  lastSeenAt: string;            // ISO8601
  /** True when this run did not refresh the product and its file is a carry-over. */
  stale?: boolean;
  error?: string;
}

export interface Index {
  schemaVersion: 4;
  updatedAt: string;             // ISO8601 — last time the index was written
  /** True when the run hit its request backstop and left some slot data unrefreshed. */
  budgetExhausted?: boolean;
  products: ProductSummary[];
}

export interface DateRange {
  start: string;                 // YYYY-MM-DD
  end: string;                   // YYYY-MM-DD
}

/**
 * A ticketing platform. One source lists many products; which of them get the
 * expensive time-slot treatment is the fetcher's call, not the source's.
 */
export interface Source {
  id: string;                    // 'usj'
  label: string;
  /**
   * The catalogue over `range`. `known` seeds it with codes seen on earlier
   * runs, since the listing is date-sampled and a short-lived product can fall
   * between samples.
   */
  listProducts(range: DateRange, known: string[]): Promise<CatalogEntry[]>;
  fetchProduct(
    entry: CatalogEntry,
    range: DateRange,
    deep: boolean,
    previous: ProductResult | null,
  ): Promise<ProductResult>;
  /** Whether this product is worth the per-slot inventory calls. */
  isDeep(code: string): boolean;
}
