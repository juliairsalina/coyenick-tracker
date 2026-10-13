// Pure domain logic: no DOM, no storage. Everything here is unit tested.
import { addDays, addMonths, diffDays, monthEnd, monthKey, monthStart, nowTime, todayKey } from './utils.js';

// ---------------------------------------------------------------------------
// Calendar event types (scheduled care)
// ---------------------------------------------------------------------------

export const EVENT_TYPES = {
  vaccine: { label: 'Vaccination', icon: 'vaccine', color: 'vaccine', treatment: true },
  flea: { label: 'Flea treatment (kutu)', short: 'Flea', icon: 'flea', color: 'flea', treatment: true },
  deworm: { label: 'Deworming (cacing)', short: 'Deworming', icon: 'deworm', color: 'deworm', treatment: true },
  vet: { label: 'Vet appointment', short: 'Vet', icon: 'vet', color: 'vet' },
  task: { label: 'To-do', icon: 'task', color: 'task' },
  custom: { label: 'Custom event', short: 'Custom', icon: 'custom', color: 'custom' },
  weight: { label: 'Weight & photo', short: 'Weigh-in', icon: 'weight', color: 'weight' },
  med: { label: 'Medication', icon: 'med', color: 'med' },
};

export const REPEATS = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  '3months': 'Every 3 months',
  '6months': 'Every 6 months',
  yearly: 'Every year',
};

export const REMINDER_OPTIONS = [
  { value: 14, label: '2 weeks before' },
  { value: 7, label: '1 week before' },
  { value: 1, label: '1 day before' },
  { value: 0, label: 'On the day' },
];

// Dates on which a (possibly repeating) event occurs within [from, to].
export function eventDates(ev, from, to) {
  const out = [];
  let k = ev.date;
  // Repeats are computed from the original date so month-end clamping
  // (31 Jan -> 28 Feb -> 31 Mar) doesn't drift.
  let i = 0;
  while (k && k <= to && i < 2000) {
    if (ev.until && k > ev.until) break;
    if (k >= from) out.push(k);
    i += 1;
    k = stepFrom(ev.date, ev.repeat, i);
  }
  return out;
}

function stepFrom(start, repeat, i) {
  switch (repeat) {
    case 'daily': return addDays(start, i);
    case 'weekly': return addDays(start, 7 * i);
    case 'monthly': return addMonths(start, i);
    case '3months': return addMonths(start, 3 * i);
    case '6months': return addMonths(start, 6 * i);
    case 'yearly': return addMonths(start, 12 * i);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Medication doses
// ---------------------------------------------------------------------------

export const doseKey = (medId, date, time) => `${medId}|${date}|${time}`;

export function medActiveOn(med, date) {
  return med.start <= date && (!med.end || date <= med.end);
}

export function doseStatus(state, med, date, time, today = todayKey(), now = nowTime()) {
  const logged = state.doses?.[doseKey(med.id, date, time)];
  if (logged) return logged.status; // taken | skipped | missed
  if (date < today) return 'missed';
  if (date === today && time < now) return 'due';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Unified agenda: events + medication doses + monthly weigh-ins
// ---------------------------------------------------------------------------

/**
 * Every care item between `from` and `to` (inclusive), sorted by date then time.
 * Item shape: { id, kind: 'event'|'dose'|'weighin', type, catId, date, time, title,
 *               subtitle, done, status, ref }
 */
export function agenda(state, from, to, { catId = null, today = todayKey(), now = nowTime() } = {}) {
  const items = [];
  const cats = state.cats.filter((c) => !c.archived && (!catId || c.id === catId));
  const catIds = new Set(cats.map((c) => c.id));

  for (const ev of state.events) {
    if (!catIds.has(ev.catId)) continue;
    for (const date of eventDates(ev, from, to)) {
      const completion = ev.done?.[date];
      if (completion?.movedTo) continue;
      items.push({
        id: `e:${ev.id}:${date}`,
        kind: 'event',
        type: ev.type,
        catId: ev.catId,
        date,
        time: ev.time || '',
        title: ev.title || EVENT_TYPES[ev.type]?.label || 'Event',
        subtitle: ev.notes || '',
        done: !!completion,
        status: completion ? 'done' : date < today ? 'overdue' : 'pending',
        ref: ev,
        completion,
      });
    }
  }

  for (const med of state.meds) {
    if (!catIds.has(med.catId)) continue;
    for (let d = from < med.start ? med.start : from; d <= to; d = addDays(d, 1)) {
      if (!medActiveOn(med, d)) break;
      for (const time of med.times) {
        const status = doseStatus(state, med, d, time, today, now);
        items.push({
          id: `d:${med.id}:${d}:${time}`,
          kind: 'dose',
          type: 'med',
          catId: med.catId,
          date: d,
          time,
          title: med.name,
          subtitle: med.dose,
          done: status === 'taken' || status === 'skipped',
          status,
          ref: med,
        });
      }
    }
  }

  if (state.settings?.monthlyWeighIn !== false) {
    // One weigh-in reminder per cat on the 1st of every month; it counts as
    // done as soon as any weight is logged during that month.
    for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) {
      if (m < from) continue;
      for (const cat of cats) {
        if (cat.createdAt && monthKey(cat.createdAt) > monthKey(m)) continue;
        const done = state.records.some(
          (r) => r.catId === cat.id && r.category === 'weight' && monthKey(r.date) === monthKey(m),
        );
        items.push({
          id: `w:${cat.id}:${monthKey(m)}`,
          kind: 'weighin',
          type: 'weight',
          catId: cat.id,
          date: m,
          time: '',
          title: 'Monthly weight & photo',
          subtitle: 'Log weight and take a photo',
          done,
          status: done ? 'done' : m < today ? (monthEnd(m) < today ? 'lapsed' : 'overdue') : 'pending',
          ref: cat,
        });
      }
    }
  }

  return items.sort((a, b) => (a.date === b.date ? (a.time || '99').localeCompare(b.time || '99') : a.date.localeCompare(b.date)));
}

// What the Home screen needs, computed in one place.
export function dashboard(state, today = todayKey(), now = nowTime()) {
  const todays = agenda(state, today, today, { today, now }).filter((i) => i.kind !== 'weighin' || !i.done);
  const overdue = agenda(state, addDays(today, -60), addDays(today, -1), { today, now }).filter(
    (i) => (i.kind === 'event' || i.kind === 'weighin') && i.status === 'overdue',
  );
  const upcoming = agenda(state, addDays(today, 1), addDays(today, 14), { today, now }).filter(
    (i) => i.kind !== 'dose' && !i.done,
  );
  return { todays, overdue, upcoming };
}

// Reminders that should fire on `today` given each event's chosen offsets.
export function remindersDue(state, today = todayKey()) {
  const items = agenda(state, today, addDays(today, 14), { today }).filter((i) => i.kind === 'event' && !i.done);
  const defaults = state.settings?.defaultReminders ?? [7, 1, 0];
  return items
    .map((i) => ({ item: i, daysBefore: diffDays(today, i.date) }))
    .filter(({ item, daysBefore }) => (item.ref.reminders ?? defaults).includes(daysBefore));
}

// ---------------------------------------------------------------------------
// Health records
// ---------------------------------------------------------------------------

export const RECORD_TYPES = {
  weight: {
    label: 'Weight', icon: 'weight', group: 'daily',
    fields: [
      { key: 'weight', type: 'weight', label: 'Weight', required: true },
      { key: 'photo', type: 'photo', label: 'Monthly photo' },
    ],
  },
  stool: {
    label: 'Stool', hint: 'Taik', icon: 'stool', group: 'health',
    fields: [{
      key: 'status', type: 'chips', label: 'How did it look?', required: true,
      options: { normal: 'Normal', soft: 'Soft', diarrhea: 'Diarrhoea', constipation: 'Constipation', blood: 'Blood' },
    }],
  },
  eyes: {
    label: 'Eyes', hint: 'Mata', icon: 'eyes', group: 'health',
    fields: [{
      key: 'status', type: 'chips', label: 'Eyes', required: true,
      options: { normal: 'Normal', discharge: 'Discharge', red: 'Red', swollen: 'Swollen' },
    }],
  },
  asthma: {
    label: 'Asthma', icon: 'asthma', group: 'health',
    fields: [
      { key: 'status', type: 'chips', label: 'Severity', required: true, options: { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' } },
      { key: 'episodes', type: 'stepper', label: 'Episodes today', min: 1, default: 1 },
      { key: 'duration', type: 'chips', label: 'How long?', options: { '<30s': 'Under 30 s', '30s-1m': '30 s – 1 min', '1-5m': '1 – 5 min', '>5m': 'Over 5 min' } },
    ],
  },
  appetite: {
    label: 'Appetite', icon: 'appetite', group: 'health',
    fields: [{
      key: 'status', type: 'chips', label: 'Appetite', required: true,
      options: { normal: 'Normal', less: 'Eating less', more: 'Eating more', none: 'Not eating' },
    }],
  },
  urination: {
    label: 'Urination', icon: 'urination', group: 'health',
    fields: [{
      key: 'status', type: 'chips', label: 'Urination', required: true,
      options: { normal: 'Normal', frequent: 'Frequent', outside: 'Outside litter box', difficulty: 'Difficulty / straining', none: 'Not peeing' },
    }],
  },
  food: {
    label: 'Food', icon: 'food', group: 'daily',
    fields: [
      { key: 'status', type: 'chips', label: 'Type', required: true, options: { wet: 'Wet food', dry: 'Dry food', treats: 'Treats', mixed: 'Mixed' } },
      { key: 'brand', type: 'text', label: 'Brand', autofill: true, placeholder: 'e.g. Royal Canin' },
      { key: 'quantity', type: 'text', label: 'Quantity', autofill: true, placeholder: 'e.g. 1 pouch, 40 g' },
    ],
  },
  symptoms: {
    label: 'Other symptoms', short: 'Symptoms', icon: 'symptoms', group: 'health',
    fields: [{
      key: 'status', type: 'multichips', label: 'What did you notice?', required: true,
      options: {
        vomiting: 'Vomiting', sneezing: 'Sneezing', itching: 'Itching', lethargy: 'Tired / hiding',
        behavior: 'Unusual behaviour', breathing: 'Hard to breathe', seizure: 'Seizure / collapse', other: 'Other',
      },
    }],
  },
  medical: {
    label: 'Vet visit & history', short: 'Medical', icon: 'medical', group: 'care',
    fields: [
      { key: 'status', type: 'chips', label: 'Kind', required: true, options: { visit: 'Vet visit', diagnosis: 'Diagnosis', prescription: 'Prescription', document: 'Document' } },
      { key: 'title', type: 'text', label: 'Title', placeholder: 'e.g. Annual check-up' },
      { key: 'clinic', type: 'text', label: 'Clinic / vet', autofill: true },
      { key: 'photo', type: 'photo', label: 'Photo of document' },
    ],
  },
};

export function recordSummary(r, units = 'kg') {
  const def = RECORD_TYPES[r.category];
  if (!def) return '';
  if (r.category === 'weight') {
    const kg = Number(r.weight);
    return units === 'lb' ? `${(kg / 0.45359237).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
  }
  const statusField = def.fields.find((f) => f.key === 'status');
  const vals = Array.isArray(r.status) ? r.status : [r.status];
  const parts = [vals.filter(Boolean).map((v) => statusField?.options?.[v] ?? v).join(', ')];
  if (r.category === 'asthma') {
    if (r.episodes > 1) parts.push(`${r.episodes} episodes`);
    if (r.duration) parts.push(def.fields[2].options[r.duration]);
  }
  if (r.category === 'food') parts.push(r.brand, r.quantity);
  if (r.category === 'medical') parts.push(r.title, r.clinic);
  return parts.filter(Boolean).join(' · ');
}

export function isAbnormal(r) {
  if (r.category === 'weight' || r.category === 'food' || r.category === 'medical') return false;
  if (r.category === 'asthma' || r.category === 'symptoms') return true;
  return r.status && r.status !== 'normal';
}

/**
 * Some entries should not just be logged — they need a vet now.
 * Returns { level: 'emergency' | 'vet', title, message } or null.
 */
export function urgentWarning(category, rec = {}, cat = null) {
  const s = rec.status;
  const has = (v) => (Array.isArray(s) ? s.includes(v) : s === v);
  if (category === 'urination' && (has('difficulty') || has('none'))) {
    return {
      level: 'emergency',
      title: 'Contact a vet now',
      message: `Straining or not passing urine can mean a urinary blockage, which can become life-threatening within 24–48 hours${cat?.sex === 'male' ? ' — especially in male cats' : ''}. Please call your vet or an emergency clinic right away.`,
    };
  }
  if ((category === 'asthma' && has('severe')) || (category === 'symptoms' && has('breathing'))) {
    return {
      level: 'emergency',
      title: 'Breathing difficulty is an emergency',
      message: 'Open-mouth breathing, blue/grey gums or struggling to breathe needs a vet immediately. Keep your cat calm and go to the nearest vet or emergency clinic.',
    };
  }
  if (category === 'symptoms' && has('seizure')) {
    return {
      level: 'emergency',
      title: 'Contact a vet now',
      message: 'Seizures or collapse need urgent veterinary care. Keep your cat away from stairs and sharp objects and call your vet or an emergency clinic.',
    };
  }
  if (category === 'asthma' && rec.duration === '>5m') {
    return {
      level: 'emergency',
      title: 'Long asthma episode',
      message: 'An asthma attack lasting more than a few minutes needs urgent veterinary care.',
    };
  }
  if (category === 'appetite' && has('none')) {
    return {
      level: 'vet',
      title: 'Not eating — call your vet',
      message: 'A cat that has not eaten for more than 24 hours can develop serious liver problems (hepatic lipidosis). Kittens and sick cats can deteriorate faster. Please contact your vet today.',
    };
  }
  if (category === 'stool' && has('blood')) {
    return {
      level: 'vet',
      title: 'Blood in stool',
      message: 'Please contact your vet today, especially if there is a lot of blood, it keeps happening, or your cat is vomiting or lethargic.',
    };
  }
  if (category === 'eyes' && has('swollen')) {
    return {
      level: 'vet',
      title: 'Swollen eye',
      message: 'A swollen or painful eye, or one your cat keeps closed, should be seen by a vet soon.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Derived per-cat data
// ---------------------------------------------------------------------------

export function weightHistory(state, catId) {
  return state.records
    .filter((r) => r.catId === catId && r.category === 'weight' && r.weight)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function currentWeight(state, catId) {
  const h = weightHistory(state, catId);
  return h.length ? Number(h[h.length - 1].weight) : null;
}

// Completed vaccines / flea / deworming, newest first.
export function treatmentHistory(state, catId) {
  const out = [];
  for (const ev of state.events) {
    if (ev.catId !== catId || !EVENT_TYPES[ev.type]?.treatment) continue;
    for (const [date, c] of Object.entries(ev.done ?? {})) {
      if (c.movedTo) continue;
      out.push({ ev, scheduled: date, given: c.givenDate || date, notes: c.notes || '' });
    }
  }
  return out.sort((a, b) => b.given.localeCompare(a.given));
}

// Count per calendar month for the last `months` months (oldest first).
export function monthlySeries(records, months, today, valueOf = () => 1) {
  const keys = [];
  for (let i = months - 1; i >= 0; i -= 1) keys.push(monthKey(addMonths(monthStart(today), -i)));
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of records) {
    const k = monthKey(r.date);
    if (k in totals) totals[k] += valueOf(r);
  }
  return keys.map((k) => ({ month: k, value: totals[k] }));
}

// Most recent value of a field for a cat + category (auto-fill).
export function lastValue(state, catId, category, key) {
  const recs = state.records
    .filter((r) => r.category === category && r[key] && (!catId || r.catId === catId))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return recs[0]?.[key] ?? '';
}
