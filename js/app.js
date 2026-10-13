// Router + shell: four tabs (Home, Calendar, Records, Cats) and one + button.
import { openQuickAdd } from './forms.js';
import { checkReminders } from './notify.js';
import { getState, subscribe } from './store.js';
import { $, $$, closeAllSheets } from './ui.js';
import { renderCalendar } from './views/calendar.js';
import { renderCatProfile, renderCats } from './views/cats.js';
import { renderHome } from './views/home.js';
import { renderRecords } from './views/records.js';
import { renderReport } from './views/report.js';
import { renderSettings } from './views/settings.js';

const main = $('#main');

const ROUTES = {
  home: { tab: 'home', render: renderHome },
  calendar: { tab: 'calendar', render: renderCalendar },
  records: { tab: 'records', render: renderRecords },
  cats: { tab: 'cats', render: renderCats },
  cat: { tab: 'cats', render: (el, st, id) => renderCatProfile(el, st, id) },
  report: { tab: 'records', render: (el, st, id, month) => renderReport(el, st, id, month) },
  settings: { tab: 'home', render: renderSettings },
};

function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: ROUTES[name] ? name : 'home', params };
}

let lastRoute = '';

function render() {
  const { route, params } = parseHash();
  const { tab, render: fn } = ROUTES[route];
  const key = `${route}/${params.join('/')}`;
  const scroll = key === lastRoute ? window.scrollY : 0;
  // A fresh element per render: views attach delegated listeners to it.
  const el = document.createElement('div');
  el.className = `view view-${route}`;
  main.replaceChildren(el);
  fn(el, getState(), ...params);
  $$('.tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  document.body.dataset.route = route;
  window.scrollTo(0, scroll);
  lastRoute = key;
}

window.addEventListener('hashchange', () => {
  closeAllSheets();
  render();
});
subscribe(render);

$('#fab').addEventListener('click', () => {
  const { route, params } = parseHash();
  openQuickAdd({ catId: route === 'cat' ? params[0] : undefined });
});

// Refresh "due now" states and fire reminders once a minute, and whenever the
// app comes back to the foreground.
let lastMinute = '';
const busy = () => document.querySelector('.sheet-backdrop') || document.activeElement?.matches('input, select, textarea');

function tick() {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute === lastMinute) return;
  lastMinute = minute;
  checkReminders();
}
setInterval(() => {
  tick();
  if (!busy() && document.visibilityState === 'visible' && new Date().getSeconds() < 30) render();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tick();
    if (!busy()) render();
  }
});

render();
tick();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
