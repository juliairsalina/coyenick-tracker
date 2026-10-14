import { EVENT_TYPES, agenda } from '../model.js';
import { bindItemActions, openEventForm } from '../forms.js';
import { icon } from '../icons.js';
import { $, $$, avatar } from '../ui.js';
import { addDays, addMonths, esc, fmtLongDate, fmtMonth, monthStart, parseKey, todayKey } from '../utils.js';
import { agendaRow } from './home.js';

// View state survives re-renders (e.g. after marking something done).
const view = { month: null, selected: null, catId: null };

export function renderCalendar(container, st) {
  // Fresh element per render so delegated listeners never stack up.
  const root = document.createElement('div');
  container.replaceChildren(root);
  const today = todayKey();
  view.selected ??= today;
  view.month ??= monthStart(today);
  const cats = st.cats.filter((c) => !c.archived);
  if (view.catId && !cats.some((c) => c.id === view.catId)) view.catId = null;

  // Grid starts on Monday.
  const first = parseKey(view.month);
  const gridStart = addDays(view.month, -((first.getDay() + 6) % 7));
  const gridEnd = addDays(gridStart, 41);
  const items = agenda(st, gridStart, gridEnd, { catId: view.catId });
  const byDate = {};
  for (const i of items) (byDate[i.date] ??= []).push(i);
  const dayItems = byDate[view.selected] ?? agenda(st, view.selected, view.selected, { catId: view.catId });

  const cells = [];
  for (let k = gridStart; k <= gridEnd; k = addDays(k, 1)) {
    const list = byDate[k] ?? [];
    // One dot per type so a daily medication doesn't drown everything else.
    const types = [...new Set(list.map((i) => i.type))].slice(0, 4);
    const open = list.filter((i) => !i.done).length;
    cells.push(`<button class="day${k.slice(0, 7) !== view.month.slice(0, 7) ? ' other' : ''}${k === today ? ' today' : ''}${k === view.selected ? ' selected' : ''}" data-day="${k}"
        aria-label="${fmtLongDate(k)}${list.length ? `, ${list.length} item${list.length === 1 ? '' : 's'}` : ''}" aria-pressed="${k === view.selected}">
      <span class="day-num">${parseKey(k).getDate()}</span>
      <span class="dots">${types.map((t) => `<i class="dot-${EVENT_TYPES[t].color}${list.every((i) => i.type !== t || i.done) ? ' faded' : ''}"></i>`).join('')}</span>
      ${open > 4 ? `<span class="day-more">${open}</span>` : ''}
    </button>`);
  }

  root.innerHTML = `
    <header class="page-head">
      <h1>Calendar</h1>
    </header>

    ${cats.length > 1 ? `<div class="filter-row" role="radiogroup" aria-label="Filter by cat">
      <button class="chip${!view.catId ? ' on' : ''}" data-cat="" role="radio" aria-checked="${!view.catId}">All cats</button>
      ${cats.map((c) => `<button class="chip cat-chip${view.catId === c.id ? ' on' : ''}" data-cat="${c.id}" role="radio" aria-checked="${view.catId === c.id}">${avatar(c, 'xs')}${esc(c.name)}</button>`).join('')}
    </div>` : ''}

    <section class="card cal">
      <div class="cal-head">
        <button class="icon-btn" data-nav="-1" aria-label="Previous month">${icon('back')}</button>
        <h2>${fmtMonth(view.month)}</h2>
        <button class="icon-btn" data-nav="1" aria-label="Next month">${icon('next')}</button>
      </div>
      <div class="weekdays" aria-hidden="true">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="grid">${cells.join('')}</div>
      ${view.month !== monthStart(today) ? '<button class="link-btn center" data-today>Back to today</button>' : ''}
    </section>

    <section class="card">
      <div class="section-head">
        <h2>${fmtLongDate(view.selected)}</h2>
        <button class="btn btn-small btn-primary" data-add-event>+ Add</button>
      </div>
      ${dayItems.length ? `<ul class="items">${dayItems.map((i) => agendaRow(i, st)).join('')}</ul>`
        : '<p class="muted">Nothing on this day.</p>'}
    </section>`;

  $$('[data-day]', root).forEach((b) => b.addEventListener('click', () => {
    view.selected = b.dataset.day;
    if (b.dataset.day.slice(0, 7) !== view.month.slice(0, 7)) view.month = monthStart(b.dataset.day);
    renderCalendar(container, st);
  }));
  $$('[data-nav]', root).forEach((b) => b.addEventListener('click', () => {
    view.month = addMonths(view.month, Number(b.dataset.nav));
    view.selected = view.month.slice(0, 7) === today.slice(0, 7) ? today : view.month;
    renderCalendar(container, st);
  }));
  $('[data-today]', root)?.addEventListener('click', () => {
    view.month = monthStart(today);
    view.selected = today;
    renderCalendar(container, st);
  });
  $$('[data-cat]', root).forEach((b) => b.addEventListener('click', () => {
    view.catId = b.dataset.cat || null;
    renderCalendar(container, st);
  }));
  $('[data-add-event]', root).addEventListener('click', () => {
    openEventForm({ catId: view.catId, date: view.selected, type: 'task' });
  });
  bindItemActions(root, dayItems);
}
