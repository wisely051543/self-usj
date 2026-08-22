import {
  CatalogEntry,
  DateRange,
  DateSlot,
  Localized,
  ProductResult,
  SlotEvent,
  Source,
  TimeSlot,
} from '../types';
import { dayOfWeek, everyNthDay, shiftMonths } from '../dates';
import { BlockedError, budgetExhausted, limitedFetch, mapLimit } from '../limiter';

/**
 * Everything is fetched for a party of one. The store hides whatever it cannot
 * sell to the party asked about, so a larger number would silently drop slots;
 * asking for one and recording each slot's remaining units lets the UI filter
 * by party size itself.
 */
const PEOPLE = 1;
const CURRENCY = 'JPY';

/**
 * Reverse-engineered from the storefront's own network traffic, not a published
 * integration point: no public documentation, no terms of use covering this
 * endpoint, and no API key. It is not a stable contract and can change or
 * disappear without notice.
 */
const API_BASE = 'https://comm-api.usj.co.jp/occ/v2/b2cportal';

/**
 * The languages the store answers in. `ja` is the source of truth — it is the
 * only one where the catalogue carries a pass's name, its display prefix and
 * its blurb at all; asking in English returns the bare product code for those.
 * What English does carry is attraction names, which is why it is fetched: they
 * are the one localized string worth having from the store rather than from the
 * hand-kept term tables in i18n/.
 *
 * Chinese is not here because the API rejects it outright
 * (`UnsupportedLanguageError`); zh-TW is served entirely from the term tables.
 */
const PRIMARY_LANG = 'ja';
const NAME_LANGS = ['en'] as const;
/**
 * Where a pass is actually bought. The product API hands back a path on the
 * marketing site, which describes the pass but cannot sell it; the store page
 * is keyed by the same product code, so it is built rather than fetched.
 */
const STORE_BASE = 'https://store.usj.co.jp/ja/jp/store/c/expresspass';
const storeUrl = (code: string) => `${STORE_BASE}/${code}`;

/**
 * How far back from the latest released date time slots are looked up. USJ
 * opens dates on a rolling horizon, roughly one new date a day, so the month
 * behind the latest one is the month most recently put on sale — the band where
 * stock is fullest and moves fastest. The slot list costs one request per date,
 * which is what keeps this a window rather than the whole six-month calendar.
 */
const SLOT_WINDOW_MONTHS = 1;

/**
 * How many (date, variant) pairs go into one inventory request. The store
 * answers several hundred without complaint; a hundred keeps any single
 * response near 110KB and any single failure cheap to retry.
 */
const STOCK_BATCH_SIZE = 100;

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

/**
 * Header set shared by all four `limitedFetch` call sites below. Exported so
 * the NFR7 regression test (src/sources/usj.test.ts) can assert on this object
 * itself, rather than inferring its contents from the source text.
 *
 * Frozen because one shared reference is what makes "lock it once, lock every
 * call site" true: without the freeze a single call site could mutate the
 * object in place and silently re-identify the other three. `Object.freeze`
 * stops that at runtime — as a thrown TypeError under the strict mode this
 * module compiles to, as a silent no-op were it ever otherwise, but either way
 * the header set is unchanged. The readonly types it returns catch
 * a direct write earlier, at compile time, but only through this binding —
 * TypeScript ignores `readonly` when checking assignability, so widening the
 * value into a `Record<string, string>` first typechecks, and so does every
 * write through it. The runtime freeze is the barrier that has no such hole.
 *
 * The freeze only guarantees the object cannot be *changed*; it cannot
 * guarantee the four call sites still pass it through untouched. That half is
 * enforced by a second, source-text regression test in src/sources/usj.test.ts,
 * which counts the call sites in this file and checks each one hands this
 * constant over verbatim rather than spreading or overriding it.
 */
export const HEADERS = Object.freeze({
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'x-anonymous-consents': '%5B%5D',
  'Accept-Language': 'ja-JP',
} as const);

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

interface Availability {
  partNumber: string;
  calendarDates: CalendarDate[];
}

interface CalendarResponse {
  eventAvailability: Availability[];
}

/** One part number over one date range, as the inventory endpoint wants it. */
interface InventoryQuery {
  startDate: string;             // YYYY-MM-DD
  endDate: string;               // YYYY-MM-DD
  partNumber: string;
}

/**
 * Inventory for any number of part numbers. partNumber is the product code for
 * whole-day totals, or a variant code for a single time slot — the store
 * answers the same shape either way, which is the only route to a per-slot
 * remaining count.
 *
 * The endpoint takes a list, and each answer names its own part number, so
 * hundreds of slots spanning many dates come back in one round trip instead of
 * one request each. That is what makes per-slot counts affordable for every
 * pass rather than a hand-picked few.
 */
async function fetchInventory(queries: InventoryQuery[]): Promise<Availability[]> {
  const url = `${API_BASE}/products/fetchCalendarDatesWithPriceAndInventory?lang=ja&curr=${CURRENCY}`;
  const payload = {
    currency: CURRENCY,
    events: queries.map(q => ({
      startDate: `${q.startDate} 00:00:01`,
      endDate: q.endDate,
      partNumber: q.partNumber,
      quantity: PEOPLE,
    })),
  };

  const res = await limitedFetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Calendar API returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as CalendarResponse;
  return body.eventAvailability ?? [];
}

export function parseCalendarDate(cd: CalendarDate): DateSlot {
  const inv = cd.inventoryEvents[0] ?? { availableUnits: '0', maxAvailable: '0', totalCapacity: '0' };
  const pricing = cd.pricing[0] ?? { amount: 0, formattedAmount: '¥0' };
  const availableUnits = parseInt(inv.availableUnits, 10) || 0;
  const maxAvailable = parseInt(inv.maxAvailable, 10) || 0;
  const totalCapacity = parseInt(inv.totalCapacity, 10) || 0;

  const available = cd.canBeVisited && !cd.forceSoldOut && availableUnits > 0;

  return {
    date: cd.date,
    dayOfWeek: dayOfWeek(cd.date),
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

/**
 * The store ships some strings decomposed: ジ arrives as シ plus a combining
 * dakuten rather than as the single precomposed character. The two render
 * identically and compare unequal, so a term table written the normal way
 * silently fails to match those products. Everything text-shaped is folded to
 * NFC on the way in, which is the one place that can fix it for good.
 */
function nfc(s: string): string {
  return (s ?? '').normalize('NFC');
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
  names: Record<string, Localized>,
): Promise<TimeSlot[]> {
  const url =
    `${API_BASE}/products/getExpressPassVariantDetails` +
    `?baseProductCode=${productCode}&selectedDate=${toMMDDYYYY(date)}` +
    `&selectedQty=${PEOPLE}&lang=${PRIMARY_LANG}&curr=${CURRENCY}`;

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
      // Slots are only ever fetched in the primary language, so this fills the
      // Japanese name and leaves the translations to fetchProductInfo.
      (names[code] ??= { ja: nfc(e.eventName) }).ja ||= nfc(e.eventName);

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
 * Fill in every slot's remaining units across the dates handed in.
 *
 * This is what lets the page answer party-size questions offline, since a slot
 * fits a party exactly when enough is left. Batching matters: a month of dates
 * for one pass is a few hundred slots, which used to be a few hundred requests
 * and is now two or three.
 */
async function fetchSlotStock(dates: DateSlot[]): Promise<void> {
  const pairs = dates.flatMap(date => (date.timeSlots ?? []).map(slot => ({ date: date.date, slot })));
  if (pairs.length === 0) return;

  const batches: Array<typeof pairs> = [];
  for (let i = 0; i < pairs.length; i += STOCK_BATCH_SIZE) {
    batches.push(pairs.slice(i, i + STOCK_BATCH_SIZE));
  }

  await mapLimit(batches, async batch => {
    try {
      const availability = await fetchInventory(
        batch.map(p => ({ startDate: p.date, endDate: p.date, partNumber: p.slot.variantCode })),
      );

      // Answers carry their own part number, so they are matched by key rather
      // than by position — the store is free to reorder or drop entries.
      const units = new Map<string, number>();
      for (const entry of availability) {
        for (const day of entry.calendarDates ?? []) {
          const raw = day.inventoryEvents?.[0]?.availableUnits;
          if (raw != null) units.set(`${entry.partNumber}@${day.date}`, parseInt(raw, 10));
        }
      }

      for (const p of batch) {
        p.slot.availableUnits = units.get(`${p.slot.variantCode}@${p.date}`) ?? null;
      }
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      // A missing count only costs these slots their party-size filter.
      const span = `${batch[0].date}..${batch[batch.length - 1].date}`;
      console.error(`[usj]   stock batch ${span} failed: ${err instanceof Error ? err.message : err}`);
    }
  });
}

/**
 * The base product carries three things the calendar does not: which of its
 * attractions have a fixed entry window and which do not, and the store's own
 * path for this product — the only reliable way to link to it, since the paths
 * are Japanese slugs.
 *
 * The timed/non-timed split is what decides whether a pass is worth the slot
 * lookups at all. A pass with no TIMED attraction is a walk-up-any-time pass:
 * it has no slots to look up, and asking would waste a request per date.
 */
async function fetchProductInfo(
  productCode: string,
  names: Record<string, Localized>,
  lang: string,
): Promise<{ timed: string[]; nonTimed: string[] }> {
  const url = `${API_BASE}/products/${productCode}?fields=FULL&lang=${lang}&curr=${CURRENCY}`;
  const res = await limitedFetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Product API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { attractions?: { events?: VariantEvent[] } };
  const timed: string[] = [];
  const nonTimed: string[] = [];

  for (const e of body.attractions?.events ?? []) {
    const code = baseEventCode(e.eventCode);
    const entry = (names[code] ??= { ja: '' });
    if (lang === PRIMARY_LANG) entry.ja ||= nfc(e.eventName);
    else if (e.eventName) entry[lang as 'en'] = nfc(e.eventName);
    (e.maingroup === 'TIMED' ? timed : nonTimed).push(code);
  }

  return { timed: timed.sort(), nonTimed: nonTimed.sort() };
}

/**
 * Carry the previous run's names forward, whichever schema wrote them. Before
 * translations landed these were plain strings, and a run that read one as a
 * Localized would spread its characters into an object of digit keys.
 */
function normalizeNames(previous: unknown): Record<string, Localized> {
  const out: Record<string, Localized> = {};
  for (const [code, value] of Object.entries((previous ?? {}) as Record<string, unknown>)) {
    if (typeof value === 'string') out[code] = { ja: value };
    else if (value && typeof value === 'object') out[code] = { ...(value as Localized) };
  }
  return out;
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
      eyebrow: nfc(String(data.eyebrow ?? '')),
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

  async listProducts(range: DateRange, known: string[]): Promise<CatalogEntry[]> {
    const samples = everyNthDay(range.start, range.end, CATALOG_SAMPLE_DAYS);
    const byCode = new Map<string, CatalogEntry>();

    // A throwing callback only ends the worker it threw from; `mapLimit`'s other
    // workers keep pulling the remaining dates. Once a block has surfaced those
    // are all chasing the same wall, so this stops the ones not yet started.
    // Requests already in flight cannot be called back — that much detection lag
    // is known and accepted, and is why the round still stops on the throw below
    // rather than on this flag.
    let blocked = false;

    await mapLimit(samples, async date => {
      if (blocked) return;

      let products: SearchProduct[];
      try {
        products = await fetchCatalogPage(date);
      } catch (err) {
        // A continuing block is not one blind sample — it must not be swallowed
        // like one. Let it propagate so the round stops (AD-16 #1).
        if (err instanceof BlockedError) {
          blocked = true;
          throw err;
        }
        // One blind sample costs at most a product that no other sample saw.
        console.error(`[usj] catalog ${date} failed: ${err instanceof Error ? err.message : err}`);
        return;
      }

      for (const p of products) {
        if (!p.code || byCode.has(p.code)) continue;
        const { eyebrow, imageUrl } = parseTridion(p.tridionContent);
        byCode.set(p.code, {
          code: p.code,
          name: nfc(p.name ?? p.code),
          eyebrow,
          imageUrl,
          legalDesc: nfc(p.legalDesc ?? ''),
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
    previous: ProductResult | null,
  ): Promise<ProductResult> {
    const attractionNames = normalizeNames(previous?.attractionNames);
    let nonTimedAttractions = previous?.nonTimedAttractions ?? [];
    // Falling back to the last run's answer keeps a failed product-info call
    // from silently downgrading a slotted pass to "no slots" for a whole run.
    // A persistent block never reaches this fallback — it stops the round.
    let deep = previous?.deep ?? false;
    let classified = false;

    try {
      const info = await fetchProductInfo(entry.code, attractionNames, PRIMARY_LANG);
      ({ nonTimed: nonTimedAttractions } = info);
      deep = info.timed.length > 0;
      classified = true;
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      console.error(`[usj] ${entry.code} product info failed: ${err instanceof Error ? err.message : err}`);
    }

    // The same call again per translated language, for its attraction names
    // alone — the timed/non-timed split is language-independent and already
    // settled above. A failure here costs the page a translated name, which it
    // renders by falling back to the Japanese one, so it is never fatal.
    for (const lang of NAME_LANGS) {
      try {
        await fetchProductInfo(entry.code, attractionNames, lang);
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        console.error(`[usj] ${entry.code} ${lang} names failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    // A pass with no timed attraction is walk-up-any-time: it has no slots to
    // report, so the fetcher discards it and its calendar is a request spent on
    // nothing. Only skip it when the product API actually answered — an
    // unclassified pass still gets its calendar, so one failed call cannot
    // mistake a slotted pass for a walk-up one. As above, a persistent block
    // is not one of those failures: it stops the round instead.
    let dates: DateSlot[] = [];
    if (deep || !classified) {
      const [availability] = await fetchInventory([
        { startDate: range.start, endDate: range.end, partNumber: entry.code },
      ]);
      dates = (availability?.calendarDates ?? []).map(parseCalendarDate);
    }

    const availableDates = dates.filter(d => d.available);
    const latestDate =
      availableDates[availableDates.length - 1]?.date ??
      dates[dates.length - 1]?.date ??
      '';

    const result: ProductResult = {
      code: entry.code,
      // A carried-over entry has no catalogue text of its own; keep the last
      // run's rather than showing the bare product code.
      name: entry.name === entry.code ? previous?.name ?? entry.name : entry.name,
      eyebrow: entry.eyebrow || previous?.eyebrow || '',
      imageUrl: entry.imageUrl || previous?.imageUrl || '',
      legalDesc: entry.legalDesc || previous?.legalDesc || '',
      url: storeUrl(entry.code),
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

    // Slots are looked up for the month leading up to the latest released date.
    // The latest date itself goes first: it is the newest on sale, so it is
    // both the fullest and the fastest-moving, and putting it at the head means
    // a run that exhausts its budget has already fetched it. Dates outside the
    // window keep timeSlots: null, which the UI renders as "not fetched".
    const windowStart = shiftMonths(latestDate, -SLOT_WINDOW_MONTHS);
    const latest = availableDates.find(d => d.date === latestDate);
    const targets = [
      ...(latest ? [latest] : []),
      ...availableDates.filter(d => d.date >= windowStart && d.date < latestDate),
    ];

    const previousByDate = new Map((previous?.dates ?? []).map(d => [d.date, d]));
    const now = Date.now();

    // Slot lists come one date at a time; the remaining counts underneath them
    // are collected here and looked up in bulk once the lists are in.
    const pending: DateSlot[] = [];
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
        pending.push(target);
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        // Losing one date's slot lookup must not lose the rest of the run.
        console.error(`[usj]   ${entry.code} ${target.date} failed: ${err instanceof Error ? err.message : err}`);
        if (prev?.timeSlots) {
          target.timeSlots = prev.timeSlots;
          target.slotsFetchedAt = prev.slotsFetchedAt;
        }
      }
    }

    await fetchSlotStock(pending);
    // Stamped after the counts land, but from one clock reading: these dates
    // were all refreshed by the same pass, and staggering the stamps would only
    // stagger their next forced backfill.
    const stamp = new Date().toISOString();
    for (const target of pending) target.slotsFetchedAt = stamp;

    console.log(
      `[usj] ${entry.code}: ${availableDates.length}/${dates.length} dates available, ` +
      `slots refreshed ${pending.length}, carried ${carried} of ${targets.length}`,
    );

    return result;
  },
};
