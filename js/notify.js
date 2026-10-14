// Reminders: in-app browser notifications, an email digest, and a calendar
// (.ics) export whose alarms work even when the app is closed.
import { agenda, remindersDue } from './model.js';
import * as store from './store.js';
import { addDays, addMonths, fmtDate, fmtTime, nowTime, todayKey } from './utils.js';

export const notificationsSupported = () => 'Notification' in window;

export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  store.saveSettings({ notifications: result === 'granted' });
  return result;
}

async function show(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#home' } };
  if (reg) reg.showNotification(title, opts);
  else new Notification(title, opts);
}

// Called every minute while the app is open.
export function checkReminders() {
  const st = store.getState();
  if (!st.settings.notifications) return;
  const today = todayKey();
  const now = nowTime();
  const catName = (id) => st.cats.find((c) => c.id === id)?.name ?? '';

  for (const item of agenda(st, today, today, { today, now })) {
    if (item.kind !== 'dose' || !item.ref.reminder || item.done) continue;
    const key = `dose:${item.id}`;
    if (item.time <= now && !st.notified[key]) {
      store.markNotified(key);
      show(`${catName(item.catId)}: ${item.title}`, `${item.subtitle || 'Dose'} due at ${fmtTime(item.time)}`, key);
    }
  }

  if (now < (st.settings.reminderHour || '09:00')) return;
  for (const { item, daysBefore } of remindersDue(st, today)) {
    const key = `ev:${item.id}:${daysBefore}`;
    if (st.notified[key]) continue;
    store.markNotified(key);
    const when = daysBefore === 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days (${fmtDate(item.date)})`;
    show(`${catName(item.catId)}: ${item.title}`, `Due ${when}`, key);
  }
}

// ---------------------------------------------------------------------------
// Email digest — opens the phone's mail app with the next 14 days filled in.
// ---------------------------------------------------------------------------

export function emailDigestUrl(st = store.getState()) {
  const today = todayKey();
  const items = agenda(st, today, addDays(today, 14)).filter((i) => i.kind !== 'dose' && !i.done);
  const meds = st.meds.filter((m) => m.start <= addDays(today, 14) && (!m.end || m.end >= today));
  const cat = (id) => st.cats.find((c) => c.id === id)?.name ?? '';
  const lines = [
    `Cat care for the next 2 weeks (from ${fmtDate(today)})`,
    '',
    ...(items.length ? items.map((i) => `• ${fmtDate(i.date)}${i.time ? ` ${fmtTime(i.time)}` : ''} — ${cat(i.catId)}: ${i.title}`) : ['No scheduled care.']),
  ];
  if (meds.length) {
    lines.push('', 'Medication:');
    meds.forEach((m) => lines.push(`• ${cat(m.catId)}: ${m.name} ${m.dose || ''} at ${m.times.map(fmtTime).join(', ')}${m.end ? ` until ${fmtDate(m.end)}` : ''}`));
  }
  const subject = `Cat care reminders — ${fmtDate(today)}`;
  return `mailto:${encodeURIComponent(st.settings.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

// ---------------------------------------------------------------------------
// iCalendar export
// ---------------------------------------------------------------------------

const RRULE = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  '3months': 'FREQ=MONTHLY;INTERVAL=3',
  '6months': 'FREQ=MONTHLY;INTERVAL=6',
  yearly: 'FREQ=YEARLY',
};

const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const icsDate = (k) => k.replace(/-/g, '');
const icsDateTime = (k, t) => `${icsDate(k)}T${t.replace(':', '')}00`;

// Lines longer than 75 octets must be folded (RFC 5545 §3.1); continuation
// lines start with a space, which counts towards their 75.
const encoder = new TextEncoder();
function fold(line) {
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (bytes + b > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(st = store.getState()) {
  const cat = (id) => st.cats.find((c) => c.id === id)?.name ?? '';
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Coyenick Tracker//Cat Care//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Cat care'];
  const alarm = (days, desc, hasTime) => [
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(desc)}`,
    // All-day events start at midnight, so remind at 9am instead of 00:00.
    `TRIGGER:${days === 0 ? (hasTime ? '-PT30M' : 'PT9H') : `-P${days}D`}`,
    'END:VALARM',
  ];

  for (const ev of st.events) {
    if (!st.cats.some((c) => c.id === ev.catId)) continue;
    const title = `${cat(ev.catId)}: ${ev.title}`;
    out.push('BEGIN:VEVENT', `UID:${ev.id}@coyenick-tracker`, `DTSTAMP:${stamp}`, `SUMMARY:${icsText(title)}`);
    if (ev.time) out.push(`DTSTART:${icsDateTime(ev.date, ev.time)}`, 'DURATION:PT30M');
    else out.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(ev.date, 1))}`);
    if (ev.repeat && RRULE[ev.repeat]) out.push(`RRULE:${RRULE[ev.repeat]}${ev.until ? `;UNTIL=${icsDate(ev.until)}` : ''}`);
    if (ev.notes) out.push(`DESCRIPTION:${icsText(ev.notes)}`);
    for (const days of ev.reminders ?? []) out.push(...alarm(days, title, !!ev.time));
    out.push('END:VEVENT');
  }

  for (const med of st.meds) {
    if (!st.cats.some((c) => c.id === med.catId)) continue;
    if (med.end && med.end < todayKey()) continue;
    for (const time of med.times) {
      const title = `${cat(med.catId)}: ${med.name}${med.dose ? ` (${med.dose})` : ''}`;
      out.push('BEGIN:VEVENT', `UID:${med.id}-${time.replace(':', '')}@coyenick-tracker`, `DTSTAMP:${stamp}`,
        `SUMMARY:${icsText(title)}`, `DTSTART:${icsDateTime(med.start, time)}`, 'DURATION:PT15M',
        `RRULE:FREQ=DAILY${med.end ? `;UNTIL=${icsDate(med.end)}T235959` : `;UNTIL=${icsDate(addMonths(todayKey(), 6))}T235959`}`);
      if (med.reminder !== false) out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT0M', 'END:VALARM');
      out.push('END:VEVENT');
    }
  }
  out.push('END:VCALENDAR');
  return out.map(fold).join('\r\n');
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
