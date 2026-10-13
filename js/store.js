// Persistent app state (localStorage). All writes go through `update` so the
// UI re-renders and data is saved in one place.
import { addDays, addMonths, todayKey, uid } from './utils.js';

const KEY = 'coyenick-tracker:v1';

export const emptyState = () => ({
  version: 1,
  cats: [],
  records: [],
  events: [],
  meds: [],
  doses: {},
  notified: {},
  settings: {
    email: '',
    units: 'kg',
    defaultReminders: [7, 1, 0],
    monthlyWeighIn: true,
    notifications: false,
    reminderHour: '09:00',
  },
  ui: { lastCatId: null },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const base = emptyState();
    return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings }, ui: { ...base.ui, ...parsed.ui } };
  } catch {
    return emptyState();
  }
}

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class StorageFullError extends Error {}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    if (e?.name === 'QuotaExceededError' || /quota/i.test(e?.message)) throw new StorageFullError('Storage is full');
    throw e;
  }
}

// `fn` mutates a draft copy. If saving fails the previous state is kept.
export function update(fn, { silent = false } = {}) {
  const prev = state;
  const draft = structuredClone(state);
  fn(draft);
  state = draft;
  try {
    save();
  } catch (e) {
    state = prev;
    throw e;
  }
  if (!silent) listeners.forEach((l) => l(state));
}

export function replaceState(next) {
  const base = emptyState();
  update((s) => {
    Object.keys(s).forEach((k) => delete s[k]);
    Object.assign(s, base, next, { settings: { ...base.settings, ...next.settings }, ui: { ...base.ui, ...next.ui } });
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const stamp = (o) => ({ id: o.id || uid(), createdAt: o.createdAt || new Date().toISOString(), ...o });

export function saveCat(cat) {
  let id = cat.id;
  update((s) => {
    const i = s.cats.findIndex((c) => c.id === cat.id);
    if (i >= 0) s.cats[i] = { ...s.cats[i], ...cat, updatedAt: new Date().toISOString() };
    else {
      const c = stamp({ ...cat, createdAt: todayKey() });
      id = c.id;
      s.cats.push(c);
    }
  });
  return id;
}

export function deleteCat(id) {
  update((s) => {
    s.cats = s.cats.filter((c) => c.id !== id);
    s.records = s.records.filter((r) => r.catId !== id);
    s.events = s.events.filter((e) => e.catId !== id);
    const medIds = new Set(s.meds.filter((m) => m.catId === id).map((m) => m.id));
    s.meds = s.meds.filter((m) => m.catId !== id);
    for (const k of Object.keys(s.doses)) if (medIds.has(k.split('|')[0])) delete s.doses[k];
  });
}

export function saveRecord(rec) {
  update((s) => {
    const i = s.records.findIndex((r) => r.id === rec.id);
    if (i >= 0) s.records[i] = { ...s.records[i], ...rec, updatedAt: new Date().toISOString() };
    else s.records.push(stamp(rec));
    s.ui.lastCatId = rec.catId;
  });
}

export function deleteRecord(id) {
  update((s) => {
    s.records = s.records.filter((r) => r.id !== id);
  });
}

export function saveEvent(ev) {
  update((s) => {
    const i = s.events.findIndex((e) => e.id === ev.id);
    if (i >= 0) s.events[i] = { ...s.events[i], ...ev };
    else s.events.push(stamp({ done: {}, ...ev }));
    s.ui.lastCatId = ev.catId;
  });
}

export function deleteEvent(id) {
  update((s) => {
    s.events = s.events.filter((e) => e.id !== id);
  });
}

export function completeEvent(id, date, { givenDate, notes } = {}) {
  update((s) => {
    const ev = s.events.find((e) => e.id === id);
    if (!ev) return;
    ev.done = ev.done || {};
    ev.done[date] = { at: new Date().toISOString(), givenDate: givenDate || todayKey(), notes: notes || '' };
  });
}

export function uncompleteEvent(id, date) {
  update((s) => {
    const ev = s.events.find((e) => e.id === id);
    if (ev?.done) delete ev.done[date];
  });
}

// Move a single occurrence: the old date is marked as "moved" and a one-off
// copy is created on the new date. For one-off events we just change the date.
export function rescheduleEvent(id, fromDate, toDate) {
  update((s) => {
    const ev = s.events.find((e) => e.id === id);
    if (!ev) return;
    if (!ev.repeat || ev.repeat === 'none') {
      ev.date = toDate;
      return;
    }
    ev.done = ev.done || {};
    ev.done[fromDate] = { at: new Date().toISOString(), movedTo: toDate };
    const { id: _id, done: _done, repeat: _r, until: _u, createdAt: _c, ...rest } = ev;
    s.events.push(stamp({ ...rest, date: toDate, repeat: 'none', done: {} }));
  });
}

export function saveMed(med) {
  update((s) => {
    const i = s.meds.findIndex((m) => m.id === med.id);
    if (i >= 0) s.meds[i] = { ...s.meds[i], ...med };
    else s.meds.push(stamp(med));
    s.ui.lastCatId = med.catId;
  });
}

export function stopMed(id, endDate = todayKey()) {
  update((s) => {
    const m = s.meds.find((x) => x.id === id);
    if (m) m.end = endDate;
  });
}

export function deleteMed(id) {
  update((s) => {
    s.meds = s.meds.filter((m) => m.id !== id);
    for (const k of Object.keys(s.doses)) if (k.startsWith(`${id}|`)) delete s.doses[k];
  });
}

export function logDose(key, status) {
  update((s) => {
    if (status) s.doses[key] = { status, at: new Date().toISOString() };
    else delete s.doses[key];
  });
}

export function saveSettings(patch) {
  update((s) => {
    Object.assign(s.settings, patch);
  });
}

export function markNotified(key) {
  update((s) => {
    s.notified[key] = todayKey();
    const cutoff = addDays(todayKey(), -30);
    for (const [k, v] of Object.entries(s.notified)) if (v < cutoff) delete s.notified[k];
  }, { silent: true });
}

// ---------------------------------------------------------------------------
// Sample data (matches the design mock-up: Milo and Luna)
// ---------------------------------------------------------------------------

export function loadSampleData() {
  const t = todayKey();
  const milo = uid();
  const luna = uid();
  const med = uid();
  const d = (n) => addDays(t, n);
  const m = (n) => addMonths(t, n);
  const s = emptyState();
  s.settings = { ...state.settings };
  s.cats = [
    { id: milo, name: 'Milo', sex: 'male', breed: 'Domestic shorthair (orange)', birthday: m(-26), neutered: true, color: '#f59e0b', allergies: '', conditions: 'Mild asthma', vet: { name: 'Dr. Aisyah', clinic: 'Happy Paws Vet', phone: '' }, createdAt: m(-6) },
    { id: luna, name: 'Luna', sex: 'female', breed: 'White & grey mix', birthday: m(-8), neutered: false, color: '#94a3b8', allergies: 'Chicken', conditions: '', vet: { name: 'Dr. Aisyah', clinic: 'Happy Paws Vet', phone: '' }, createdAt: m(-6) },
  ];
  const weights = [[milo, [4.0, 4.0, 4.1, 4.1, 4.2, 4.2]], [luna, [1.6, 1.9, 2.2, 2.4, 2.6, 2.8]]];
  for (const [catId, ws] of weights) {
    ws.forEach((w, i) => s.records.push(stamp({ catId, category: 'weight', date: addDays(m(i - 5), -3), weight: w })));
  }
  s.records.push(
    stamp({ catId: milo, category: 'asthma', date: d(-40), status: 'mild', episodes: 1, duration: '<30s' }),
    stamp({ catId: milo, category: 'asthma', date: d(-12), status: 'moderate', episodes: 2, duration: '30s-1m' }),
    stamp({ catId: milo, category: 'asthma', date: d(-3), status: 'mild', episodes: 1, duration: '<30s' }),
    stamp({ catId: luna, category: 'stool', date: d(-2), status: 'soft' }),
    stamp({ catId: luna, category: 'food', date: d(-1), status: 'wet', brand: 'Whiskas Kitten', quantity: '1 pouch' }),
    stamp({ catId: milo, category: 'appetite', date: d(-5), status: 'less' }),
    stamp({ catId: milo, category: 'medical', date: d(-30), status: 'visit', title: 'Asthma check-up', clinic: 'Happy Paws Vet', notes: 'Inhaler as needed. Recheck in 1 month.' }),
  );
  s.meds = [{ id: med, catId: milo, name: 'Prednisolone', dose: '½ tablet', times: ['21:00'], start: d(-6), end: d(8), reminder: true, notes: 'Evening dose with food' }];
  s.events = [
    { id: uid(), catId: milo, type: 'vet', title: 'Asthma checkup', date: t, time: '17:30', repeat: 'none', reminders: [7, 1, 0], done: {} },
    { id: uid(), catId: luna, type: 'vaccine', title: 'Kitten booster (F3)', date: d(5), repeat: 'yearly', reminders: [14, 7, 1], done: {} },
    { id: uid(), catId: luna, type: 'flea', title: 'Revolution Plus', date: d(9), repeat: 'monthly', reminders: [1, 0], done: {} },
    { id: uid(), catId: milo, type: 'deworm', title: 'Drontal', date: addMonths(d(12), -3), repeat: '3months', reminders: [7, 1], done: { [addMonths(d(12), -3)]: { at: new Date().toISOString(), givenDate: addMonths(d(12), -3) } } },
    { id: uid(), catId: luna, type: 'task', title: 'Buy more litter', date: d(-1), repeat: 'none', reminders: [0], done: {} },
  ];
  s.ui.lastCatId = milo;
  replaceState(s);
}

