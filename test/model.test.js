import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agenda, dashboard, doseKey, eventDates, isAbnormal, monthlySeries, recordSummary, remindersDue,
  treatmentHistory, urgentWarning,
} from '../js/model.js';
import { addMonths, ageText, diffDays } from '../js/utils.js';

const base = (over = {}) => ({
  cats: [{ id: 'milo', name: 'Milo', sex: 'male', createdAt: '2026-01-01' }],
  records: [], events: [], meds: [], doses: {},
  settings: { defaultReminders: [7, 1, 0], monthlyWeighIn: false },
  ...over,
});

test('addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
});

test('ageText', () => {
  assert.equal(ageText('2024-08-14', '2026-10-14'), '2 years 2 mo');
  assert.equal(ageText('2026-02-14', '2026-10-14'), '8 months');
  assert.equal(ageText('2026-09-16', '2026-10-14'), '4 weeks');
  assert.equal(ageText('', '2026-10-14'), '');
});

test('diffDays survives DST changes', () => {
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(diffDays('2026-10-24', '2026-10-26'), 2);
});

test('monthly repeats do not drift after a short month', () => {
  const ev = { date: '2026-01-31', repeat: 'monthly' };
  assert.deepEqual(eventDates(ev, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('eventDates respects range, until and one-off events', () => {
  assert.deepEqual(eventDates({ date: '2026-10-01', repeat: 'none' }, '2026-10-02', '2026-12-01'), []);
  assert.deepEqual(eventDates({ date: '2026-01-10', repeat: '3months' }, '2026-06-01', '2027-01-31'), ['2026-07-10', '2026-10-10', '2027-01-10']);
  assert.deepEqual(eventDates({ date: '2026-10-01', repeat: 'weekly', until: '2026-10-15' }, '2026-10-01', '2026-12-01'), ['2026-10-01', '2026-10-08', '2026-10-15']);
});

test('medication doses expand per day and time with status', () => {
  const st = base({
    meds: [{ id: 'm1', catId: 'milo', name: 'Pred', dose: '1 tab', times: ['08:00', '21:00'], start: '2026-10-13', end: '2026-10-14' }],
  });
  st.doses[doseKey('m1', '2026-10-13', '08:00')] = { status: 'taken' };
  const items = agenda(st, '2026-10-12', '2026-10-16', { today: '2026-10-14', now: '12:00' }).filter((i) => i.kind === 'dose');
  assert.deepEqual(items.map((i) => `${i.date} ${i.time} ${i.status}`), [
    '2026-10-13 08:00 taken',
    '2026-10-13 21:00 missed',
    '2026-10-14 08:00 due',
    '2026-10-14 21:00 pending',
  ]);
});

test('dashboard splits today, overdue and upcoming', () => {
  const st = base({
    events: [
      { id: 'a', catId: 'milo', type: 'vet', title: 'Checkup', date: '2026-10-14', repeat: 'none', done: {} },
      { id: 'b', catId: 'milo', type: 'task', title: 'Litter', date: '2026-10-10', repeat: 'none', done: {} },
      { id: 'c', catId: 'milo', type: 'flea', title: 'Revolution', date: '2026-10-20', repeat: 'monthly', done: {} },
      { id: 'd', catId: 'milo', type: 'task', title: 'Old done', date: '2026-10-11', repeat: 'none', done: { '2026-10-11': { at: 'x' } } },
    ],
  });
  const { todays, overdue, upcoming } = dashboard(st, '2026-10-14', '10:00');
  assert.deepEqual(todays.map((i) => i.title), ['Checkup']);
  assert.deepEqual(overdue.map((i) => i.title), ['Litter']);
  assert.deepEqual(upcoming.map((i) => `${i.title} ${i.date}`), ['Revolution 2026-10-20']);
});

test('events of deleted or archived cats are hidden', () => {
  const st = base({ events: [{ id: 'x', catId: 'ghost', type: 'task', title: 'X', date: '2026-10-14', repeat: 'none' }] });
  assert.equal(agenda(st, '2026-10-01', '2026-10-31').length, 0);
});

test('moved occurrences disappear and are not treatment history', () => {
  const st = base({
    events: [{ id: 'f', catId: 'milo', type: 'flea', title: 'Rev', date: '2026-09-14', repeat: 'monthly', done: {
      '2026-09-14': { givenDate: '2026-09-15' },
      '2026-10-14': { movedTo: '2026-10-16' },
    } }],
  });
  assert.deepEqual(agenda(st, '2026-10-01', '2026-10-31').map((i) => i.date), []);
  assert.deepEqual(treatmentHistory(st, 'milo').map((t) => t.given), ['2026-09-15']);
});

test('monthly weigh-in is done once a weight is logged that month', () => {
  const st = base({ settings: { monthlyWeighIn: true } });
  let [w] = agenda(st, '2026-10-01', '2026-10-31', { today: '2026-10-14' });
  assert.equal(w.kind, 'weighin');
  assert.equal(w.status, 'overdue');
  st.records.push({ id: 'r', catId: 'milo', category: 'weight', date: '2026-10-03', weight: 4.2 });
  [w] = agenda(st, '2026-10-01', '2026-10-31', { today: '2026-10-14' });
  assert.equal(w.done, true);
});

test('reminders fire on the chosen offsets only', () => {
  const st = base({
    events: [
      { id: 'v', catId: 'milo', type: 'vaccine', title: 'F3', date: '2026-10-28', repeat: 'yearly', reminders: [14, 1], done: {} },
      { id: 'w', catId: 'milo', type: 'vet', title: 'Vet', date: '2026-10-21', repeat: 'none', done: {} },
    ],
  });
  assert.deepEqual(remindersDue(st, '2026-10-14').map((r) => `${r.item.title}:${r.daysBefore}`), ['Vet:7', 'F3:14']);
  assert.deepEqual(remindersDue(st, '2026-10-15').map((r) => r.item.title), []);
  assert.deepEqual(remindersDue(st, '2026-10-27').map((r) => `${r.item.title}:${r.daysBefore}`), ['F3:1']);
});

test('urgent warnings for serious symptoms', () => {
  assert.equal(urgentWarning('urination', { status: 'difficulty' }, { sex: 'male' }).level, 'emergency');
  assert.match(urgentWarning('urination', { status: 'none' }, { sex: 'male' }).message, /male cats/);
  assert.equal(urgentWarning('symptoms', { status: ['sneezing', 'breathing'] }).level, 'emergency');
  assert.equal(urgentWarning('asthma', { status: 'severe' }).level, 'emergency');
  assert.equal(urgentWarning('asthma', { status: 'mild', duration: '>5m' }).level, 'emergency');
  assert.equal(urgentWarning('appetite', { status: 'none' }).level, 'vet');
  assert.equal(urgentWarning('stool', { status: 'blood' }).level, 'vet');
  assert.equal(urgentWarning('stool', { status: 'soft' }), null);
  assert.equal(urgentWarning('urination', { status: 'normal' }), null);
});

test('record summaries and abnormal flags', () => {
  assert.equal(recordSummary({ category: 'weight', weight: 4.2 }), '4.2 kg');
  assert.equal(recordSummary({ category: 'weight', weight: 4.2 }, 'lb'), '9.3 lb');
  assert.equal(recordSummary({ category: 'asthma', status: 'mild', episodes: 2, duration: '<30s' }), 'Mild · 2 episodes · Under 30 s');
  assert.equal(recordSummary({ category: 'symptoms', status: ['vomiting', 'itching'] }), 'Vomiting, Itching');
  assert.equal(isAbnormal({ category: 'stool', status: 'normal' }), false);
  assert.equal(isAbnormal({ category: 'stool', status: 'soft' }), true);
});

test('monthlySeries buckets by month', () => {
  const recs = [{ date: '2026-10-02', episodes: 2 }, { date: '2026-10-20', episodes: 1 }, { date: '2026-08-01', episodes: 1 }, { date: '2025-01-01', episodes: 9 }];
  assert.deepEqual(monthlySeries(recs, 3, '2026-10-14', (r) => r.episodes), [
    { month: '2026-08', value: 1 }, { month: '2026-09', value: 0 }, { month: '2026-10', value: 3 },
  ]);
});
