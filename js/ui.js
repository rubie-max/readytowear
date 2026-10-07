export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Icons (24px line icons) ---------- */

const ICONS = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  hanger: '<path d="M12 7.5a2.2 2.2 0 1 1 2.2-2.2"/><path d="M12 7.5v1.3l-8.6 6.4A1.6 1.6 0 0 0 4.4 18h15.2a1.6 1.6 0 0 0 1-2.8L12 8.8"/>',
  person: '<circle cx="12" cy="4.5" r="2.3"/><path d="M9 21v-6.5L7 13.6l1.2-5A2 2 0 0 1 10.1 7h3.8a2 2 0 0 1 1.9 1.6l1.2 5-2 .9V21"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4"/><path d="M8 2.5v4"/><path d="M3 10h18"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h2a4 4 0 0 0 3.3-1.7l5.4-7.6A4 4 0 0 1 16 7h6"/><path d="M2 6h2a4 4 0 0 1 3.5 2"/><path d="M22 18h-6a4 4 0 0 1-3.3-1.8l-.4-.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4.5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  move: '<path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>',
  sparkle: '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 2L12 18.5l-1.9-5.6-5.6-2L10.1 9z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  cards: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M2.5 7v10"/><path d="M21.5 7v10"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
};

export function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------- Dates (local calendar days as YYYY-MM-DD) ---------- */

const pad = n => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function dayLabel(day) {
  const today = isoDay();
  if (day === today) return 'Today';
  if (day === isoDay(addDays(new Date(), 1))) return 'Tomorrow';
  if (day === isoDay(addDays(new Date(), -1))) return 'Yesterday';
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function relativeWorn(day) {
  if (!day) return 'Never worn';
  const days = Math.round((parseDay(isoDay()) - parseDay(day)) / 86400000);
  if (days <= 0) return 'Worn today';
  if (days === 1) return 'Worn yesterday';
  if (days < 30) return `Worn ${days} days ago`;
  return `Worn ${parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/* ---------- Toast ---------- */

let toastTimer;
export function toast(message, { error = false } = {}) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), error ? 4500 : 2200);
}

/* ---------- Bottom sheets ---------- */

const liveSheets = new Set();

// `render` returns the body HTML; `bind(el, sheet)` wires events after each render.
// Live sheets re-render whenever app data changes; form sheets should not be live.
export function openSheet({ title = '', render, bind, live = false, wide = false }) {
  const root = document.createElement('div');
  root.className = 'sheet-root';
  root.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet${wide ? ' sheet-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-body"></div>
    </section>`;
  document.body.appendChild(root);
  const body = $('.sheet-body', root);

  const onKey = e => { if (e.key === 'Escape') sheet.close(); };
  const sheet = {
    el: body,
    refresh() {
      body.innerHTML = render();
      bind?.(body, sheet);
    },
    setTitle(text) { $('.sheet-head h2', root).textContent = text; },
    close() {
      liveSheets.delete(sheet);
      document.removeEventListener('keydown', onKey);
      root.classList.remove('open');
      setTimeout(() => root.remove(), 260);
    },
  };

  $('.sheet-backdrop', root).addEventListener('click', () => sheet.close());
  $('[data-close]', root).addEventListener('click', () => sheet.close());
  document.addEventListener('keydown', onKey);
  if (live) liveSheets.add(sheet);
  sheet.refresh();
  void root.offsetHeight;
  root.classList.add('open');
  return sheet;
}

export function refreshLiveSheets() {
  liveSheets.forEach(s => s.refresh());
}

export function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise(resolve => {
    let answered = false;
    const sheet = openSheet({
      title,
      render: () => `
        <p class="sheet-text">${esc(message)}</p>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-no>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>
        </div>`,
      bind: el => {
        $('[data-no]', el).onclick = () => sheet.close();
        $('[data-yes]', el).onclick = () => { answered = true; resolve(true); sheet.close(); };
      },
    });
    const close = sheet.close;
    sheet.close = () => { if (!answered) resolve(false); close(); };
  });
}

/* ---------- Images ---------- */

// Keeps transparency for PNG/WebP (needed for cut-outs on the mannequin), JPEG otherwise.
export function prepareImage(file, maxSize = 1100) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const transparent = /png|webp/.test(file.type);
      const type = transparent ? 'image/png' : 'image/jpeg';
      canvas.toBlob(blob => blob
        ? resolve({ blob, ext: transparent ? 'png' : 'jpg', previewUrl: URL.createObjectURL(blob), aspect: canvas.width / canvas.height })
        : reject(new Error('Could not process that image.')), type, 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}
