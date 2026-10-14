import { EVENT_TYPES, agenda, currentWeight, eventDates, treatmentHistory, weightHistory } from '../model.js';
import { bindItemActions, openCatForm, openEventForm, openMedForm, openQuickAdd, openRecordForm } from '../forms.js';
import { saveCat, stopMed } from '../store.js';
import { $, $$, avatar, confirmSheet, emptyState, openSheet, readPhoto, safely, sheetHeader, toast } from '../ui.js';
import { addDays, ageText, esc, fmtDate, fmtMonth, fmtTime, fmtWeight, monthKey, todayKey } from '../utils.js';
import { icon } from '../icons.js';
import { agendaRow } from './home.js';
import { bindRecordRows, recordRow, trendsHtml } from './records.js';

const sexLabel = (s) => (s === 'male' ? 'Male' : s === 'female' ? 'Female' : '');

export function renderCats(root, st) {
  const cats = st.cats.filter((c) => !c.archived);
  root.innerHTML = `
    <header class="page-head"><h1>Cats</h1></header>
    ${cats.length ? `<ul class="cat-list">
      ${cats.map((c) => `
        <li><a class="cat-row card" href="#cat/${c.id}">
          ${avatar(c, 'lg')}
          <span class="cat-row-text">
            <span class="cat-name">${esc(c.name)}</span>
            <span class="muted">${[sexLabel(c.sex), ageText(c.birthday), fmtWeight(currentWeight(st, c.id), st.settings.units)].filter(Boolean).join(' · ')}</span>
            ${c.conditions ? `<span class="tag">${esc(c.conditions)}</span>` : ''}
          </span>
          <span class="chev">${icon('next')}</span>
        </a></li>`).join('')}
    </ul>` : emptyState('paw', 'No cats yet', 'Add a profile for each of your cats.')}
    <button class="btn btn-primary btn-block" data-add-cat>+ Add a cat</button>`;
  $('[data-add-cat]', root).onclick = () => openCatForm({ onSaved: (id) => { location.hash = `#cat/${id}`; } });
}

function info(label, value) {
  return value ? `<div class="info"><dt>${label}</dt><dd>${value}</dd></div>` : '';
}

export function renderCatProfile(root, st, catId) {
  const cat = st.cats.find((c) => c.id === catId);
  if (!cat) {
    root.innerHTML = emptyState('paw', 'Cat not found', 'It may have been deleted.', '<a class="btn btn-primary" href="#cats">Back to cats</a>');
    return;
  }
  const today = todayKey();
  const units = st.settings.units;
  const weights = weightHistory(st, cat.id);
  const latest = weights[weights.length - 1];
  const upcoming = agenda(st, today, addDays(today, 60), { catId: cat.id })
    .filter((i) => i.kind !== 'dose' && !i.done && (i.kind !== 'weighin' || i.date <= addDays(today, 7))).slice(0, 5);
  const meds = st.meds.filter((m) => m.catId === cat.id);
  const currentMeds = meds.filter((m) => !m.end || m.end >= today);
  const pastMeds = meds.filter((m) => m.end && m.end < today).sort((a, b) => b.end.localeCompare(a.end));
  const treatments = treatmentHistory(st, cat.id);
  const schedules = st.events.filter((e) => e.catId === cat.id && EVENT_TYPES[e.type]?.treatment);
  const recent = st.records.filter((r) => r.catId === cat.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const photos = st.records.filter((r) => r.catId === cat.id && r.photo && r.category === 'weight').sort((a, b) => b.date.localeCompare(a.date));

  root.innerHTML = `
    <header class="page-head">
      <a class="icon-btn" href="#cats" aria-label="Back">${icon('back')}</a>
      <h1 class="sr-only">${esc(cat.name)}</h1>
      <button class="btn btn-small btn-ghost" data-edit>Edit</button>
    </header>

    <section class="profile">
      <label class="avatar-edit" aria-label="${cat.photo ? 'Change' : 'Add'} profile picture">
        ${avatar(cat, 'xl')}
        <span class="avatar-badge">${icon('camera')}</span>
        <input type="file" accept="image/*" hidden data-avatar-file>
      </label>
      ${cat.photo ? '' : '<span class="muted small">Tap to add a profile picture</span>'}
      <h2>${esc(cat.name)}</h2>
      <p class="muted">${[sexLabel(cat.sex), ageText(cat.birthday), cat.breed].filter(Boolean).map(esc).join(' · ')}</p>
      <div class="profile-stats">
        <button class="pstat" data-weigh>
          <span class="pstat-value">${latest ? fmtWeight(latest.weight, units) : '—'}</span>
          <span class="pstat-label">${latest ? `Weight · ${fmtDate(latest.date, { day: 'numeric', month: 'short' })}` : 'Add weight'}</span>
        </button>
        <div class="pstat">
          <span class="pstat-value">${cat.neutered ? 'Yes' : 'No'}</span>
          <span class="pstat-label">${cat.sex === 'female' ? 'Spayed' : 'Neutered'}</span>
        </div>
        <div class="pstat">
          <span class="pstat-value">${currentMeds.length}</span>
          <span class="pstat-label">Current meds</span>
        </div>
      </div>
      <button class="btn btn-primary btn-block" data-quick>+ Add record for ${esc(cat.name)}</button>
    </section>

    ${cat.allergies || cat.conditions ? `
      <section class="card card-warn">
        <dl>
          ${info('Allergies', esc(cat.allergies))}
          ${info('Conditions', esc(cat.conditions))}
        </dl>
      </section>` : ''}

    <section class="card">
      <div class="section-head"><h2>Upcoming care</h2><button class="btn btn-small btn-ghost" data-schedule>+ Schedule</button></div>
      ${upcoming.length ? `<ul class="items">${upcoming.map((i) => agendaRow(i, st, { showDate: true })).join('')}</ul>` : '<p class="muted">Nothing scheduled in the next 2 months.</p>'}
    </section>

    <section class="card">
      <div class="section-head"><h2>Medication</h2><button class="btn btn-small btn-ghost" data-add-med>+ Add</button></div>
      ${currentMeds.length ? `<ul class="items">${currentMeds.map((m) => `
        <li class="item item-med">
          <button class="item-main" data-med="${m.id}">
            <span class="item-icon">${icon('med')}</span>
            <span class="item-text">
              <span class="item-title">${esc(m.name)}${m.dose ? ` <span class="item-cat">· ${esc(m.dose)}</span>` : ''}</span>
              <span class="item-sub">${m.times.map(fmtTime).join(', ')} · ${m.start > today ? `starts ${fmtDate(m.start)}` : m.end ? `until ${fmtDate(m.end)}` : 'ongoing'}</span>
            </span>
          </button>
          <div class="item-actions"><button class="btn btn-small btn-ghost" data-stop-med="${m.id}">Stop</button></div>
        </li>`).join('')}</ul>` : '<p class="muted">No current medication.</p>'}
      ${pastMeds.length ? `<details><summary>Past medication (${pastMeds.length})</summary><ul class="items">${pastMeds.map((m) => `
        <li class="item"><button class="item-main" data-med="${m.id}"><span class="item-icon">${icon('med')}</span><span class="item-text">
          <span class="item-title">${esc(m.name)}${m.dose ? ` · ${esc(m.dose)}` : ''}</span>
          <span class="item-sub">${fmtDate(m.start)} – ${fmtDate(m.end)}</span></span></button></li>`).join('')}</ul></details>` : ''}
    </section>

    <section class="card">
      <h2>Vaccines, flea & deworming</h2>
      ${schedules.length ? `<ul class="schedules">${schedules.map((e) => {
        const next = eventDates(e, addDays(today, -60), addDays(today, 800)).find((d) => !e.done?.[d]);
        return `<li><button class="link-row" data-event="${e.id}"><strong>${esc(e.title)}</strong><span class="muted">${next ? `${next < today ? 'Overdue' : 'Next'}: ${fmtDate(next)}` : 'No upcoming date'}</span></button></li>`;
      }).join('')}</ul>` : ''}
      ${treatments.length ? `<table class="history">
        <thead><tr><th>Given</th><th>Treatment</th></tr></thead>
        <tbody>${treatments.slice(0, 12).map((t) => `<tr><td>${fmtDate(t.given, { day: 'numeric', month: 'short', year: '2-digit' })}</td><td>${esc(t.ev.title)}${t.notes ? `<br><span class="muted small">${esc(t.notes)}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="muted">No treatments recorded yet. Schedule one and tap <em>Done</em> when it is given.</p>'}
      <div class="btn-row wrap">
        <button class="btn btn-small btn-ghost" data-new-event="vaccine">+ Vaccine</button>
        <button class="btn btn-small btn-ghost" data-new-event="flea">+ Flea</button>
        <button class="btn btn-small btn-ghost" data-new-event="deworm">+ Deworm</button>
      </div>
    </section>

    <section class="card">
      <div class="section-head"><h2>Monthly photos</h2>${photos.length > 1 ? '<button class="btn btn-small btn-ghost" data-compare>Compare</button>' : ''}</div>
      ${photos.length ? `<div class="gallery">${photos.map((p) => `
        <figure><img src="${p.photo}" alt="${esc(cat.name)} in ${fmtMonth(p.date)}" loading="lazy"><figcaption>${fmtDate(p.date, { month: 'short', year: 'numeric' })}<br>${fmtWeight(p.weight, units)}</figcaption></figure>`).join('')}</div>`
        : '<p class="muted">Add a photo when you log weight each month to watch them grow.</p>'}
    </section>

    <section class="card">
      <h2>Trends</h2>
      <div class="charts">${trendsHtml(st, cat.id)}</div>
    </section>

    <section class="card">
      <div class="section-head"><h2>Recent records</h2><a class="link-btn" href="#report/${cat.id}/${monthKey(today)}">Report</a></div>
      ${recent.length ? `<ul class="items">${recent.map((r) => recordRow(r, st, { showCat: false })).join('')}</ul>` : '<p class="muted">No records yet.</p>'}
    </section>

    ${cat.vet?.name || cat.vet?.clinic || cat.vet?.phone ? `
      <section class="card">
        <h2>Vet</h2>
        <dl>
          ${info('Vet', esc(cat.vet.name))}
          ${info('Clinic', esc(cat.vet.clinic))}
          ${info('Phone', cat.vet.phone ? `<a href="tel:${esc(cat.vet.phone)}">${esc(cat.vet.phone)}</a>` : '')}
        </dl>
      </section>` : ''}

    <section class="card">
      <dl>
        ${info('Birthday', cat.birthday ? fmtDate(cat.birthday, { day: 'numeric', month: 'long', year: 'numeric' }) : '')}
        ${info('Breed', esc(cat.breed))}
      </dl>
    </section>`;

  $('[data-edit]', root).onclick = () => openCatForm({ cat });
  $('[data-avatar-file]', root).onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const photo = await readPhoto(file, 512, 0.8, true);
      if (safely(() => saveCat({ ...cat, photo }))) toast('Profile picture updated');
    } catch {
      toast('Could not read that photo');
    }
  };
  $('[data-weigh]', root).onclick = () => openRecordForm({ catId: cat.id, category: 'weight' });
  $('[data-quick]', root).onclick = () => openQuickAdd({ catId: cat.id });
  $('[data-schedule]', root).onclick = () => openEventForm({ catId: cat.id, type: 'vet' });
  $('[data-add-med]', root).onclick = () => openMedForm({ catId: cat.id });
  $$('[data-new-event]', root).forEach((b) => { b.onclick = () => openEventForm({ catId: cat.id, type: b.dataset.newEvent }); });
  $$('[data-med]', root).forEach((b) => { b.onclick = () => openMedForm({ med: meds.find((m) => m.id === b.dataset.med) }); });
  $$('[data-event]', root).forEach((b) => { b.onclick = () => openEventForm({ event: schedules.find((e) => e.id === b.dataset.event) }); });
  $$('[data-stop-med]', root).forEach((b) => {
    b.onclick = async () => {
      const m = meds.find((x) => x.id === b.dataset.stopMed);
      if (!(await confirmSheet(`Stop ${m.name}?`, 'It will move to past medication. Its history is kept.', { okLabel: 'Stop', danger: false }))) return;
      if (safely(() => stopMed(m.id, today))) toast(`${m.name} stopped`);
    };
  });
  $('[data-compare]', root)?.addEventListener('click', () => openCompare(cat, photos, units));
  bindItemActions(root, upcoming);
  bindRecordRows(root, st);
}

function openCompare(cat, photos, units) {
  const options = photos.map((p, i) => `<option value="${i}">${fmtDate(p.date, { month: 'long', year: 'numeric' })}</option>`).join('');
  const s = openSheet(`
    ${sheetHeader(`Compare ${esc(cat.name)}`)}
    <div class="compare">
      ${[photos.length - 1, 0].map((sel, side) => `
        <div class="compare-side">
          <select data-side="${side}">${options.replace(`value="${sel}"`, `value="${sel}" selected`)}</select>
          <figure data-fig="${side}"></figure>
        </div>`).join('')}
    </div>
    <p class="center muted" data-diff></p>`, { wide: true });
  const draw = () => {
    const [a, b] = $$('[data-side]', s.el).map((sel) => photos[Number(sel.value)]);
    [a, b].forEach((p, i) => {
      $(`[data-fig="${i}"]`, s.el).innerHTML = `<img src="${p.photo}" alt=""><figcaption>${fmtWeight(p.weight, units)}</figcaption>`;
    });
    const diff = Number(b.weight) - Number(a.weight);
    $('[data-diff]', s.el).textContent = diff ? `${diff > 0 ? '+' : '−'}${fmtWeight(Math.abs(diff), units)} between these photos` : 'Same weight';
  };
  $$('[data-side]', s.el).forEach((sel) => sel.addEventListener('change', draw));
  draw();
}
