import { DateRange, DateSlot, SlotEvent, Source, SourceResult, TimeSlot } from '../types';

const PRODUCT_CODE = 'EXP0069';
const PRODUCT_NAME = 'ユニバーサル・エクスプレス・パス 4～トロッコ＆ジョーズ～';
const PEOPLE = 2;
const CURRENCY = 'JPY';
const API_BASE = 'https://comm-api.usj.co.jp/occ/v2/b2cportal';
const PAGE_URL = 'https://www.usj.co.jp/tickets-and-passes/express-pass/';

/** Courtesy gap between the per-date time-slot calls. */
const SLOT_REQUEST_GAP_MS = 150;

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
 * The variant lookup only returns TIMED entries, so the attractions the pass
 * covers with no fixed window come from the base product instead.
 */
async function fetchNonTimedAttractions(names: Record<string, string>): Promise<string[]> {
  const url = `${API_BASE}/products/${PRODUCT_CODE}?fields=FULL&lang=ja&curr=${CURRENCY}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Product API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { attractions?: { events?: VariantEvent[] } };
  const codes: string[] = [];

  for (const e of body.attractions?.events ?? []) {
    if (e.maingroup === 'TIMED') continue;
    const code = baseEventCode(e.eventCode);
    names[code] ??= e.eventName;
    codes.push(code);
  }
  return codes.sort();
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

    // One extra request per on-sale date. Sold-out dates have nothing to list,
    // so they keep timeSlots: null and cost nothing.
    const attractionNames: Record<string, string> = {};
    let nonTimedAttractions: string[] = [];
    let slotFailures = 0;

    try {
      nonTimedAttractions = await fetchNonTimedAttractions(attractionNames);
    } catch (err) {
      console.error(`[usj] non-timed attractions failed: ${err instanceof Error ? err.message : err}`);
    }

    for (const [i, slot] of availableDates.entries()) {
      if (i > 0) await sleep(SLOT_REQUEST_GAP_MS);
      try {
        slot.timeSlots = await fetchTimeSlots(slot.date, attractionNames);
      } catch (err) {
        // A per-date failure should not lose the calendar data we already have.
        slotFailures++;
        console.error(`[usj] time slots for ${slot.date} failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    const withSlots = availableDates.filter(d => d.timeSlots && d.timeSlots.length > 0);
    console.log(
      `[usj] time slots: ${withSlots.length} dates have slots` +
        (slotFailures ? `, ${slotFailures} lookups failed` : '')
    );

    return {
      id: 'usj',
      label: 'USJ 官網',
      url: PAGE_URL,
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
