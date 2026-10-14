import { EVENT_TYPES, currentWeight, dashboard } from '../model.js';
import { bindItemActions, itemActions, openCatForm } from '../forms.js';
import { loadSampleData } from '../store.js';
import { icon } from '../icons.js';
import { $, avatar, emptyState } from '../ui.js';
import { ageText, esc, fmtLongDate, fmtTime, fmtWeight, relativeDay, todayKey } from '../utils.js';

export function agendaRow(item, st, { showDate = false } = {}) {
  const cat = st.cats.find((c) => c.id === item.catId);
  const type = EVENT_TYPES[item.type] ?? EVENT_TYPES.custom;
  const when = [showDate ? relativeDay(item.date) : '', item.time ? fmtTime(item.time) : ''].filter(Boolean).join(' · ');
  const sub = [when, item.subtitle].filter(Boolean).join(' · ');
  const late = item.status === 'overdue' || item.status === 'due' || item.status === 'missed';
  return `<li class="item item-${type.color}${item.done ? ' is-done' : ''}${late ? ' is-late' : ''}">
    <button class="item-main" data-open-item="${esc(item.id)}">
      <span class="item-icon">${icon(type.icon)}</span>
      <span class="item-text">
        <span class="item-title">${esc(item.title)}${cat ? ` <span class="item-cat">– ${esc(cat.name)}</span>` : ''}</span>
        ${sub ? `<span class="item-sub">${esc(sub)}</span>` : ''}
        ${item.status === 'missed' ? '<span class="item-flag">Missed</span>' : item.status === 'due' ? '<span class="item-flag">Due now</span>' : ''}
      </span>
    </button>
    <div class="item-actions">${itemActions(item)}</div>
  </li>`;
}

export function renderHome(root, st) {
  const today = todayKey();
  const cats = st.cats.filter((c) => !c.archived);

  if (!cats.length) {
    root.innerHTML = `
      <header class="page-head">
        <div><h1>My Cats</h1><p class="muted">${fmtLongDate(today)}</p></div>
        <a class="icon-btn" href="#settings" aria-label="Settings">${icon('settings')}</a>
      </header>
      ${emptyState('paw', 'Welcome', 'Add your cat to start tracking care, medication and health — everything shows up here and in one calendar.',
        `<button class="btn btn-primary btn-block" data-add-cat>+ Add my first cat</button>
         <button class="btn btn-ghost btn-block" data-sample>Try with sample cats</button>`)}`;
    $('[data-add-cat]', root).onclick = () => openCatForm();
    $('[data-sample]', root).onclick = () => loadSampleData();
    return;
  }

  const { todays, overdue, upcoming } = dashboard(st, today);

  root.innerHTML = `
    <header class="page-head">
      <div><h1>My Cats</h1><p class="muted">${fmtLongDate(today)}</p></div>
      <a class="icon-btn" href="#settings" aria-label="Settings">${icon('settings')}</a>
    </header>

    ${overdue.length ? `
      <section class="card card-alert" aria-labelledby="h-overdue">
        <h2 id="h-overdue">Needs attention</h2>
        <ul class="items">${overdue.map((i) => agendaRow(i, st, { showDate: true })).join('')}</ul>
      </section>` : ''}

    <section class="card" id="today" aria-labelledby="h-today">
      <h2 id="h-today">Today</h2>
      ${todays.length ? `<ul class="items">${todays.map((i) => agendaRow(i, st)).join('')}</ul>`
        : '<p class="muted">Nothing scheduled for today.</p>'}
    </section>

    ${upcoming.length ? `
      <section class="card" aria-labelledby="h-up">
        <h2 id="h-up">Coming up</h2>
        <ul class="items">${upcoming.slice(0, 5).map((i) => agendaRow(i, st, { showDate: true })).join('')}</ul>
        ${upcoming.length > 5 ? `<a class="link-btn" href="#calendar">See all ${upcoming.length} in Calendar</a>` : ''}
      </section>` : ''}

    <section aria-labelledby="h-cats">
      <div class="section-head"><h2 id="h-cats">My Cats</h2><a class="link-btn" href="#cats">Manage</a></div>
      <div class="cat-scroller">
        ${cats.map((c) => `
          <a class="cat-card" href="#cat/${c.id}">
            ${avatar(c, 'lg')}
            <span class="cat-name">${esc(c.name)}</span>
            <span class="muted small">${[c.sex === 'male' ? 'Male' : c.sex === 'female' ? 'Female' : '', ageText(c.birthday), fmtWeight(currentWeight(st, c.id), st.settings.units)].filter(Boolean).join(' · ')}</span>
          </a>`).join('')}
        <button class="cat-card cat-card-add" data-add-cat><span class="avatar avatar-lg avatar-add">${icon('plus')}</span><span class="cat-name">Add cat</span></button>
      </div>
    </section>`;

  $('[data-add-cat]', root).onclick = () => openCatForm();
  bindItemActions(root, [...overdue, ...todays, ...upcoming]);
}
