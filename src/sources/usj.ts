import { DateRange, DateSlot, Source, SourceResult } from '../types';

const PRODUCT_CODE = 'EXP0069';
const PRODUCT_NAME = 'ユニバーサル・エクスプレス・パス 4～トロッコ＆ジョーズ～';
const PEOPLE = 2;
const CURRENCY = 'JPY';
const API_BASE = 'https://comm-api.usj.co.jp/occ/v2/b2cportal';
const PAGE_URL = 'https://www.usj.co.jp/tickets-and-passes/express-pass/';

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
  };
}

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
    };
  },
};
