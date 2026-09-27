/* 嵯峨野小火車剩餘座位矩陣。
 *
 * Classic script, no build step. The pure helpers at the top are exported
 * through `module.exports` so `npm test` can require this file in node; the
 * DOM part at the bottom only runs when there is a document. */
(function () {
  'use strict';

  // Same value as index.html: the fetcher runs every 30 min, so 90 minutes of
  // silence means something is wrong.
  const STALE_MS = 90 * 60 * 1000;
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const DIRECTIONS = ['down', 'up'];
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  /** Today's calendar date in Japan, as YYYY-MM-DD. */
  function todayJST(nowMs) {
    return new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10);
  }

  // Fewer seats than this marks a train 即將售完. Sagano's own value, not USJ's.
  const SCARCE_THRESHOLD = 20;

  function trainsOf(day, direction) {
    const list = day && day[direction];
    return Array.isArray(list) && list.length > 0 ? list : null;
  }

  /** 'soldout' | 'scarce' | 'ok' for one train. */
  function cellState(train) {
    const n = train.remaining;
    if (train.available === false || n === 0) return 'soldout';
    return n > 0 && n < SCARCE_THRESHOLD ? 'scarce' : 'ok';
  }

  /**
   * Rows are every date from today (JST), ascending, each with a status:
   * 'notOnSale' past saleWindowEnd (decided by the sale rule alone),
   * 'suspended' when the day is SUSPENDED or has no trains this direction,
   * otherwise 'open'. Columns are the union of open rows' trains by id,
   * ordered by origin departure. An open row's cell is null when that train
   * does not run that day, else { remaining, state }. An open row also
   * carries `total`: the day's remaining seats in this direction, summed over
   * all its trains, sold-out trains counted as 0.
   */
  function buildMatrix(days, direction, today, saleWindowEnd) {
    const shown = (Array.isArray(days) ? days : [])
      .filter(d => d && typeof d.date === 'string' && d.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const statusOf = day =>
      day.date > saleWindowEnd ? 'notOnSale'
        : day.servicePattern === 'SUSPENDED' || !trainsOf(day, direction) ? 'suspended'
          : 'open';

    const byId = new Map();
    for (const day of shown) {
      if (statusOf(day) !== 'open') continue;
      for (const t of trainsOf(day, direction)) {
        const id = String(t.id);
        if (!byId.has(id)) byId.set(id, { id, departure: String(t.departure || ''), name: String(t.name || '') });
      }
    }
    const columns = [...byId.values()].sort((a, b) =>
      a.departure < b.departure ? -1 : a.departure > b.departure ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

    const rows = shown.map(day => {
      const status = statusOf(day);
      if (status !== 'open') return { date: day.date, status, cells: [] };
      const trains = trainsOf(day, direction);
      const byTrain = new Map(trains.map(t => [String(t.id), t]));
      let total = 0;
      for (const t of trains) {
        const n = Number(t.remaining);
        if (cellState(t) !== 'soldout' && Number.isFinite(n) && n > 0) total += n;
      }
      return {
        date: day.date,
        status,
        total,
        cells: columns.map(c => {
          const t = byTrain.get(c.id);
          return t && t.remaining != null ? { remaining: t.remaining, state: cellState(t) } : null;
        }),
      };
    });
    return { columns, rows };
  }

  /** Stale when the fetcher said so, or the last fetch is over STALE_MS old. */
  function isStale(data, nowMs) {
    if (!data || data.stale === true) return true;
    const fetched = Date.parse(data.fetchedAt);
    if (Number.isNaN(fetched)) return true;
    return nowMs - fetched > STALE_MS;
  }

  function fmtJST(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString('zh-TW', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }) + ' JST';
    } catch (e) {
      return String(iso);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function weekday(date) {
    return WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
  }

  /**
   * The stops of one train from days.json's `timetable`, or null when there
   * is none (e.g. a file written before the timetable existed).
   */
  function stopsFor(data, id) {
    const tt = data && data.timetable;
    if (!tt || typeof tt !== 'object') return null;
    const stops = Object.prototype.hasOwnProperty.call(tt, String(id)) ? tt[String(id)] : null;
    return Array.isArray(stops) && stops.length > 0 ? stops : null;
  }

  /** Throws unless the response body looks like days.json. */
  function checkDays(json) {
    if (!json || !Array.isArray(json.days) || typeof json.saleWindowEnd !== 'string') throw new Error('資料格式不符');
    return json;
  }

  const api = { STALE_MS, SCARCE_THRESHOLD, buildMatrix, isStale, fmtJST, todayJST, checkDays, stopsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document === 'undefined') return;

  /* ------------------------------ DOM ------------------------------ */

  let data = null;
  let direction = 'down';
  // Train id whose timetable panel is open, or null.
  let openId = null;

  const ROW_LABELS = { suspended: '運休', notOnSale: '尚未開賣' };

  function renderCell(c) {
    if (c == null) return '<td></td>';
    if (c.state === 'soldout') return '<td class="soldout">售完</td>';
    return `<td${c.state === 'scarce' ? ' class="scarce"' : ''}>${esc(c.remaining)}</td>`;
  }

  function renderMatrix() {
    const host = document.getElementById('matrix');
    const { columns, rows } = buildMatrix(data.days, direction, todayJST(Date.now()), data.saleWindowEnd);
    if (rows.length === 0) {
      host.innerHTML = '<div class="empty">目前沒有可顯示的班次資料。</div>';
      return;
    }
    if (openId != null && !columns.some(c => c.id === openId)) openId = null;
    const head = columns.map(c => {
      const [h, m] = c.departure.split(':');
      const label = `${c.name} ${c.departure} 各站時刻`.trim();
      const open = c.id === openId;
      return `<th scope="col"${open ? ' class="open"' : ''}>` +
        `<button type="button" class="col-btn" data-id="${esc(c.id)}" aria-expanded="${open}" ` +
        `aria-controls="timetable" title="${esc(label)}" aria-label="${esc(label)}">` +
        `<span class="hh">${esc(h ? Number(h) : '')}</span><span class="mm">${esc(m || '')}</span></button></th>`;
    }).join('');
    const body = rows.map(r => {
      const [, mo, dd] = r.date.split('-');
      const wd = weekday(r.date);
      const wdClass = wd === '六' ? ' sat' : wd === '日' ? ' sun' : '';
      const cells = r.status === 'open' ? r.cells.map(renderCell).join('')
        : `<td class="row-label ${r.status}" colspan="${Math.max(columns.length, 1)}">${ROW_LABELS[r.status]}</td>`;
      const total = r.status === 'open' && typeof r.total === 'number'
        ? `<span class="t" title="當日剩餘合計">${esc(r.total)}</span>` : '';
      return `<tr><th scope="row"><span class="d">${Number(mo)}/${esc(dd)}</span>` +
        `<span class="w${wdClass}">${wd}</span>${total}</th>${cells}</tr>`;
    }).join('');
    host.innerHTML =
      `<table class="matrix"><colgroup><col class="c-date">${columns.map(() => '<col>').join('')}</colgroup>` +
      `<thead><tr><th scope="col" class="corner">日期</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
    host.querySelectorAll('.col-btn').forEach(b => {
      b.addEventListener('click', () => toggleTimetable(b.dataset.id, columns));
    });
    renderTimetable(columns);
  }

  function toggleTimetable(id, columns) {
    openId = openId === id ? null : id;
    document.querySelectorAll('#matrix .col-btn').forEach(b => {
      const open = b.dataset.id === openId;
      b.setAttribute('aria-expanded', String(open));
      b.parentElement.classList.toggle('open', open);
    });
    renderTimetable(columns);
  }

  function renderTimetable(columns) {
    const panel = document.getElementById('timetable');
    if (openId == null) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    const col = (columns || []).find(c => c.id === openId);
    const title = col ? `${col.name} ${col.departure}`.trim() : openId;
    const stops = stopsFor(data, openId);
    const body = stops
      ? '<table class="tt"><thead><tr><th scope="col">車站</th><th scope="col">到</th><th scope="col">開</th></tr></thead><tbody>' +
        stops.map(s => `<tr><th scope="row">${esc(s && s.station)}</th>` +
          `<td>${esc((s && s.arrival) || '—')}</td><td>${esc((s && s.departure) || '—')}</td></tr>`).join('') +
        '</tbody></table>'
      : '<div class="tt-empty">無時刻資料</div>';
    panel.innerHTML = `<div class="tt-title">${esc(title)}</div>${body}`;
    panel.hidden = false;
  }

  function renderMeta() {
    document.getElementById('updated-at').textContent = fmtJST(data.updatedAt);
    document.getElementById('fetched-at').textContent = fmtJST(data.fetchedAt);
    document.getElementById('stale').hidden = !isStale(data, Date.now());
  }

  function setDirection(next) {
    if (!DIRECTIONS.includes(next)) return;
    if (next !== direction) openId = null;
    direction = next;
    document.querySelectorAll('.toggle button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.dir === direction));
    });
    if (data) renderMatrix();
  }

  function showError(message) {
    document.getElementById('matrix').innerHTML =
      `<div class="error-box">資料載入失敗：${esc(message)}</div>`;
  }

  async function load() {
    try {
      const res = await fetch(`./data/sagano/days.json?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = checkDays(await res.json());
      renderMeta();
      renderMatrix();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  function init() {
    document.getElementById('scarce-threshold').textContent = String(SCARCE_THRESHOLD);
    document.querySelectorAll('.toggle button').forEach(b => {
      b.addEventListener('click', () => setDirection(b.dataset.dir));
    });
    setDirection('down');
    load();
    // A phone tab restored from the background must not keep showing old numbers.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
