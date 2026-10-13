// Shared UI building blocks: bottom sheets, toasts, avatars, photo input.
import { icon } from './icons.js';
import { esc } from './utils.js';
import { StorageFullError } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
// Bottom sheet (modal). Returns { el, close }.
// ---------------------------------------------------------------------------

const sheetStack = [];

export function openSheet(html, { onClose, wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet${wide ? ' sheet-wide' : ''}" role="dialog" aria-modal="true">
      ${html}
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  document.getElementById('toast')?.classList.remove('show');
  wrap.classList.add('open');
  const sheet = wrap.firstElementChild;

  const api = {
    el: sheet,
    close() {
      const i = sheetStack.indexOf(api);
      if (i >= 0) sheetStack.splice(i, 1);
      wrap.remove();
      if (!sheetStack.length) document.body.classList.remove('no-scroll');
      onClose?.();
    },
  };
  sheetStack.push(api);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) api.close();
  });
  $$('[data-close]', sheet).forEach((b) => b.addEventListener('click', () => api.close()));
  const first = sheet.querySelector('input:not([type=hidden]):not([type=file]), select, textarea');
  if (first && !first.closest('.chips') && matchMedia('(pointer: fine)').matches) first.focus();
  return api;
}

export function closeAllSheets() {
  [...sheetStack].reverse().forEach((s) => s.close());
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close();
});

export const sheetHeader = (title, sub = '') => `
  <header class="sheet-head">
    <div>
      <h2>${title}</h2>
      ${sub ? `<p class="muted">${sub}</p>` : ''}
    </div>
    <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
  </header>`;

export function confirmSheet(title, message, { okLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet(
      `${sheetHeader(esc(title))}
       <p class="sheet-body">${esc(message)}</p>
       <div class="btn-row">
         <button class="btn btn-ghost" data-close>Cancel</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>
       </div>`,
      { onClose: () => !answered && resolve(false) },
    );
    $('[data-ok]', s.el).addEventListener('click', () => {
      answered = true;
      resolve(true);
      s.close();
    });
  });
}

// Shown instead of a plain "Saved" when a symptom needs a vet.
export function urgentSheet(warning, cat) {
  const vet = cat?.vet || {};
  const call = vet.phone ? `<a class="btn btn-danger btn-block" href="tel:${esc(vet.phone)}">${icon('phone')} Call ${esc(vet.name || vet.clinic || 'vet')}</a>` : '';
  openSheet(`
    <div class="urgent urgent-${warning.level}">
      <div class="urgent-icon">${icon('alert')}</div>
      <h2>${esc(warning.title)}</h2>
      <p>${esc(warning.message)}</p>
      <p class="muted small">The entry has been saved to ${esc(cat?.name || 'your cat')}'s records. This app does not replace professional advice.</p>
      ${call}
      <button class="btn btn-ghost btn-block" data-close>OK, I understand</button>
    </div>`);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer;
export function toast(msg, { action, onAction } = {}) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) $('button', el).onclick = () => {
    el.classList.remove('show');
    onAction?.();
  };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2200);
}

// Run a store mutation and turn storage errors into a friendly message.
export function safely(fn) {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof StorageFullError) {
      toast('Phone storage for this app is full. Remove some photos or export a backup.');
    } else {
      console.error(e);
      toast('Something went wrong saving that.');
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Avatars & chips
// ---------------------------------------------------------------------------

export function avatar(cat, size = 'md') {
  if (!cat) return `<span class="avatar avatar-${size}">?</span>`;
  if (cat.photo) return `<img class="avatar avatar-${size}" src="${cat.photo}" alt="${esc(cat.name)}">`;
  return `<span class="avatar avatar-${size}" style="--avatar:${esc(cat.color || '#f59e0b')}" aria-hidden="true">${esc((cat.name || '?')[0].toUpperCase())}</span>`;
}

export function chips(name, options, selected, { multi = false, cls = '', required = false } = {}) {
  const sel = new Set([].concat(selected ?? []).map(String));
  return `<div class="chips ${cls}" role="${multi ? 'group' : 'radiogroup'}" data-name="${name}" data-multi="${multi}" data-required="${required}">
    ${Object.entries(options).map(([v, label]) => `
      <button type="button" class="chip${sel.has(String(v)) ? ' on' : ''}" data-value="${esc(v)}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${sel.has(String(v))}">${label}</button>`).join('')}
  </div>`;
}

// Wire every .chips group inside root. Single-select chips can be tapped again to clear.
export function bindChips(root, onChange) {
  $$('.chips', root).forEach((group) => {
    if (group.dataset.bound) return;
    group.dataset.bound = '1';
    const multi = group.dataset.multi === 'true';
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (multi) chip.classList.toggle('on');
      else {
        const was = chip.classList.contains('on');
        $$('.chip', group).forEach((c) => c.classList.remove('on'));
        if (!was || group.dataset.required === 'true') chip.classList.add('on');
      }
      $$('.chip', group).forEach((c) => c.setAttribute('aria-checked', c.classList.contains('on')));
      onChange?.(group.dataset.name, chipValue(group));
    });
  });
}

export function chipValue(group) {
  const on = $$('.chip.on', group).map((c) => c.dataset.value);
  return group.dataset.multi === 'true' ? on : on[0] ?? '';
}

export function catPicker(cats, selectedId, name = 'catId') {
  return `<div class="cat-picker chips" role="radiogroup" data-name="${name}" data-multi="false" data-required="true">
    ${cats.map((c) => `
      <button type="button" class="chip cat-chip${c.id === selectedId ? ' on' : ''}" data-value="${c.id}" role="radio" aria-checked="${c.id === selectedId}">
        ${avatar(c, 'sm')}<span>${esc(c.name)}</span>
      </button>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Photos: resize on the phone before saving so storage stays small.
// ---------------------------------------------------------------------------

export function readPhoto(file, max = 720, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function photoField(name, value, label = 'Add photo') {
  return `<div class="photo-field" data-photo="${name}">
      <input type="hidden" name="${name}" value="${esc(value || '')}">
      <label class="photo-drop">
        <input type="file" accept="image/*" hidden>
        <span class="photo-preview">${value ? `<img src="${value}" alt="">` : icon('camera')}</span>
        <span>${value ? 'Change photo' : label}</span>
      </label>
      ${value ? '<button type="button" class="link-btn" data-remove-photo>Remove</button>' : ''}
    </div>`;
}

export function bindPhotoFields(root) {
  $$('.photo-field', root).forEach((f) => {
    const hidden = $('input[type=hidden]', f);
    const preview = $('.photo-preview', f);
    $('input[type=file]', f).addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        hidden.value = await readPhoto(file);
        preview.innerHTML = `<img src="${hidden.value}" alt="">`;
        preview.nextElementSibling.textContent = 'Change photo';
      } catch {
        toast('Could not read that photo');
      }
    });
    $('[data-remove-photo]', f)?.addEventListener('click', (e) => {
      hidden.value = '';
      preview.innerHTML = icon('camera');
      e.target.remove();
    });
  });
}

export const emptyState = (iconName, title, text, action = '') => `
  <div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${title}</h3>
    <p class="muted">${text}</p>
    ${action}
  </div>`;
