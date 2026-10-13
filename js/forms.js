// Every "add / edit" flow lives here. All of them open as bottom sheets so the
// user never leaves the screen they were on.
import {
  EVENT_TYPES, RECORD_TYPES, REMINDER_OPTIONS, REPEATS, doseKey, lastValue, urgentWarning,
} from './model.js';
import * as store from './store.js';
import {
  $, $$, bindChips, bindPhotoFields, catPicker, chipValue, chips, confirmSheet, openSheet,
  photoField, safely, sheetHeader, toast, urgentSheet,
} from './ui.js';
import { icon as svg } from './icons.js';
import { addDays, esc, fmtDate, fmtTime, fromKg, todayKey, toKg } from './utils.js';

const activeCats = () => store.getState().cats.filter((c) => !c.archived);

function defaultCatId(preferred) {
  const cats = activeCats();
  if (preferred && cats.some((c) => c.id === preferred)) return preferred;
  const last = store.getState().ui.lastCatId;
  if (cats.some((c) => c.id === last)) return last;
  return cats[0]?.id;
}

function needCat() {
  if (activeCats().length) return false;
  toast('Add your first cat to get started');
  openCatForm();
  return true;
}

// Read named inputs + chip groups into a plain object.
function formData(root) {
  const out = {};
  $$('input[name], select[name], textarea[name]', root).forEach((el) => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value.trim();
  });
  $$('.chips[data-name]', root).forEach((g) => {
    out[g.dataset.name] = chipValue(g);
  });
  return out;
}

const field = (label, inner, hint = '') => `
  <label class="field"><span class="field-label">${label}</span>${inner}${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;

const group = (label, inner) => `<div class="field"><span class="field-label">${label}</span>${inner}</div>`;

// ---------------------------------------------------------------------------
// Quick Add
// ---------------------------------------------------------------------------

const QUICK = {
  health: [
    ['stool'], ['eyes'], ['asthma'], ['appetite'], ['urination'], ['symptoms'],
  ],
  care: [
    ['med', 'med', 'Medication'], ['vaccine', 'vaccine', 'Vaccine'], ['flea', 'flea', 'Flea', 'kutu'],
    ['deworm', 'deworm', 'Deworm', 'cacing'], ['vet', 'vet', 'Vet appt.'], ['medical'],
  ],
  daily: [
    ['weight'], ['food'], ['task', 'task', 'To-do'], ['custom', 'custom', 'Event'], ['cat', 'paw', 'New cat'],
  ],
};

export function openQuickAdd({ catId, tab = 'health' } = {}) {
  if (needCat()) return;
  const tile = ([key, icon, label, hint]) => {
    const def = RECORD_TYPES[key];
    return `<button class="tile" data-add="${key}">
      <span class="tile-icon">${svg(icon || def.icon)}</span>
      <span class="tile-label">${label || def.short || def.label}</span>
      ${(hint || def?.hint) ? `<span class="tile-hint">${hint || def.hint}</span>` : ''}
    </button>`;
  };
  const s = openSheet(`
    ${sheetHeader('Quick Add', 'What do you want to record?')}
    <div class="segmented" role="tablist">
      ${['health', 'care', 'daily'].map((t) => `<button role="tab" data-tab="${t}" aria-selected="${t === tab}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>
    ${Object.entries(QUICK).map(([t, items]) => `<div class="tiles" data-panel="${t}" ${t === tab ? '' : 'hidden'}>${items.map(tile).join('')}</div>`).join('')}
  `);
  $$('[data-tab]', s.el).forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]', s.el).forEach((x) => x.setAttribute('aria-selected', x === b));
    $$('[data-panel]', s.el).forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));
  $$('[data-add]', s.el).forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.add;
    s.close();
    if (key === 'med') openMedForm({ catId });
    else if (key === 'cat') openCatForm();
    else if (RECORD_TYPES[key]) openRecordForm({ catId, category: key });
    else openEventForm({ catId, type: key });
  }));
}

// ---------------------------------------------------------------------------
// Health record
// ---------------------------------------------------------------------------

function renderField(f, rec, catId) {
  const st = store.getState();
  const units = st.settings.units;
  let value = rec[f.key];
  if (value == null && f.autofill) value = lastValue(st, catId, rec.category, f.key);
  switch (f.type) {
    case 'chips':
      return group(f.label, chips(f.key, f.options, value, { required: f.required, cls: 'chips-big' }));
    case 'multichips':
      return group(f.label, chips(f.key, f.options, value, { multi: true, cls: 'chips-big' }));
    case 'stepper': {
      const v = value ?? f.default ?? 1;
      return group(f.label, `<div class="stepper" data-stepper>
        <button type="button" class="icon-btn" data-step="-1" aria-label="Fewer">−</button>
        <input type="number" inputmode="numeric" name="${f.key}" value="${v}" min="${f.min ?? 0}">
        <button type="button" class="icon-btn" data-step="1" aria-label="More">+</button>
      </div>`);
    }
    case 'weight': {
      const kg = value ?? lastValue(st, catId, 'weight', 'weight');
      const shown = kg ? fromKg(Number(kg), units).toFixed(1) : '';
      return field(`${f.label} (${units})`, `<input class="input-big" type="number" step="0.1" min="0" inputmode="decimal" name="${f.key}" value="${shown}" placeholder="0.0" required>`,
        kg && !rec.id ? 'Pre-filled with the last weight — just adjust it.' : '');
    }
    case 'photo':
      return group(f.label, photoField(f.key, value, 'Take or choose photo'));
    default:
      return field(f.label, `<input type="text" name="${f.key}" value="${esc(value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">`);
  }
}

export function openRecordForm({ catId, category, record } = {}) {
  if (needCat()) return;
  const rec = record ? { ...record } : { category, date: todayKey() };
  const def = RECORD_TYPES[rec.category];
  let selectedCat = defaultCatId(record?.catId || catId);
  const st = store.getState();
  const hasExtras = rec.notes || (rec.photo && !def.fields.some((f) => f.key === 'photo'));

  const s = openSheet(`
    ${sheetHeader(`${def.label}${def.hint ? ` <span class="muted">(${def.hint})</span>` : ''}`)}
    <form class="form" novalidate>
      ${activeCats().length > 1 || record ? group('Cat', catPicker(activeCats(), selectedCat)) : ''}
      <div data-fields>${def.fields.map((f) => renderField(f, rec, selectedCat)).join('')}</div>
      ${field('Date', `<input type="date" name="date" value="${rec.date}" max="${addDays(todayKey(), 1)}">`)}
      <details ${hasExtras ? 'open' : ''}>
        <summary>Add note${def.fields.some((f) => f.key === 'photo') ? '' : ' or photo'} (optional)</summary>
        ${field('Notes', `<textarea name="notes" rows="2" placeholder="Anything else worth remembering?">${esc(rec.notes || '')}</textarea>`)}
        ${def.fields.some((f) => f.key === 'photo') ? '' : group('Photo', photoField('photo', rec.photo))}
      </details>
      <div class="btn-row sticky-actions">
        ${record ? '<button type="button" class="btn btn-ghost" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-grow" type="submit">Save</button>
      </div>
    </form>`);

  const form = $('form', s.el);
  bindChips(form, (name, value) => {
    if (name === 'catId') selectedCat = value;
  });
  bindPhotoFields(form);
  $$('[data-stepper]', form).forEach((st2) => {
    const input = $('input', st2);
    $$('[data-step]', st2).forEach((b) => b.addEventListener('click', () => {
      input.value = Math.max(Number(input.min || 0), Number(input.value || 0) + Number(b.dataset.step));
    }));
  });

  $('[data-delete]', form)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete this entry?', 'This cannot be undone.'))) return;
    if (safely(() => store.deleteRecord(record.id))) {
      s.close();
      toast('Entry deleted');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = formData(form);
    const missing = def.fields.find((f) => f.required && (!data[f.key] || (Array.isArray(data[f.key]) && !data[f.key].length)));
    if (missing) {
      toast(`Please choose ${missing.label.toLowerCase()}`);
      return;
    }
    const out = { ...rec, ...data, catId: data.catId || selectedCat };
    if (rec.category === 'weight') {
      const v = Number(data.weight);
      if (!(v > 0 && v < 40)) return toast('Please enter a valid weight');
      out.weight = Math.round(toKg(v, st.settings.units) * 100) / 100;
    }
    if (rec.category === 'asthma') out.episodes = Math.max(1, Number(data.episodes) || 1);
    if (!safely(() => store.saveRecord(out))) return;
    s.close();
    const cat = store.getState().cats.find((c) => c.id === out.catId);
    const warning = urgentWarning(out.category, out, cat);
    if (warning) urgentSheet(warning, cat);
    else toast(`${def.label} saved for ${cat?.name ?? 'your cat'}`);
  });
}

// ---------------------------------------------------------------------------
// Calendar event (vaccines, flea, deworming, vet, to-do, custom)
// ---------------------------------------------------------------------------

const EVENT_FORM_TYPES = ['vaccine', 'flea', 'deworm', 'vet', 'task', 'custom'];

const TITLE_HINTS = {
  vaccine: 'e.g. F3 / FVRCP booster, Rabies',
  flea: 'e.g. Revolution, Frontline, Bravecto',
  deworm: 'e.g. Drontal, Milbemax',
  vet: 'e.g. Annual check-up',
  task: 'e.g. Buy litter, clean fountain',
  custom: 'e.g. Grooming, birthday',
};

const DEFAULT_REPEAT = { flea: 'monthly', deworm: '3months', vaccine: 'yearly' };

export function openEventForm({ catId, type = 'task', date, event } = {}) {
  if (needCat()) return;
  const st = store.getState();
  const ev = event ? { ...event } : {
    type, date: date || todayKey(), repeat: DEFAULT_REPEAT[type] || 'none', reminders: [...st.settings.defaultReminders],
  };
  let selectedCat = defaultCatId(event?.catId || catId);
  const typeOptions = Object.fromEntries(EVENT_FORM_TYPES.map((t) => [t, EVENT_TYPES[t].short || EVENT_TYPES[t].label]));

  const s = openSheet(`
    ${sheetHeader(event ? 'Edit event' : 'Schedule')}
    <form class="form" novalidate>
      ${group('Cat', catPicker(activeCats(), selectedCat))}
      ${group('Type', chips('type', typeOptions, ev.type, { required: true }))}
      ${field('Name', `<input type="text" name="title" value="${esc(ev.title || '')}" placeholder="${esc(TITLE_HINTS[ev.type] || '')}" autocomplete="off">`)}
      <div class="row-2">
        ${field('Date', `<input type="date" name="date" value="${ev.date}" required>`)}
        ${field('Time (optional)', `<input type="time" name="time" value="${ev.time || ''}">`)}
      </div>
      ${field('Repeat', `<select name="repeat">${Object.entries(REPEATS).map(([v, l]) => `<option value="${v}" ${v === (ev.repeat || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${group('Remind me', chips('reminders', Object.fromEntries(REMINDER_OPTIONS.map((o) => [o.value, o.label])), ev.reminders ?? [], { multi: true }))}
      ${field('Notes (optional)', `<textarea name="notes" rows="2">${esc(ev.notes || '')}</textarea>`)}
      <div class="btn-row sticky-actions">
        ${event ? '<button type="button" class="btn btn-ghost" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-grow" type="submit">Save</button>
      </div>
    </form>`);

  const form = $('form', s.el);
  const title = $('[name=title]', form);
  const repeat = $('[name=repeat]', form);
  bindChips(form, (name, value) => {
    if (name === 'catId') selectedCat = value;
    if (name === 'type') {
      title.placeholder = TITLE_HINTS[value] || '';
      if (!event) repeat.value = DEFAULT_REPEAT[value] || 'none';
    }
  });

  $('[data-delete]', form)?.addEventListener('click', async () => {
    const msg = event.repeat && event.repeat !== 'none'
      ? 'This removes the whole repeating schedule, including its history.'
      : 'This cannot be undone.';
    if (!(await confirmSheet('Delete this event?', msg))) return;
    if (safely(() => store.deleteEvent(event.id))) {
      s.close();
      toast('Event deleted');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.date) return toast('Please choose a date');
    const out = {
      ...ev,
      catId: d.catId || selectedCat,
      type: d.type || ev.type,
      title: d.title || EVENT_TYPES[d.type || ev.type].label,
      date: d.date,
      time: d.time,
      repeat: d.repeat,
      reminders: d.reminders.map(Number).sort((a, b) => b - a),
      notes: d.notes,
    };
    if (!safely(() => store.saveEvent(out))) return;
    s.close();
    toast(`Added to calendar · ${fmtDate(out.date)}`);
  });
}

// "Mark done" for vaccines / flea / deworming records the date it was actually given.
export function openCompleteSheet(item) {
  const ev = item.ref;
  if (!EVENT_TYPES[ev.type]?.treatment) {
    safely(() => store.completeEvent(ev.id, item.date));
    toast('Marked as done', { action: 'Undo', onAction: () => safely(() => store.uncompleteEvent(ev.id, item.date)) });
    return;
  }
  const today = todayKey();
  const s = openSheet(`
    ${sheetHeader(esc(ev.title), `Scheduled ${fmtDate(item.date)}`)}
    <form class="form">
      ${field('Date given', `<input type="date" name="givenDate" value="${item.date < today ? item.date : today}" max="${today}">`)}
      ${field('Notes (optional)', '<input type="text" name="notes" placeholder="e.g. batch no., given by Dr. Lim">')}
      <p class="muted small">${ev.repeat && ev.repeat !== 'none' ? `The next one is scheduled automatically (${REPEATS[ev.repeat].toLowerCase()}).` : ''}</p>
      <button class="btn btn-primary btn-block" type="submit">Mark as given</button>
    </form>`);
  $('form', s.el).addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (safely(() => store.completeEvent(ev.id, item.date, d))) {
      s.close();
      toast('Saved to history');
    }
  });
}

export function openRescheduleSheet(item) {
  const s = openSheet(`
    ${sheetHeader('Reschedule', esc(item.title))}
    <form class="form">
      <div class="quick-dates">
        ${[[1, 'Tomorrow'], [3, 'In 3 days'], [7, 'Next week']].map(([n, l]) => `<button type="button" class="chip" data-days="${n}">${l}</button>`).join('')}
      </div>
      ${field('Or pick a date', `<input type="date" name="date" value="${addDays(todayKey(), 1)}">`)}
      <button class="btn btn-primary btn-block" type="submit">Move</button>
    </form>`);
  const form = $('form', s.el);
  const move = (to) => {
    if (safely(() => store.rescheduleEvent(item.ref.id, item.date, to))) {
      s.close();
      toast(`Moved to ${fmtDate(to)}`);
    }
  };
  $$('[data-days]', form).forEach((b) => b.addEventListener('click', () => move(addDays(todayKey(), Number(b.dataset.days)))));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const to = $('[name=date]', form).value;
    if (to) move(to);
  });
}

// Actions for an agenda item: used by Home and Calendar.
export function itemActions(item) {
  if (item.kind === 'dose') {
    const key = doseKey(item.ref.id, item.date, item.time);
    if (item.status === 'taken' || item.status === 'skipped') {
      return `<button class="pill pill-${item.status}" data-dose-undo="${esc(key)}">${item.status === 'taken' ? 'Taken' : 'Skipped'}</button>`;
    }
    return `<div class="action-pair">
      <button class="btn btn-small btn-ghost" data-dose="${esc(key)}" data-status="skipped">Skip</button>
      <button class="btn btn-small btn-primary" data-dose="${esc(key)}" data-status="taken">Taken</button>
    </div>`;
  }
  if (item.kind === 'weighin') {
    return item.done
      ? '<span class="pill pill-taken">Done</span>'
      : `<button class="btn btn-small btn-primary" data-weigh="${item.catId}">Log</button>`;
  }
  if (item.done) return `<button class="pill pill-taken" data-undo="${esc(item.id)}">Done</button>`;
  return `<div class="action-pair">
    <button class="btn btn-small btn-ghost" data-move="${esc(item.id)}" aria-label="Reschedule">Later</button>
    <button class="btn btn-small btn-primary" data-done="${esc(item.id)}">Done</button>
  </div>`;
}

export function bindItemActions(root, items) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-open-item]');
    if (!t) return;
    if (t.dataset.dose) {
      const status = t.dataset.status;
      safely(() => store.logDose(t.dataset.dose, status));
      toast(status === 'taken' ? 'Dose marked as taken' : 'Dose skipped', {
        action: 'Undo', onAction: () => safely(() => store.logDose(t.dataset.dose, null)),
      });
    } else if (t.dataset.doseUndo) {
      safely(() => store.logDose(t.dataset.doseUndo, null));
    } else if (t.dataset.weigh) {
      openRecordForm({ catId: t.dataset.weigh, category: 'weight' });
    } else if (t.dataset.done && byId[t.dataset.done]) {
      openCompleteSheet(byId[t.dataset.done]);
    } else if (t.dataset.undo && byId[t.dataset.undo]) {
      const i = byId[t.dataset.undo];
      safely(() => store.uncompleteEvent(i.ref.id, i.date));
    } else if (t.dataset.move && byId[t.dataset.move]) {
      openRescheduleSheet(byId[t.dataset.move]);
    } else if (t.dataset.openItem && byId[t.dataset.openItem]) {
      const i = byId[t.dataset.openItem];
      if (i.kind === 'event') openEventForm({ event: i.ref });
      else if (i.kind === 'dose') openMedForm({ med: i.ref });
      else if (i.kind === 'weighin') openRecordForm({ catId: i.catId, category: 'weight' });
    }
  });
}

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

const TIME_PRESETS = {
  1: ['08:00'],
  2: ['08:00', '20:00'],
  3: ['08:00', '14:00', '20:00'],
};

export function openMedForm({ catId, med } = {}) {
  if (needCat()) return;
  const m = med ? { ...med } : { start: todayKey(), times: ['08:00'], reminder: true };
  let selectedCat = defaultCatId(med?.catId || catId);
  let times = [...m.times];

  const timesHtml = () => times.map((t, i) => `
    <div class="time-row">
      <input type="time" value="${t}" data-time="${i}" aria-label="Dose time ${i + 1}">
      ${times.length > 1 ? `<button type="button" class="icon-btn" data-remove-time="${i}" aria-label="Remove time">${svg('close')}</button>` : ''}
    </div>`).join('');

  const s = openSheet(`
    ${sheetHeader(med ? 'Edit medication' : 'Add medication')}
    <form class="form" novalidate>
      ${group('Cat', catPicker(activeCats(), selectedCat))}
      ${field('Medication name', `<input type="text" name="name" value="${esc(m.name || '')}" placeholder="e.g. Prednisolone" required autocomplete="off">`)}
      ${field('Dose', `<input type="text" name="dose" value="${esc(m.dose || '')}" placeholder="e.g. 1 tablet, 2 mL">`)}
      ${group('How often?', `${chips('preset', { 1: 'Once a day', 2: 'Twice a day', 3: '3 times a day' }, String(times.length))}
        <div class="times" data-times>${timesHtml()}</div>
        <button type="button" class="link-btn" data-add-time>+ Add another time</button>`)}
      <div class="row-2">
        ${field('Start date', `<input type="date" name="start" value="${m.start}" required>`)}
        ${field('End date', `<input type="date" name="end" value="${m.end || ''}">`, 'Leave empty if ongoing')}
      </div>
      <label class="switch"><input type="checkbox" name="reminder" ${m.reminder !== false ? 'checked' : ''}><span>Remind me at each dose time</span></label>
      ${field('Notes (optional)', `<textarea name="notes" rows="2" placeholder="e.g. give with food">${esc(m.notes || '')}</textarea>`)}
      <div class="btn-row sticky-actions">
        ${med ? '<button type="button" class="btn btn-ghost" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-grow" type="submit">Save</button>
      </div>
    </form>`);

  const form = $('form', s.el);
  const timesEl = $('[data-times]', form);
  const syncTimes = () => {
    times = $$('[data-time]', timesEl).map((i) => i.value).filter(Boolean);
  };
  const redraw = () => { timesEl.innerHTML = timesHtml(); };
  bindChips(form, (name, value) => {
    if (name === 'catId') selectedCat = value;
    if (name === 'preset' && value) {
      times = [...TIME_PRESETS[value]];
      redraw();
    }
  });
  timesEl.addEventListener('change', syncTimes);
  timesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-time]');
    if (!b) return;
    syncTimes();
    times.splice(Number(b.dataset.removeTime), 1);
    redraw();
  });
  $('[data-add-time]', form).addEventListener('click', () => {
    syncTimes();
    times.push('12:00');
    redraw();
  });
  $('[data-delete]', form)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete this medication?', 'Its dose history will be removed too. To keep the history, set an end date instead.'))) return;
    if (safely(() => store.deleteMed(med.id))) {
      s.close();
      toast('Medication deleted');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    syncTimes();
    const d = formData(form);
    if (!d.name) return toast('Please enter the medication name');
    if (!times.length) return toast('Please add at least one time');
    if (d.end && d.end < d.start) return toast('End date is before the start date');
    const out = {
      ...m,
      catId: d.catId || selectedCat,
      name: d.name,
      dose: d.dose,
      times: [...new Set(times)].sort(),
      start: d.start || todayKey(),
      end: d.end || '',
      reminder: d.reminder,
      notes: d.notes,
    };
    if (!safely(() => store.saveMed(out))) return;
    s.close();
    toast(`${out.name} scheduled · ${out.times.map(fmtTime).join(', ')}`);
  });
}

// ---------------------------------------------------------------------------
// Cat profile
// ---------------------------------------------------------------------------

const CAT_COLORS = ['#f59e0b', '#94a3b8', '#1f2937', '#d97706', '#a78bfa', '#f472b6', '#34d399', '#60a5fa'];

export function openCatForm({ cat, onSaved } = {}) {
  const c = cat ? structuredClone(cat) : { sex: '', neutered: false, color: CAT_COLORS[activeCats().length % CAT_COLORS.length], vet: {} };
  const st = store.getState();
  const s = openSheet(`
    ${sheetHeader(cat ? `Edit ${esc(cat.name)}` : 'Add a cat')}
    <form class="form" novalidate>
      ${group('Profile photo', photoField('photo', c.photo))}
      ${field('Name', `<input type="text" name="name" value="${esc(c.name || '')}" required autocomplete="off" placeholder="e.g. Milo">`)}
      <div class="row-2">
        ${field('Birthday', `<input type="date" name="birthday" value="${c.birthday || ''}" max="${todayKey()}">`, 'A guess is fine')}
        ${field('Breed', `<input type="text" name="breed" value="${esc(c.breed || '')}" placeholder="e.g. Domestic shorthair">`)}
      </div>
      ${group('Sex', chips('sex', { male: 'Male', female: 'Female' }, c.sex))}
      <label class="switch"><input type="checkbox" name="neutered" ${c.neutered ? 'checked' : ''}><span>Neutered / spayed</span></label>
      ${cat ? '' : field(`Current weight (${st.settings.units}, optional)`, '<input type="number" name="weight" step="0.1" min="0" inputmode="decimal" placeholder="0.0">')}
      ${field('Allergies', `<input type="text" name="allergies" value="${esc(c.allergies || '')}" placeholder="e.g. chicken, penicillin">`)}
      ${field('Medical conditions', `<input type="text" name="conditions" value="${esc(c.conditions || '')}" placeholder="e.g. asthma">`)}
      <details ${c.vet?.name || c.vet?.clinic ? 'open' : ''}>
        <summary>Vet information</summary>
        ${field('Vet name', `<input type="text" name="vetName" value="${esc(c.vet?.name || '')}">`)}
        ${field('Clinic', `<input type="text" name="vetClinic" value="${esc(c.vet?.clinic || '')}">`)}
        ${field('Phone', `<input type="tel" name="vetPhone" value="${esc(c.vet?.phone || '')}">`)}
      </details>
      ${group('Colour (when there is no photo)', `<div class="swatches">${CAT_COLORS.map((col) => `<button type="button" class="swatch${col === c.color ? ' on' : ''}" data-color="${col}" style="--sw:${col}" aria-label="Colour ${col}"></button>`).join('')}</div>`)}
      <div class="btn-row sticky-actions">
        ${cat ? '<button type="button" class="btn btn-ghost" data-delete>Delete</button>' : ''}
        <button class="btn btn-primary btn-grow" type="submit">Save</button>
      </div>
    </form>`);

  const form = $('form', s.el);
  bindChips(form);
  bindPhotoFields(form);
  let color = c.color;
  $$('[data-color]', form).forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    $$('[data-color]', form).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('[data-delete]', form)?.addEventListener('click', async () => {
    if (!(await confirmSheet(`Delete ${cat.name}?`, 'All records, medications and calendar events for this cat will be permanently removed.'))) return;
    if (safely(() => store.deleteCat(cat.id))) {
      s.close();
      location.hash = '#cats';
      toast(`${cat.name} removed`);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.name) return toast('Please enter a name');
    const out = {
      ...c,
      name: d.name,
      photo: d.photo,
      birthday: d.birthday,
      breed: d.breed,
      sex: d.sex,
      neutered: d.neutered,
      allergies: d.allergies,
      conditions: d.conditions,
      color,
      vet: { name: d.vetName, clinic: d.vetClinic, phone: d.vetPhone },
    };
    let id;
    if (!safely(() => { id = store.saveCat(out); })) return;
    const w = Number(d.weight);
    if (!cat && w > 0) {
      safely(() => store.saveRecord({ catId: id, category: 'weight', date: todayKey(), weight: Math.round(toKg(w, st.settings.units) * 100) / 100 }));
    }
    s.close();
    toast(cat ? 'Profile updated' : `${out.name} added`);
    onSaved?.(id);
  });
}
