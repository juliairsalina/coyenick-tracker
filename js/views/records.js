import { RECORD_TYPES, isAbnormal, monthlySeries, recordSummary, weightHistory } from '../model.js';
import { barChart, lineChart } from '../charts.js';
import { openQuickAdd, openRecordForm } from '../forms.js';
import { icon } from '../icons.js';
import { $, $$, avatar, emptyState } from '../ui.js';
import { addDays, esc, fmtDate, fromKg, monthKey, relativeDay, todayKey } from '../utils.js';

const view = { catId: null, category: '', q: '', range: '90', tab: 'log' };

const RANGES = { 30: 'Last 30 days', 90: 'Last 3 months', 365: 'Last year', all: 'All time' };

export function trendsHtml(st, catId) {
  const today = todayKey();
  const recs = st.records.filter((r) => r.catId === catId);
  const units = st.settings.units;
  const weights = weightHistory(st, catId).map((r) => ({ date: r.date, value: Math.round(fromKg(Number(r.weight), units) * 10) / 10 }));
  const asthma = monthlySeries(recs.filter((r) => r.category === 'asthma'), 6, today, (r) => Number(r.episodes) || 1);
  const appetite = monthlySeries(recs.filter((r) => r.category === 'appetite' && r.status !== 'normal'), 6, today);
  const symptoms = monthlySeries(recs.filter((r) => isAbnormal(r) && r.category !== 'asthma' && r.category !== 'appetite'), 6, today);
  return `
    <div class="chart-card"><h3>Weight (${units})</h3>${lineChart(weights, { unit: ` ${units}`, label: 'Weight over time' })}</div>
    <div class="chart-card"><h3>Asthma episodes / month</h3>${barChart(asthma, { label: 'Asthma episodes per month' })}</div>
    <div class="chart-card"><h3>Appetite problems / month</h3>${barChart(appetite, { label: 'Days with abnormal appetite per month' })}</div>
    <div class="chart-card"><h3>Other symptoms / month</h3>${barChart(symptoms, { label: 'Other abnormal entries per month' })}</div>`;
}

export function recordRow(r, st, { showCat = true } = {}) {
  const def = RECORD_TYPES[r.category];
  const cat = st.cats.find((c) => c.id === r.catId);
  return `<li class="item${isAbnormal(r) ? ' is-flag' : ''}">
    <button class="item-main" data-record="${r.id}">
      <span class="item-icon">${icon(def?.icon ?? 'report')}</span>
      <span class="item-text">
        <span class="item-title">${esc(def?.short || def?.label || r.category)}${showCat && cat ? ` <span class="item-cat">– ${esc(cat.name)}</span>` : ''}</span>
        <span class="item-sub">${esc(recordSummary(r, st.settings.units))}</span>
        ${r.notes ? `<span class="item-note">${esc(r.notes)}</span>` : ''}
      </span>
      ${r.photo ? `<img class="item-thumb" src="${r.photo}" alt="">` : ''}
    </button>
  </li>`;
}

export function bindRecordRows(root, st) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-record]');
    if (!b) return;
    const rec = st.records.find((r) => r.id === b.dataset.record);
    if (rec) openRecordForm({ record: rec });
  });
}

export function renderRecords(container, st) {
  const root = document.createElement('div');
  container.replaceChildren(root);
  const cats = st.cats.filter((c) => !c.archived);
  if (view.catId && !cats.some((c) => c.id === view.catId)) view.catId = null;
  const trendCat = view.catId || (cats.length === 1 ? cats[0].id : st.ui.lastCatId && cats.some((c) => c.id === st.ui.lastCatId) ? st.ui.lastCatId : cats[0]?.id);

  const from = view.range === 'all' ? '0000-00-00' : addDays(todayKey(), -Number(view.range));
  const q = view.q.toLowerCase();
  const list = st.records
    .filter((r) => (!view.catId || r.catId === view.catId)
      && (!view.category || r.category === view.category)
      && r.date >= from
      && (!q || `${RECORD_TYPES[r.category]?.label} ${RECORD_TYPES[r.category]?.hint ?? ''} ${recordSummary(r)} ${r.notes ?? ''}`.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  const groups = {};
  for (const r of list) (groups[r.date] ??= []).push(r);

  root.innerHTML = `
    <header class="page-head">
      <h1>Records</h1>
      <a class="btn btn-small btn-ghost" href="#report/${trendCat ?? ''}/${monthKey(todayKey())}">${icon('report')} Report</a>
    </header>

    ${cats.length > 1 ? `<div class="filter-row" role="radiogroup" aria-label="Filter by cat">
      <button class="chip${!view.catId ? ' on' : ''}" data-cat="">All cats</button>
      ${cats.map((c) => `<button class="chip cat-chip${view.catId === c.id ? ' on' : ''}" data-cat="${c.id}">${avatar(c, 'xs')}${esc(c.name)}</button>`).join('')}
    </div>` : ''}

    <div class="segmented" role="tablist">
      <button role="tab" data-tab="log" aria-selected="${view.tab === 'log'}">History</button>
      <button role="tab" data-tab="trends" aria-selected="${view.tab === 'trends'}">Trends</button>
    </div>

    ${view.tab === 'trends' ? `
      ${trendCat ? `<p class="muted center">${esc(cats.find((c) => c.id === trendCat)?.name ?? '')}${cats.length > 1 && !view.catId ? ' · pick a cat above to switch' : ''}</p>
        <div class="charts">${trendsHtml(st, trendCat)}</div>` : ''}
    ` : `
      <div class="filters">
        <input type="search" placeholder="Search records…" value="${esc(view.q)}" data-q aria-label="Search records">
        <div class="row-2">
          <select data-category aria-label="Category">
            <option value="">All categories</option>
            ${Object.entries(RECORD_TYPES).map(([k, d]) => `<option value="${k}" ${view.category === k ? 'selected' : ''}>${d.label}</option>`).join('')}
          </select>
          <select data-range aria-label="Date range">
            ${Object.entries(RANGES).map(([k, l]) => `<option value="${k}" ${view.range === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      ${list.length ? Object.entries(groups).map(([date, recs]) => `
        <section class="day-group">
          <h3 class="day-label">${relativeDay(date)}${relativeDay(date) !== fmtDate(date) ? ` · <span class="muted">${fmtDate(date)}</span>` : ''}</h3>
          <ul class="items card">${recs.map((r) => recordRow(r, st, { showCat: !view.catId && cats.length > 1 })).join('')}</ul>
        </section>`).join('')
        : emptyState('records', st.records.length ? 'No matching records' : 'No records yet', st.records.length ? 'Try another filter or search.' : 'Tap + to log stool, eyes, asthma, weight and more. It only takes a tap or two.',
          st.records.length ? '' : '<button class="btn btn-primary" data-quick>+ Add record</button>')}
    `}`;

  const rerender = () => renderRecords(container, st);
  $$('[data-cat]', root).forEach((b) => b.addEventListener('click', () => { view.catId = b.dataset.cat || null; rerender(); }));
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.tab; rerender(); }));
  $('[data-category]', root)?.addEventListener('change', (e) => { view.category = e.target.value; rerender(); });
  $('[data-range]', root)?.addEventListener('change', (e) => { view.range = e.target.value; rerender(); });
  const search = $('[data-q]', root);
  search?.addEventListener('input', (e) => {
    view.q = e.target.value;
    clearTimeout(search.timer);
    search.timer = setTimeout(() => {
      rerender();
      const s = $('[data-q]', container);
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    }, 250);
  });
  $('[data-quick]', root)?.addEventListener('click', () => openQuickAdd({ catId: view.catId }));
  bindRecordRows(root, st);
}
