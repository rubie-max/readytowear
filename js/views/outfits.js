import { nextStatus, statusById } from '../constants.js';
import { $, $$, esc, icon, openSheet, confirmSheet, relativeWorn, isoDay, dayLabel, toast } from '../ui.js';
import { state, outfitById, outfitInfo, wear, deleteOutfit, saveOutfit, setPlan, advance } from '../state.js';
import { stageHTML, readyBadge, statusTag, thumbHTML } from '../mannequin.js';
import { startTryOn } from './tryon.js';

export function sortedOutfits() {
  return state.outfits
    .map(o => ({ o, info: outfitInfo(o) }))
    .sort((a, b) => (b.info.ready - a.info.ready) || (a.o.lastWorn || '').localeCompare(b.o.lastWorn || ''));
}

export function renderOutfits(root, go) {
  const ui = state.ui.outfits;
  const all = sortedOutfits();
  const list = ui.readyOnly ? all.filter(x => x.info.ready) : all;

  const toolbar = `
    <div class="toolbar">
      <div class="seg seg-icons">
        <button class="${ui.mode === 'grid' ? 'active' : ''}" data-mode="grid" aria-label="Grid">${icon('grid', 18)}</button>
        <button class="${ui.mode === 'swipe' ? 'active' : ''}" data-mode="swipe" aria-label="Swipe">${icon('cards', 18)}</button>
      </div>
      <button class="chip${ui.readyOnly ? ' active' : ''}" data-ready style="--c:#2f9e6a"><i></i>Ready only</button>
      <button class="btn btn-small btn-primary push" data-new>${icon('plus', 16)} New</button>
    </div>`;

  let body;
  if (!state.outfits.length) {
    body = `<div class="empty-state">
      ${icon('layers', 40)}
      <h3>No outfits yet</h3>
      <p>Mix clothes on the mannequin in Try On, then tap Save.</p>
      <button class="btn btn-primary" data-new>${icon('person', 18)} Go to Try On</button>
    </div>`;
  } else if (!list.length) {
    body = `<p class="empty-line">No outfit is fully clean right now.</p>`;
  } else if (ui.mode === 'grid') {
    body = `<div class="outfit-grid">
      ${list.map(({ o, info }) => `
        <button class="outfit-card" data-open="${o.id}">
          ${stageHTML(info.items, { size: 'mini' })}
          <span class="outfit-meta">
            <strong>${esc(o.name)}</strong>
            ${readyBadge(info)}
          </span>
        </button>`).join('')}
    </div>`;
  } else {
    ui.index = Math.min(ui.index, list.length - 1);
    const { o, info } = list[ui.index];
    body = `
      <div class="swipe-card" data-swipe>
        ${stageHTML(info.items, { size: 'medium' })}
        <button class="swipe-nav left" data-step="-1" aria-label="Previous">${icon('left', 22)}</button>
        <button class="swipe-nav right" data-step="1" aria-label="Next">${icon('right', 22)}</button>
      </div>
      <div class="swipe-info">
        <div class="swipe-title">
          <div><h3>${esc(o.name)}</h3><small>${ui.index + 1} of ${list.length} · ${relativeWorn(o.lastWorn)}</small></div>
          ${readyBadge(info)}
        </div>
        ${blockersHTML(info)}
        <div class="row-actions">
          <button class="btn btn-secondary" data-open="${o.id}">Details</button>
          <button class="btn btn-primary" data-wear="${o.id}">${icon('check', 18)} Wear today</button>
        </div>
      </div>`;
  }

  root.innerHTML = `<div class="view-pad">${toolbar}${body}</div>`;

  $$('[data-mode]', root).forEach(b => { b.onclick = () => { ui.mode = b.dataset.mode; renderOutfits(root, go); }; });
  $('[data-ready]', root).onclick = () => { ui.readyOnly = !ui.readyOnly; ui.index = 0; renderOutfits(root, go); };
  $$('[data-new]', root).forEach(b => { b.onclick = () => { startTryOn(); go('tryon'); }; });
  $$('[data-open]', root).forEach(b => { b.onclick = () => openOutfitSheet(b.dataset.open, go); });
  $$('[data-wear]', root).forEach(b => { b.onclick = () => wearOutfit(outfitById(b.dataset.wear)); });
  bindBlockers(root);

  const step = dir => {
    ui.index = (ui.index + dir + list.length) % list.length;
    renderOutfits(root, go);
  };
  $$('[data-step]', root).forEach(b => { b.onclick = () => step(Number(b.dataset.step)); });
  const card = $('[data-swipe]', root);
  if (card) {
    let x0 = null;
    card.addEventListener('pointerdown', e => { x0 = e.clientX; });
    card.addEventListener('pointerup', e => {
      if (x0 !== null && Math.abs(e.clientX - x0) > 40) step(e.clientX < x0 ? 1 : -1);
      x0 = null;
    });
    card.addEventListener('pointercancel', () => { x0 = null; });
  }
}

function blockersHTML(info) {
  if (!info.blockers.length) return '';
  return `<ul class="blockers">
    ${info.blockers.map(i => {
      const next = nextStatus(i);
      return `<li>
        <span class="blocker-name">${esc(i.name)}</span>
        ${statusTag(i)}
        ${next ? `<button class="link-btn" data-advance="${i.id}">${esc(statusById[next].label)} ${icon('arrow', 14)}</button>` : ''}
      </li>`;
    }).join('')}
  </ul>`;
}

function bindBlockers(root) {
  $$('[data-advance]', root).forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      advance([state.items.find(i => i.id === b.dataset.advance)]);
    };
  });
}

export async function wearOutfit(outfit) {
  const info = outfitInfo(outfit);
  if (!info.items.length) return;
  if (!info.ready && !await confirmSheet({
    title: 'Not everything is clean',
    message: `${info.blockers.map(i => `${i.name} (${statusById[i.status].label.toLowerCase()})`).join(', ')}. Wear it anyway?`,
    confirmLabel: 'Wear anyway',
    danger: false,
  })) return;
  wear(outfit.itemIds, outfit);
}

export function openOutfitSheet(id, go) {
  const sheet = openSheet({
    title: 'Outfit',
    live: true,
    render: () => {
      const o = outfitById(id);
      if (!o) {
        setTimeout(() => sheet.close());
        return '';
      }
      const info = outfitInfo(o);
      const planned = state.plans.filter(p => p.outfitId === id && p.day >= isoDay()).sort((a, b) => a.day.localeCompare(b.day));
      return `
        <div class="outfit-detail">
          ${stageHTML(info.items, { size: 'medium' })}
          <div class="outfit-side">
            <div>${readyBadge(info)}</div>
            <p class="detail-note">Worn ${o.wearCount || 0}× · ${relativeWorn(o.lastWorn)}</p>
            ${planned.length ? `<p class="detail-note">Planned: ${planned.map(p => esc(dayLabel(p.day))).join(', ')}</p>` : ''}
            <div class="piece-list">
              ${info.items.map(i => `<div class="piece">${thumbHTML(i, 'thumb thumb-xs')}<span>${esc(i.name)}</span></div>`).join('')}
            </div>
          </div>
        </div>
        ${blockersHTML(info)}
        <div class="detail-actions">
          <button class="btn btn-primary" data-wear>${icon('check', 18)} Wear today</button>
          <button class="btn btn-secondary" data-plan>${icon('calendar', 18)} Plan for a day</button>
        </div>
        <div class="plan-pick" hidden>
          <input type="date" min="${isoDay()}" value="${isoDay()}" data-date>
          <button class="btn btn-small btn-primary" data-plan-save>Plan</button>
        </div>
        <div class="detail-links">
          <button class="link-btn" data-edit>${icon('person', 18)} Edit on mannequin</button>
          <button class="link-btn" data-rename>${icon('edit', 18)} Rename</button>
          <button class="link-btn danger" data-delete>${icon('trash', 18)} Delete</button>
        </div>`;
    },
    bind: (el, self) => {
      const o = outfitById(id);
      if (!o) return;
      self.setTitle(o.name);
      bindBlockers(el);
      $('[data-wear]', el).onclick = () => wearOutfit(o);
      $('[data-plan]', el).onclick = () => { $('.plan-pick', el).hidden = false; };
      $('[data-plan-save]', el).onclick = () => {
        const day = $('[data-date]', el).value;
        if (!day) return;
        setPlan(day, o.id);
        toast(`Planned for ${dayLabel(day).toLowerCase()}`);
      };
      $('[data-edit]', el).onclick = () => { sheet.close(); startTryOn(o); go('tryon'); };
      $('[data-rename]', el).onclick = () => {
        const name = prompt('Outfit name', o.name)?.trim();
        if (name) saveOutfit({ ...o, name });
      };
      $('[data-delete]', el).onclick = async () => {
        if (await confirmSheet({ title: 'Delete outfit?', message: `"${o.name}" will be deleted. Your clothes are kept.` })) {
          sheet.close();
          deleteOutfit(o.id);
        }
      };
    },
  });
}
