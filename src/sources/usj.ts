import { DateRange, DateSlot, SlotEvent, Source, SourceResult, TimeSlot } from '../types';
import { nextDay, shiftMonths } from '../dates';

const PRODUCT_CODE = 'EXP0069';
const PRODUCT_NAME = 'ユニバーサル・エクスプレス・パス 4～トロッコ＆ジョーズ～';
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

/** Courtesy gap between the per-date time-slot calls. */
const SLOT_REQUEST_GAP_MS = 150;

/** Parallel per-slot inventory calls; the store answers each in ~50ms. */
const STOCK_CONCURRENCY = 6;

/**
 * How far back from the latest on-sale date time slots are looked up. Slots
 * cost one request per date, so this bounds the run at roughly a month of
 * on-sale dates instead of the whole six-month calendar.
 */
const SLOT_WINDOW_MONTHS = 1;

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
  partNumber = PRODUCT_CODE,
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

  const res = await fetch(url, {
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
async function fetchTimeSlots(date: string, names: Record<string, string>): Promise<TimeSlot[]> {
  const url =
    `${API_BASE}/products/getExpressPassVariantDetails` +
    `?baseProductCode=${PRODUCT_CODE}&selectedDate=${toMMDDYYYY(date)}` +
    `&selectedQty=${PEOPLE}&lang=ja&curr=${CURRENCY}`;

  const res = await fetch(url, { headers: HEADERS });
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

/** Run tasks with a ceiling on how many are in flight at once. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        await fn(items[next++]);
      }
    }),
  );
}

/**
 * Fill in each slot's remaining units. One request per slot, so this is the
 * expensive part of a run — but it is what lets the page answer party-size
 * questions offline, since a slot fits a party exactly when enough is left.
 */
async function fetchSlotStock(date: string, slots: TimeSlot[]): Promise<void> {
  await mapLimit(slots, STOCK_CONCURRENCY, async slot => {
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
  names: Record<string, string>,
): Promise<{ nonTimed: string[]; pageUrl: string }> {
  const url = `${API_BASE}/products/${PRODUCT_CODE}?fields=FULL&lang=ja&curr=${CURRENCY}`;
  const res = await fetch(url, { headers: HEADERS });
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const usjSource: Source = {
  id: 'usj',
  label: 'USJ 官網',

  async run(range: DateRange): Promise<SourceResult> {
    console.log(`[usj] fetching ${range.start} → ${range.end} for ${PRODUCT_CODE}, qty=${PEOPLE}...`);
    const data = await fetchCalendar(range.start, range.end);

    if (!data.eventAvailability?.length) {
      throw new Error('No eventAvailability in response');
    }

    const calDates = data.eventAvailability[0].calendarDates ?? [];
    const dates = calDates.map(parseCalendarDate);
    const availableDates = dates.filter(d => d.available);
    const latestDate =
      availableDates[availableDates.length - 1]?.date ??
      dates[dates.length - 1]?.date ??
      '';

    console.log(`[usj] ${availableDates.length} / ${dates.length} dates available, latest ${latestDate}`);

    // Time slots need one request per date, so they are looked up only for the
    // on-sale dates in the month leading up to the latest one — the window
    // worth watching. Dates outside it keep timeSlots: null, which the UI
    // renders as "not fetched".
    const attractionNames: Record<string, string> = {};
    let nonTimedAttractions: string[] = [];
    let pageUrl = FALLBACK_PAGE_URL;

    const windowStart = latestDate ? shiftMonths(latestDate, -SLOT_WINDOW_MONTHS) : '';
    const targets = latestDate
      ? dates.filter(d => d.available && d.date >= windowStart && d.date <= latestDate)
      : [];

    if (targets.length > 0) {
      console.log(`[usj] time slots for ${targets.length} dates in ${windowStart} → ${latestDate}`);

      try {
        ({ nonTimed: nonTimedAttractions, pageUrl } = await fetchProductInfo(attractionNames));
      } catch (err) {
        console.error(`[usj] product info failed: ${err instanceof Error ? err.message : err}`);
      }

      for (const target of targets) {
        try {
          await sleep(SLOT_REQUEST_GAP_MS);
          target.timeSlots = await fetchTimeSlots(target.date, attractionNames);
          await fetchSlotStock(target.date, target.timeSlots);

          const counted = target.timeSlots.filter(s => s.availableUnits != null);
          const left = counted.reduce((sum, s) => sum + (s.availableUnits ?? 0), 0);
          console.log(`[usj]   ${target.date}: ${target.timeSlots.length} slots, ${left} units across ${counted.length}`);
        } catch (err) {
          // Losing one date's slot lookup must not lose the rest of the run.
          console.error(`[usj]   ${target.date} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    return {
      id: 'usj',
      label: 'USJ 官網',
      url: pageUrl,
      productName: PRODUCT_NAME,
      productCode: PRODUCT_CODE,
      currency: CURRENCY,
      people: PEOPLE,
      fetchedAt: new Date().toISOString(),
      calendarStart: range.start,
      calendarEnd: range.end,
      latestDate,
      dates,
      attractionNames,
      nonTimedAttractions,
    };
  },
};
