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

  function trainsOf(day, direction) {
    const list = day && day[direction];
    return Array.isArray(list) && list.length > 0 ? list : null;
  }

  /**
   * Rows are dates from today (JST) whose day carries this direction's trains;
   * columns are the union of those trains by id, ordered by origin departure.
   * A train missing on a given day leaves that cell null.
   */
  function buildMatrix(days, direction, today) {
    const shown = (Array.isArray(days) ? days : [])
      .filter(d => d && typeof d.date === 'string' && d.date >= today && trainsOf(d, direction))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const byId = new Map();
    for (const day of shown) {
      for (const t of trainsOf(day, direction)) {
        const id = String(t.id);
        if (!byId.has(id)) byId.set(id, { id, departure: String(t.departure || ''), name: String(t.name || '') });
      }
    }
    const columns = [...byId.values()].sort((a, b) =>
      a.departure < b.departure ? -1 : a.departure > b.departure ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

    const rows = shown.map(day => {
      const remainingById = new Map(trainsOf(day, direction).map(t => [String(t.id), t.remaining]));
      return {
        date: day.date,
        cells: columns.map(c => (remainingById.has(c.id) && remainingById.get(c.id) != null ? remainingById.get(c.id) : null)),
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

  /** Throws unless the response body looks like days.json. */
  function checkDays(json) {
    if (!json || !Array.isArray(json.days)) throw new Error('資料格式不符');
    return json;
  }

  const api = { STALE_MS, buildMatrix, isStale, fmtJST, todayJST, checkDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document === 'undefined') return;

  /* ------------------------------ DOM ------------------------------ */

  let data = null;
  let direction = 'down';

  function renderMatrix() {
    const host = document.getElementById('matrix');
    const { columns, rows } = buildMatrix(data.days, direction, todayJST(Date.now()));
    if (columns.length === 0 || rows.length === 0) {
      host.innerHTML = '<div class="empty">目前沒有可顯示的班次資料。</div>';
      return;
    }
    const head = columns.map(c => {
      const [h, m] = c.departure.split(':');
      const label = `${c.name} ${c.departure}`.trim();
      return `<th scope="col" title="${esc(label)}" aria-label="${esc(label)}">` +
        `<span class="hh">${esc(h ? Number(h) : '')}</span><span class="mm">${esc(m || '')}</span></th>`;
    }).join('');
    const body = rows.map(r => {
      const [, mo, dd] = r.date.split('-');
      const wd = weekday(r.date);
      const wdClass = wd === '六' ? ' sat' : wd === '日' ? ' sun' : '';
      const cells = r.cells.map(v => `<td>${v == null ? '' : esc(v)}</td>`).join('');
      return `<tr><th scope="row"><span class="d">${Number(mo)}/${esc(dd)}</span>` +
        `<span class="w${wdClass}">${wd}</span></th>${cells}</tr>`;
    }).join('');
    host.innerHTML =
      `<table class="matrix"><colgroup><col class="c-date">${columns.map(() => '<col>').join('')}</colgroup>` +
      `<thead><tr><th scope="col" class="corner">日期</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderMeta() {
    document.getElementById('updated-at').textContent = fmtJST(data.updatedAt);
    document.getElementById('fetched-at').textContent = fmtJST(data.fetchedAt);
    document.getElementById('stale').hidden = !isStale(data, Date.now());
  }

  function setDirection(next) {
    if (!DIRECTIONS.includes(next)) return;
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
