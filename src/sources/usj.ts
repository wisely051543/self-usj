import { DateRange, DateSlot, SlotEvent, Source, SourceResult, TimeSlot } from '../types';
import { shiftMonths } from '../dates';

const PRODUCT_CODE = 'EXP0069';
const PRODUCT_NAME = 'ユニバーサル・エクスプレス・パス 4～トロッコ＆ジョーズ～';
const PEOPLE = 2;
const CURRENCY = 'JPY';
const API_BASE = 'https://comm-api.usj.co.jp/occ/v2/b2cportal';
/** Store front the b2cportal API belongs to; product paths hang off it. */
const SITE_BASE = 'https://www.usj.co.jp/web/ja/jp';
/** Used when the product API does not hand back its own path. */
const FALLBACK_PAGE_URL = `${SITE_BASE}/tickets-and-passes/express-pass`;

/** Courtesy gap between the per-date time-slot calls. */
const SLOT_REQUEST_GAP_MS = 150;

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

async function fetchCalendar(startDate: string, endDate: string): Promise<CalendarResponse> {
  const url = `${API_BASE}/products/fetchCalendarDatesWithPriceAndInventory?lang=ja&curr=${CURRENCY}`;
  const body = {
    currency: CURRENCY,
    events: {
      startDate: `${startDate} 00:00:01`,
      endDate,
      partNumber: PRODUCT_CODE,
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
 * that are still purchasable for the date come back — there is no per-slot unit
 * count, so a slot being listed is the availability signal.
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
      events,
    });
  }

  slots.sort((a, b) => a.from.localeCompare(b.from) || a.variantCode.localeCompare(b.variantCode));
  return slots;
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
          console.log(`[usj]   ${target.date}: ${target.timeSlots.length} slots`);
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
