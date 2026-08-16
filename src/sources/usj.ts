import {
  CatalogEntry,
  DateRange,
  DateSlot,
  ProductResult,
  SlotEvent,
  Source,
  TimeSlot,
} from '../types';
import { everyNthDay, nextDay, shiftMonths } from '../dates';
import { budgetExhausted, limitedFetch, mapLimit } from '../limiter';

/**
 * Everything is fetched for a party of one. The store hides whatever it cannot
 * sell to the party asked about, so a larger number would silently drop slots;
 * asking for one and recording each slot's remaining units lets the UI filter
 * by party size itself.
 */
const PEOPLE = 1;
const CURRENCY = 'JPY';
const API_BASE = 'https://comm-api.usj.co.jp/occ/v2/b2cportal';
/** Store front the b2cportal API belongs to; product paths hang off it. */
const SITE_BASE = 'https://www.usj.co.jp/web/ja/jp';
/** Used when the product API does not hand back its own path. */
const FALLBACK_PAGE_URL = `${SITE_BASE}/tickets-and-passes/express-pass`;

/**
 * Products worth the per-slot inventory calls. Every other product still gets
 * its calendar, price and sold-out state — this only decides who is expensive
 * enough to warrant one request per slot per date, which is the whole cost of a
 * run. It does NOT decide which products exist: that comes from listProducts.
 */
const WATCHLIST = new Set(['EXP0079', 'EXP0068', 'EXP0081', 'EXP0069', 'EXP0009']);

/**
 * How far back from the latest on-sale date time slots are looked up. Slots
 * cost one request per date, so this bounds the run at roughly a month of
 * on-sale dates instead of the whole six-month calendar.
 */
const SLOT_WINDOW_MONTHS = 1;

/**
 * The catalogue is asked about one date at a time, so it is sampled rather than
 * walked. A week is well inside how long any pass has stayed on sale, and
 * anything that slips between samples is caught by the codes carried over from
 * the previous run.
 */
const CATALOG_SAMPLE_DAYS = 7;

/**
 * Slot data older than this is refreshed even when the day's total looks
 * unchanged. Without it a day whose slots shuffled while the total held steady
 * would keep stale times forever; with it, any missed change self-corrects
 * within the window.
 */
const MAX_SLOT_AGE_MS = 6 * 60 * 60 * 1000;

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'x-anonymous-consents': '%5B%5D',
  'Accept-Language': 'ja-JP',
};

interface CalendarDate {
  date: string;
  canBeVisited: boolean;
  forceSoldOut: boolean;
  inventoryEvents: Array<{
    availableUnits: string;
    maxAvailable: string;
    totalCapacity: string;
  }>;
  pricing: Array<{
    amount: number;
    formattedAmount: string;
  }>;
}

interface CalendarResponse {
  eventAvailability: Array<{
    calendarDates: CalendarDate[];
  }>;
}

/**
 * Inventory for one part number over a date range. partNumber is the product
 * code for whole-day totals, or a variant code for a single time slot — the
 * store answers the same shape either way, which is the only route to a
 * per-slot remaining count.
 */
async function fetchCalendar(
  startDate: string,
  endDate: string,
  partNumber: string,
): Promise<CalendarResponse> {
  const url = `${API_BASE}/products/fetchCalendarDatesWithPriceAndInventory?lang=ja&curr=${CURRENCY}`;
  const body = {
    currency: CURRENCY,
    events: {
      startDate: `${startDate} 00:00:01`,
      endDate,
      partNumber,
      quantity: PEOPLE,
    },
  };

  const res = await limitedFetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Calendar API returned ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<CalendarResponse>;
}

export function parseCalendarDate(cd: CalendarDate): DateSlot {
  const inv = cd.inventoryEvents[0] ?? { availableUnits: '0', maxAvailable: '0', totalCapacity: '0' };
  const pricing = cd.pricing[0] ?? { amount: 0, formattedAmount: '¥0' };
  const availableUnits = parseInt(inv.availableUnits, 10) || 0;
  const maxAvailable = parseInt(inv.maxAvailable, 10) || 0;
  const totalCapacity = parseInt(inv.totalCapacity, 10) || 0;

  const [y, m, d] = cd.date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const available = cd.canBeVisited && !cd.forceSoldOut && availableUnits > 0;

  return {
    date: cd.date,
    dayOfWeek,
    available,
    availableUnits,
    maxAvailable,
    totalCapacity,
    pricePerPerson: pricing.amount,
    formattedPrice: pricing.formattedAmount,
    timeSlots: null,
    slotsFetchedAt: null,
  };
}

interface VariantEvent {
  eventCode: string;             // e.g. 'EXP_MKC_182000185000' or 'EXP_JAW'
  eventName: string;
  maingroup: string;             // 'TIMED' | 'NON_TIMED'
  selectionFromTime: string;     // 'HH:MM' or 'HH:MM:SS'
  selectionToTime: string;
}

interface VariantProduct {
  code: string;
  attractions: { events: VariantEvent[] };
}

/** The API mixes 'HH:MM' and 'HH:MM:SS'. */
function normalizeTime(t: string): string {
  return (t ?? '').slice(0, 5);
}

/** 'EXP_MKC_182000185000' -> 'EXP_MKC'; codes without a time suffix pass through. */
function baseEventCode(code: string): string {
  return code.replace(/_\d{6,}(_\d{6,})*$/, '');
}

function toMMDDYYYY(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}

/**
 * Each bookable time slot is sold as its own product variant, so the store
 * exposes them through a variant lookup rather than the calendar. Only variants
 * still purchasable for the date come back; how many are left in each is a
 * separate lookup — see fetchSlotStock.
 */
async function fetchTimeSlots(
  productCode: string,
  date: string,
  names: Record<string, string>,
): Promise<TimeSlot[]> {
  const url =
    `${API_BASE}/products/getExpressPassVariantDetails` +
    `?baseProductCode=${productCode}&selectedDate=${toMMDDYYYY(date)}` +
    `&selectedQty=${PEOPLE}&lang=ja&curr=${CURRENCY}`;

  const res = await limitedFetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Variant API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { products?: VariantProduct[] };
  const slots: TimeSlot[] = [];

  for (const product of body.products ?? []) {
    const events: SlotEvent[] = [];

    for (const e of product.attractions?.events ?? []) {
      const code = baseEventCode(e.eventCode);
      names[code] ??= e.eventName;

      if (e.maingroup !== 'TIMED') continue;
      events.push({ code, from: normalizeTime(e.selectionFromTime), to: normalizeTime(e.selectionToTime) });
    }

    if (events.length === 0) continue;
    events.sort((a, b) => a.from.localeCompare(b.from) || a.code.localeCompare(b.code));

    slots.push({
      variantCode: product.code,
      from: events[0].from,
      to: events.reduce((latest, e) => (e.to > latest ? e.to : latest), events[0].to),
      availableUnits: null,
      events,
    });
  }

  slots.sort((a, b) => a.from.localeCompare(b.from) || a.variantCode.localeCompare(b.variantCode));
  return slots;
}

/**
 * Fill in each slot's remaining units. One request per slot, so this is the
 * expensive part of a run — but it is what lets the page answer party-size
 * questions offline, since a slot fits a party exactly when enough is left.
 */
async function fetchSlotStock(date: string, slots: TimeSlot[]): Promise<void> {
  await mapLimit(slots, async slot => {
    try {
      const data = await fetchCalendar(date, nextDay(date), slot.variantCode);
      const day = (data.eventAvailability?.[0]?.calendarDates ?? []).find(d => d.date === date);
      const units = day?.inventoryEvents?.[0]?.availableUnits;
      slot.availableUnits = units == null ? null : parseInt(units, 10);
    } catch (err) {
      // A missing count only costs this slot its party-size filter.
      console.error(`[usj]   ${date} ${slot.variantCode} stock failed: ${err instanceof Error ? err.message : err}`);
    }
  });
}

/**
 * The base product carries two things the calendar and variant lookups do not:
 * the attractions covered with no fixed entry window (the variant lookup only
 * returns TIMED entries), and the store's own path for this product — the only
 * reliable way to link to it, since the paths are Japanese slugs.
 */
async function fetchProductInfo(
  productCode: string,
  names: Record<string, string>,
): Promise<{ nonTimed: string[]; pageUrl: string }> {
  const url = `${API_BASE}/products/${productCode}?fields=FULL&lang=ja&curr=${CURRENCY}`;
  const res = await limitedFetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Product API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { attractions?: { events?: VariantEvent[] }; url?: string };
  const codes: string[] = [];

  for (const e of body.attractions?.events ?? []) {
    if (e.maingroup === 'TIMED') continue;
    const code = baseEventCode(e.eventCode);
    names[code] ??= e.eventName;
    codes.push(code);
  }

  return {
    nonTimed: codes.sort(),
    pageUrl: body.url ? `${SITE_BASE}${body.url}` : FALLBACK_PAGE_URL,
  };
}

interface SearchProduct {
  code: string;
  name?: string;
  legalDesc?: string;
  price?: { value?: number };
  tridionContent?: string;
}

/**
 * The store keeps the display prefix ("ユニバーサル・エクスプレス・パス 4") and the
 * product image in a CMS blob rather than in the product fields — a JSON string
 * inside the JSON, sometimes absent and not worth failing a run over.
 */
function parseTridion(raw: string | undefined): { eyebrow: string; imageUrl: string } {
  try {
    const data = (JSON.parse(raw ?? '[]') as Array<{ data?: any }>)[0]?.data ?? {};
    return {
      eyebrow: String(data.eyebrow ?? ''),
      imageUrl: String(data.image?.[0]?.desktop ?? ''),
    };
  } catch {
    return { eyebrow: '', imageUrl: '' };
  }
}

/**
 * The catalogue for one visit date.
 *
 * Note the query: the store insists on an expressAvailabilityDate facet (it
 * appends today's if none is given, which returns nothing once today has sold
 * out) and returns zero results if `category:expresspass` is also present. The
 * date facet alone is what lists the express passes.
 */
async function fetchCatalogPage(date: string): Promise<SearchProduct[]> {
  const query = `:recommended:expressAvailabilityDate:WTS-${date}`;
  const url =
    `${API_BASE}/products/search?query=${encodeURIComponent(query)}` +
    `&pageSize=100&lang=ja&curr=${CURRENCY}`;

  const res = await limitedFetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Search API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { products?: SearchProduct[] };
  return body.products ?? [];
}

/** Whether a date's slots are worth re-asking the store about. */
function slotsAreStale(fresh: DateSlot, previous: DateSlot | undefined, now: number): boolean {
  if (!previous?.timeSlots || !previous.slotsFetchedAt) return true;
  // The day total moves whenever any slot is bought or released, so an
  // unchanged total means the slots underneath are almost certainly unchanged.
  if (previous.availableUnits !== fresh.availableUnits) return true;
  if (previous.available !== fresh.available) return true;
  return now - new Date(previous.slotsFetchedAt).getTime() > MAX_SLOT_AGE_MS;
}

export const usjSource: Source = {
  id: 'usj',
  label: 'USJ 官網',

  isDeep(code: string): boolean {
    return WATCHLIST.has(code);
  },

  async listProducts(range: DateRange, known: string[]): Promise<CatalogEntry[]> {
    const samples = everyNthDay(range.start, range.end, CATALOG_SAMPLE_DAYS);
    const byCode = new Map<string, CatalogEntry>();

    await mapLimit(samples, async date => {
      let products: SearchProduct[];
      try {
        products = await fetchCatalogPage(date);
      } catch (err) {
        // One blind sample costs at most a product that no other sample saw.
        console.error(`[usj] catalog ${date} failed: ${err instanceof Error ? err.message : err}`);
        return;
      }

      for (const p of products) {
        if (!p.code || byCode.has(p.code)) continue;
        const { eyebrow, imageUrl } = parseTridion(p.tridionContent);
        byCode.set(p.code, {
          code: p.code,
          name: p.name ?? p.code,
          eyebrow,
          imageUrl,
          legalDesc: p.legalDesc ?? '',
          fromPrice: p.price?.value ?? null,
        });
      }
    });

    // A pass whose on-sale window fell between two samples is still real. Carry
    // it as a bare entry; the calendar lookup decides whether it has anything
    // left, and the delisting sweep in the fetcher drops it once it stays gone.
    let carried = 0;
    for (const code of known) {
      if (byCode.has(code)) continue;
      byCode.set(code, {
        code, name: code, eyebrow: '', imageUrl: '', legalDesc: '', fromPrice: null,
        carriedOver: true,
      });
      carried++;
    }

    const entries = [...byCode.values()];
    console.log(
      `[usj] catalog: ${entries.length} products across ${samples.length} sampled dates ` +
      `(${carried} carried over from the previous run)`,
    );
    return entries;
  },

  async fetchProduct(
    entry: CatalogEntry,
    range: DateRange,
    deep: boolean,
    previous: ProductResult | null,
  ): Promise<ProductResult> {
    const data = await fetchCalendar(range.start, range.end, entry.code);
    const calDates = data.eventAvailability?.[0]?.calendarDates ?? [];
    const dates = calDates.map(parseCalendarDate);

    const availableDates = dates.filter(d => d.available);
    const latestDate =
      availableDates[availableDates.length - 1]?.date ??
      dates[dates.length - 1]?.date ??
      '';

    const attractionNames: Record<string, string> = { ...(previous?.attractionNames ?? {}) };
    let nonTimedAttractions = previous?.nonTimedAttractions ?? [];
    let pageUrl = previous?.url || FALLBACK_PAGE_URL;

    try {
      ({ nonTimed: nonTimedAttractions, pageUrl } = await fetchProductInfo(entry.code, attractionNames));
    } catch (err) {
      console.error(`[usj] ${entry.code} product info failed: ${err instanceof Error ? err.message : err}`);
    }

    const result: ProductResult = {
      code: entry.code,
      // A carried-over entry has no catalogue text of its own; keep the last
      // run's rather than showing the bare product code.
      name: entry.name === entry.code ? previous?.name ?? entry.name : entry.name,
      eyebrow: entry.eyebrow || previous?.eyebrow || '',
      imageUrl: entry.imageUrl || previous?.imageUrl || '',
      legalDesc: entry.legalDesc || previous?.legalDesc || '',
      url: pageUrl,
      currency: CURRENCY,
      people: PEOPLE,
      deep,
      fetchedAt: new Date().toISOString(),
      calendarStart: range.start,
      calendarEnd: range.end,
      latestDate,
      dates,
      attractionNames,
      nonTimedAttractions,
    };

    if (!deep || !latestDate) return result;

    // Time slots need one request per date, so they are looked up only for the
    // on-sale dates in the month leading up to the latest one — the window
    // worth watching. Dates outside it keep timeSlots: null, which the UI
    // renders as "not fetched".
    const windowStart = shiftMonths(latestDate, -SLOT_WINDOW_MONTHS);
    const targets = dates.filter(d => d.available && d.date >= windowStart && d.date <= latestDate);
    const previousByDate = new Map((previous?.dates ?? []).map(d => [d.date, d]));
    const now = Date.now();

    let refreshed = 0;
    let carried = 0;

    for (const target of targets) {
      const prev = previousByDate.get(target.date);

      if (!slotsAreStale(target, prev, now)) {
        target.timeSlots = prev!.timeSlots;
        target.slotsFetchedAt = prev!.slotsFetchedAt;
        carried++;
        continue;
      }

      // Out of budget: keep whatever the last run knew rather than blanking the
      // date, and let the next run pick the refresh up.
      if (budgetExhausted()) {
        if (prev?.timeSlots) {
          target.timeSlots = prev.timeSlots;
          target.slotsFetchedAt = prev.slotsFetchedAt;
          carried++;
        }
        continue;
      }

      try {
        target.timeSlots = await fetchTimeSlots(entry.code, target.date, attractionNames);
        await fetchSlotStock(target.date, target.timeSlots);
        target.slotsFetchedAt = new Date().toISOString();
        refreshed++;
      } catch (err) {
        // Losing one date's slot lookup must not lose the rest of the run.
        console.error(`[usj]   ${entry.code} ${target.date} failed: ${err instanceof Error ? err.message : err}`);
        if (prev?.timeSlots) {
          target.timeSlots = prev.timeSlots;
          target.slotsFetchedAt = prev.slotsFetchedAt;
        }
      }
    }

    console.log(
      `[usj] ${entry.code}: ${availableDates.length}/${dates.length} dates available, ` +
      `slots refreshed ${refreshed}, carried ${carried} of ${targets.length}`,
    );

    return result;
  },
};
