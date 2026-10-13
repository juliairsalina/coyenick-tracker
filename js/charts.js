// Minimal inline-SVG charts. Colours come from CSS tokens so they follow
// light/dark mode.
import { esc, fmtDate, fmtMonth, parseKey } from './utils.js';

const W = 320;
const H = 150;
const PAD = { t: 14, r: 12, b: 26, l: 34 };

function niceRange(min, max) {
  if (min === max) return [min - 1, max + 1];
  const span = max - min;
  return [min - span * 0.15, max + span * 0.15];
}

// points: [{ date: 'YYYY-MM-DD', value: number }]
export function lineChart(points, { unit = '', label = '' } = {}) {
  if (points.length < 2) {
    return `<p class="chart-empty muted">${points.length ? 'Log one more entry to see a trend.' : 'No entries yet.'}</p>`;
  }
  const xs = points.map((p) => parseKey(p.date).getTime());
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = niceRange(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)));
  const sx = (x) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (y) => PAD.t + (1 - (y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map((t) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(t)}" y2="${sy(t)}"/>
      <text class="axis" x="${PAD.l - 6}" y="${sy(t) + 3}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
    <path class="line" d="${path}"/>
    ${points.map((p, i) => `<circle class="dot" cx="${sx(xs[i])}" cy="${sy(p.value)}" r="3.5"><title>${esc(fmtDate(p.date))}: ${p.value}${unit}</title></circle>`).join('')}
    <text class="axis" x="${PAD.l}" y="${H - 6}">${esc(fmtDate(points[0].date, { month: 'short', year: 'numeric' }))}</text>
    <text class="axis" x="${W - PAD.r}" y="${H - 6}" text-anchor="end">${esc(fmtDate(points[points.length - 1].date, { month: 'short', year: 'numeric' }))}</text>
  </svg>`;
}

// series: [{ month: 'YYYY-MM', value: number }]
export function barChart(series, { label = '', unit = '' } = {}) {
  if (!series.some((s) => s.value)) return '<p class="chart-empty muted">Nothing logged in this period.</p>';
  const max = Math.max(...series.map((s) => s.value));
  const bw = (W - PAD.l - PAD.r) / series.length;
  const sy = (v) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(0)}" y2="${sy(0)}"/>
    <text class="axis" x="${PAD.l - 6}" y="${sy(max) + 3}" text-anchor="end">${max}</text>
    ${series.map((s, i) => {
      const x = PAD.l + i * bw + bw * 0.18;
      const h = sy(0) - sy(s.value);
      const name = fmtDate(`${s.month}-01`, { month: 'short' });
      return `<rect class="bar" x="${x}" y="${sy(s.value)}" width="${bw * 0.64}" height="${Math.max(h, s.value ? 2 : 0)}" rx="3"><title>${esc(fmtMonth(s.month))}: ${s.value}${unit}</title></rect>
        ${s.value ? `<text class="bar-val" x="${x + bw * 0.32}" y="${sy(s.value) - 4}" text-anchor="middle">${s.value}</text>` : ''}
        <text class="axis" x="${x + bw * 0.32}" y="${H - 6}" text-anchor="middle">${esc(name)}</text>`;
    }).join('')}
  </svg>`;
}
