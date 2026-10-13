// Small, dependency-free helpers. Dates are handled as local "YYYY-MM-DD" keys
// so a record logged at 11pm never jumps to the next day because of UTC.

export const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = () => dateKey(new Date());

export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

// Adds months, clamping to the last day (31 Jan + 1 month = 28/29 Feb).
export const addMonths = (k, n) => {
  const d = parseKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateKey(d);
};

export const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

export const monthKey = (k) => k.slice(0, 7);

export const monthStart = (k) => `${k.slice(0, 7)}-01`;

export const monthEnd = (k) => {
  const d = parseKey(monthStart(k));
  return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

export function ageText(birthday, ref = todayKey()) {
  if (!birthday) return '';
  const b = parseKey(birthday);
  const r = parseKey(ref);
  let months = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
  if (r.getDate() < b.getDate()) months -= 1;
  if (months < 0) return '';
  if (months < 1) {
    const weeks = Math.floor(diffDays(birthday, ref) / 7);
    return weeks <= 1 ? 'Newborn' : `${weeks} weeks`;
  }
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} year${years === 1 ? '' : 's'}`;
  return years < 3 && rest ? `${y} ${rest} mo` : y;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function fmtDate(k, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!k) return '';
  return parseKey(k).toLocaleDateString('en-GB', opts);
}

export function fmtLongDate(k) {
  return fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtMonth(k) {
  return fmtDate(`${k.slice(0, 7)}-01`, { month: 'long', year: 'numeric' });
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${suffix}`;
}

export function relativeDay(k, today = todayKey()) {
  const n = diffDays(today, k);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return fmtDate(k);
}

const KG_PER_LB = 0.45359237;

export function fmtWeight(kg, units = 'kg') {
  if (kg == null || kg === '' || Number.isNaN(Number(kg))) return '';
  return units === 'lb' ? `${(kg / KG_PER_LB).toFixed(1)} lb` : `${Number(kg).toFixed(1)} kg`;
}

export const toKg = (value, units = 'kg') => (units === 'lb' ? value * KG_PER_LB : value);
export const fromKg = (kg, units = 'kg') => (units === 'lb' ? kg / KG_PER_LB : kg);
