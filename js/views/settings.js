import { REMINDER_OPTIONS } from '../model.js';
import { buildIcs, download, emailDigestUrl, enableNotifications, notificationsSupported } from '../notify.js';
import * as store from '../store.js';
import { $, bindChips, chips, confirmSheet, safely, toast } from '../ui.js';
import { esc, todayKey } from '../utils.js';

export function renderSettings(root, st) {
  const s = st.settings;
  const perm = notificationsSupported() ? Notification.permission : 'unsupported';
  root.innerHTML = `
    <header class="page-head">
      <a class="icon-btn" href="#home" aria-label="Back">‹</a>
      <h1>Settings</h1>
      <span></span>
    </header>

    <section class="card">
      <h2>Reminders</h2>
      <label class="field"><span class="field-label">Your email</span>
        <input type="email" data-email value="${esc(s.email)}" placeholder="you@example.com" autocomplete="email"></label>
      <button class="btn btn-ghost btn-block" data-digest>✉️ Email me the next 2 weeks</button>
      <p class="field-hint">Opens your mail app with every upcoming vaccine, treatment, appointment and medication filled in.</p>

      <hr>
      ${perm === 'unsupported'
        ? '<p class="muted">This browser does not support notifications. Use the calendar export below instead.</p>'
        : `<label class="switch"><input type="checkbox" data-notify ${s.notifications && perm === 'granted' ? 'checked' : ''}><span>Phone notifications</span></label>
           <p class="field-hint">${perm === 'denied' ? 'Notifications are blocked — allow them in your browser settings.' : 'Shows a notification for each dose and reminder while the app is open or installed.'}</p>`}
      <label class="field"><span class="field-label">Daily reminder time</span><input type="time" data-hour value="${s.reminderHour}"></label>
      <div class="field"><span class="field-label">Default reminders for new events</span>
        ${chips('defaultReminders', Object.fromEntries(REMINDER_OPTIONS.map((o) => [o.value, o.label])), s.defaultReminders, { multi: true })}</div>
      <label class="switch"><input type="checkbox" data-weighin ${s.monthlyWeighIn ? 'checked' : ''}><span>Monthly weight & photo reminder</span></label>

      <hr>
      <button class="btn btn-ghost btn-block" data-ics>📅 Add all reminders to my phone calendar</button>
      <p class="field-hint">Downloads a calendar file. Open it to import into Google Calendar, Apple Calendar or Outlook — they will remind you (and can email you) even when this app is closed.</p>
    </section>

    <section class="card">
      <h2>Units</h2>
      ${chips('units', { kg: 'Kilograms (kg)', lb: 'Pounds (lb)' }, s.units, { required: true })}
    </section>

    <section class="card">
      <h2>Backup & family sharing</h2>
      <p class="muted small">Your data is stored on this phone only. Export a backup regularly, or send it to a family member so they can import it on their phone.</p>
      <div class="btn-row">
        <button class="btn btn-ghost btn-grow" data-export>⬇️ Export backup</button>
        <label class="btn btn-ghost btn-grow">⬆️ Import<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
    </section>

    <section class="card">
      <h2>Data</h2>
      <div class="btn-row wrap">
        <button class="btn btn-ghost" data-sample>Load sample cats</button>
        <button class="btn btn-danger" data-reset>Erase everything</button>
      </div>
    </section>

    <p class="center muted small">Coyenick Tracker · works offline · v1</p>`;

  const save = (patch, msg = 'Saved') => { if (safely(() => store.saveSettings(patch))) toast(msg); };

  $('[data-email]', root).addEventListener('change', (e) => save({ email: e.target.value.trim() }));
  $('[data-digest]', root).addEventListener('click', () => {
    const email = $('[data-email]', root).value.trim();
    if (email !== s.email) store.saveSettings({ email });
    location.href = emailDigestUrl(store.getState());
  });
  $('[data-notify]', root)?.addEventListener('change', async (e) => {
    if (!e.target.checked) return save({ notifications: false }, 'Notifications off');
    const res = await enableNotifications();
    toast(res === 'granted' ? 'Notifications on' : 'Notifications were not allowed');
  });
  $('[data-hour]', root).addEventListener('change', (e) => save({ reminderHour: e.target.value || '09:00' }));
  $('[data-weighin]', root).addEventListener('change', (e) => save({ monthlyWeighIn: e.target.checked }));
  bindChips(root, (name, value) => {
    if (name === 'defaultReminders') save({ defaultReminders: value.map(Number).sort((a, b) => b - a) });
    if (name === 'units') save({ units: value });
  });
  $('[data-ics]', root).addEventListener('click', () => download('cat-care.ics', buildIcs(st), 'text/calendar'));
  $('[data-export]', root).addEventListener('click', () => {
    const { notified, ...data } = store.getState();
    download(`cat-care-backup-${todayKey()}.json`, JSON.stringify(data, null, 1), 'application/json');
  });
  $('[data-import]', root).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.cats) || !Array.isArray(data.records)) throw new Error('Not a backup');
      if (!(await confirmSheet('Replace all data?', `This replaces everything on this phone with the backup (${data.cats.length} cats, ${data.records.length} records).`, { okLabel: 'Replace' }))) return;
      if (safely(() => store.replaceState(data))) toast('Backup restored');
    } catch {
      toast('That file is not a valid backup');
    } finally {
      e.target.value = '';
    }
  });
  $('[data-sample]', root).addEventListener('click', async () => {
    if (st.cats.length && !(await confirmSheet('Load sample data?', 'This replaces your current cats and records with the samples.', { okLabel: 'Replace' }))) return;
    if (safely(() => store.loadSampleData())) {
      toast('Sample cats loaded');
      location.hash = '#home';
    }
  });
  $('[data-reset]', root).addEventListener('click', async () => {
    if (!(await confirmSheet('Erase everything?', 'All cats, records and reminders will be deleted from this phone. Export a backup first if you might need it.', { okLabel: 'Erase' }))) return;
    if (safely(() => store.replaceState(store.emptyState()))) {
      toast('All data erased');
      location.hash = '#home';
    }
  });
}
