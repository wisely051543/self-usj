export type SourceId = 'usj';

export interface DateSlot {
  date: string;                  // YYYY-MM-DD
  dayOfWeek: number;             // 0=Sun … 6=Sat (locale-neutral; the UI renders the label)
  available: boolean;
  availableUnits: number | null; // null = platform does not expose an exact count
  maxAvailable: number | null;   // max per order
  totalCapacity: number | null;
  pricePerPerson: number | null;
  formattedPrice: string;        // platform's own string, e.g. "¥26,800"
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
