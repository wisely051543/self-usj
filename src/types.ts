export type SourceId = 'usj';

/** One attraction's entry window inside a time slot. */
export interface SlotEvent {
  code: string;                  // attraction code, e.g. 'EXP_MKC' — see attractionNames
  from: string;                  // HH:MM
  to: string;                    // HH:MM
}

/**
 * A bookable time slot for a given date. The store sells each slot as its own
 * product variant, and only still-purchasable variants come back — so a slot
 * appearing here means it is available. There is no per-slot unit count.
 */
export interface TimeSlot {
  variantCode: string;           // e.g. 'E4DKT23D10A093'
  from: string;                  // HH:MM — start of the earliest timed entry
  to: string;                    // HH:MM — end of the latest timed entry
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
}

export interface SourceResult {
  id: SourceId;
  label: string;                 // display name, e.g. 'USJ 官網'
  url: string;                   // public page for this ticket
  productName: string;
  productCode: string;           // platform's product id, e.g. 'EXP0069'
  currency: string;              // ISO 4217, e.g. 'JPY' / 'TWD'
  people: number;
  fetchedAt: string;             // ISO8601 — per source, not per file
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

export interface Results {
  schemaVersion: 2;
  updatedAt: string;             // ISO8601 — last time the file was written
  sources: SourceResult[];
}

export interface DateRange {
  start: string;                 // YYYY-MM-DD
  end: string;                   // YYYY-MM-DD
}

export interface Source {
  id: SourceId;
  label: string;
  run(range: DateRange): Promise<SourceResult>;
}
