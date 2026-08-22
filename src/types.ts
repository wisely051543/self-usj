/**
 * A store string in every language the store actually translates.
 *
 * The API localizes attraction names and nothing else: a pass's name, its
 * display prefix and its covered-attractions blurb come back in Japanese
 * whatever `lang` is asked for. Those are translated in the page instead, from
 * the term tables in i18n/ — so this type exists for the fields the store does
 * translate, and `en` is optional because a lookup can fail without costing the
 * Japanese one.
 */
export interface Localized {
  ja: string;
  en?: string;
}

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
  /**
   * Whether the pass has any timed attraction, and so any slots to look up.
   * A false here means the fetcher throws the result away — a walk-up pass
   * carries nothing this project reports on — so it never reaches disk.
   */
  deep: boolean;
  fetchedAt: string;             // ISO8601
  calendarStart: string;         // YYYY-MM-DD
  calendarEnd: string;           // YYYY-MM-DD
  latestDate: string;            // YYYY-MM-DD — latest date still on sale
  dates: DateSlot[];
  /** Attraction code -> display name per language, hoisted out of the slots to keep them small. */
  attractionNames: Record<string, Localized>;
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
  /** Always true — walk-up passes never make it into the index. */
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

/**
 * What one (date × pass) cell of the calendar grid is known to be.
 *
 * Absence used to carry all four of these at once, which left every reader
 * guessing — and guessing "sold out" is the one wrong answer that makes a user
 * give up on a pass they could still buy. So the fetcher decides once, here,
 * and 'unknown' is a real answer rather than a fallback to the pessimistic one.
 */
export type CellStatus = 'available' | 'sold-out' | 'not-yet-released' | 'unknown';

/**
 * One pass on one day, as the day-first view needs it. Deliberately tiny: this
 * is the same fact the product files already hold, transposed, and the whole
 * calendar has to fit in one download.
 *
 * Modelled as a union so a price only exists where there is something to buy:
 * a reader cannot reach `price` or `units` without having looked at `status`
 * first, which is the whole point of deciding the status in one place.
 */
export interface DayProductOnSale {
  code: string;
  status: 'available';
  price: number | null;          // per person, that day
  units: number | null;          // tickets left that day; null = not exposed
  slots: number | null;          // time slots known for that day; null = not fetched
}

/** A cell with nothing to buy: it carries the reason and nothing else. */
export interface DayProductOffSale {
  code: string;
  status: Exclude<CellStatus, 'available'>;
}

export type DayProduct = DayProductOnSale | DayProductOffSale;

export interface DayEntry {
  dayOfWeek: number;             // 0=Sun … 6=Sat
  /** Every pass in the index, exactly one cell each — the ones on sale first, cheapest first. */
  products: DayProduct[];
}

/**
 * data/days.json — the product files transposed by date into a full grid: every
 * date in the fetched range × every pass in the index, each with an explicit
 * status. Answering "which passes can I buy on the 20th" is one fetch instead
 * of every product file, and "why can I not buy this one" is answered too.
 * Carries no timestamp of its own: it is written only when the answer changes,
 * which is what keeps it out of most commits.
 */
export interface Days {
  schemaVersion: 1;
  days: Record<string, DayEntry>;
}

export interface Index {
  schemaVersion: 5;
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
  /**
   * One product's availability. Whether the pass has timed attractions at all
   * is the source's own call — it lands in ProductResult.deep, and a false
   * there tells the caller the product is not worth keeping.
   */
  fetchProduct(
    entry: CatalogEntry,
    range: DateRange,
    previous: ProductResult | null,
  ): Promise<ProductResult>;
}
