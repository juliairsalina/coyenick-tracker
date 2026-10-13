// Printable monthly health report. "Save as PDF" uses the phone's print dialog.
import { RECORD_TYPES, agenda, recordSummary, treatmentHistory, weightHistory } from '../model.js';
import { lineChart } from '../charts.js';
import { icon } from '../icons.js';
import { $, avatar, emptyState } from '../ui.js';
import { addMonths, ageText, esc, fmtDate, fmtMonth, fmtTime, fmtWeight, fromKg, monthEnd, monthKey, todayKey } from '../utils.js';

export function renderReport(root, st, catId, month) {
  const cats = st.cats.filter((c) => !c.archived);
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  if (!cat) {
    root.innerHTML = emptyState('report', 'Nothing to report', 'Add a cat first.');
    return;
  }
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : monthKey(todayKey());
  const from = `${m}-01`;
  const to = monthEnd(from);
  const units = st.settings.units;
  const recs = st.records.filter((r) => r.catId === cat.id && r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const doses = agenda(st, from, to < todayKey() ? to : todayKey(), { catId: cat.id }).filter((i) => i.kind === 'dose');
  const meds = st.meds.filter((x) => x.catId === cat.id && x.start <= to && (!x.end || x.end >= from));
  const events = agenda(st, from, to, { catId: cat.id }).filter((i) => i.kind === 'event');
  const treatments = treatmentHistory(st, cat.id).filter((t) => t.given >= from && t.given <= to);
  const weights = weightHistory(st, cat.id).filter((r) => r.date <= to).slice(-12)
    .map((r) => ({ date: r.date, value: Math.round(fromKg(Number(r.weight), units) * 10) / 10 }));
  const counts = {};
  for (const r of recs) counts[r.category] = (counts[r.category] || 0) + (r.category === 'asthma' ? Number(r.episodes) || 1 : 1);

  root.innerHTML = `
    <header class="page-head no-print">
      <a class="icon-btn" href="#records" aria-label="Back">${icon('back')}</a>
      <h1>Report</h1>
      <button class="btn btn-small btn-primary" data-print>Save PDF</button>
    </header>
    <div class="filters no-print">
      <div class="row-2">
        <select data-cat aria-label="Cat">${cats.map((c) => `<option value="${c.id}" ${c.id === cat.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <div class="month-nav">
          <button class="icon-btn" data-m="-1" aria-label="Previous month">${icon('back')}</button>
          <span>${fmtMonth(m)}</span>
          <button class="icon-btn" data-m="1" aria-label="Next month">${icon('next')}</button>
        </div>
      </div>
    </div>

    <article class="report card">
      <header class="report-head">
        ${avatar(cat, 'lg')}
        <div>
          <h2>${esc(cat.name)} — ${fmtMonth(m)}</h2>
          <p class="muted">${[cat.sex, ageText(cat.birthday, to), cat.breed, cat.neutered ? 'neutered/spayed' : ''].filter(Boolean).map(esc).join(' · ')}</p>
          ${cat.allergies ? `<p><strong>Allergies:</strong> ${esc(cat.allergies)}</p>` : ''}
          ${cat.conditions ? `<p><strong>Conditions:</strong> ${esc(cat.conditions)}</p>` : ''}
        </div>
      </header>

      <h3>Summary</h3>
      ${Object.keys(counts).length ? `<ul class="summary">${Object.entries(counts).map(([k, n]) => `<li>${RECORD_TYPES[k].label}: <strong>${n}</strong>${k === 'asthma' ? ' episodes' : ' entries'}</li>`).join('')}</ul>` : '<p class="muted">No health records this month.</p>'}

      <h3>Weight</h3>
      ${lineChart(weights, { unit: ` ${units}`, label: 'Weight' })}

      <h3>Medication</h3>
      ${meds.length ? `<table class="history"><thead><tr><th>Medication</th><th>Schedule</th><th>Given</th></tr></thead><tbody>
        ${meds.map((x) => {
          const mine = doses.filter((d) => d.ref.id === x.id);
          const taken = mine.filter((d) => d.status === 'taken').length;
          const missed = mine.filter((d) => d.status === 'missed').length;
          const skipped = mine.filter((d) => d.status === 'skipped').length;
          return `<tr><td>${esc(x.name)} ${esc(x.dose || '')}</td><td>${x.times.map(fmtTime).join(', ')}<br><span class="muted small">${fmtDate(x.start)} – ${x.end ? fmtDate(x.end) : 'ongoing'}</span></td>
            <td>${taken}/${mine.length}${missed ? `<br><span class="small danger">${missed} missed</span>` : ''}${skipped ? `<br><span class="small muted">${skipped} skipped</span>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : '<p class="muted">No medication this month.</p>'}

      <h3>Care & appointments</h3>
      ${events.length || treatments.length ? `<ul class="summary">
        ${events.map((e) => `<li>${fmtDate(e.date)} — ${esc(e.title)} ${e.done ? '(done)' : e.status === 'overdue' ? '<span class="danger">(not done)</span>' : ''}</li>`).join('')}
        ${treatments.filter((t) => !events.some((e) => e.ref.id === t.ev.id && e.date === t.scheduled)).map((t) => `<li>${fmtDate(t.given)} — ${esc(t.ev.title)} (given)</li>`).join('')}
      </ul>` : '<p class="muted">Nothing scheduled this month.</p>'}

      <h3>All records</h3>
      ${recs.length ? `<table class="history"><thead><tr><th>Date</th><th>Record</th></tr></thead><tbody>
        ${recs.map((r) => `<tr><td>${fmtDate(r.date, { day: 'numeric', month: 'short' })}</td><td><strong>${RECORD_TYPES[r.category].label}</strong>: ${esc(recordSummary(r, units))}${r.notes ? `<br><span class="muted small">${esc(r.notes)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">No records.</p>'}

      ${cat.vet?.clinic || cat.vet?.name ? `<p class="muted small">Vet: ${esc([cat.vet.name, cat.vet.clinic, cat.vet.phone].filter(Boolean).join(', '))}</p>` : ''}
      <p class="muted small">Generated ${fmtDate(todayKey(), { day: 'numeric', month: 'long', year: 'numeric' })} · Current weight ${fmtWeight(weightHistory(st, cat.id).at(-1)?.weight, units) || '—'}</p>
    </article>`;

  $('[data-print]', root).onclick = () => window.print();
  $('[data-cat]', root).onchange = (e) => { location.hash = `#report/${e.target.value}/${m}`; };
  root.querySelectorAll('[data-m]').forEach((b) => {
    b.onclick = () => { location.hash = `#report/${cat.id}/${monthKey(addMonths(from, Number(b.dataset.m)))}`; };
  });
}
