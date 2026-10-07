import { CATEGORIES, STATUSES, categoryById, nextStatus, statusById } from '../constants.js';
import { $, $$, esc, icon, relativeWorn } from '../ui.js';
import { state, advance } from '../state.js';
import { thumbHTML, statusTag } from '../mannequin.js';
import { openItemSheet, openItemForm } from './items.js';

function filtered() {
  const { status, category, search } = state.ui.wardrobe;
  const q = search.trim().toLowerCase();
  return state.items
    .filter(i =>
      (!status || i.status === status) &&
      (!category || i.category === category) &&
      (!q || `${i.name} ${i.notes} ${categoryById[i.category]?.single}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listHTML() {
  const ui = state.ui.wardrobe;
  if (!state.items.length) {
    return `<div class="empty-state">
      ${icon('hanger', 40)}
      <h3>Your wardrobe is empty</h3>
      <p>Add your first piece of clothing to get started.</p>
      <button class="btn btn-primary" data-add>${icon('plus', 18)} Add item</button>
    </div>`;
  }
  const list = filtered();
  const movable = list.filter(i => nextStatus(i));
  const bulk = ui.status && movable.length > 1
    ? `<button class="bulk-bar" data-bulk>
        Move all ${movable.length} to <b>${ui.status === 'drying' ? 'next step' : esc(statusById[nextStatus(movable[0])].label)}</b> ${icon('arrow', 18)}
      </button>` : '';
  if (!list.length) return `${bulk}<p class="empty-line">Nothing here.</p>`;
  return `${bulk}<div class="item-grid">
    ${list.map(i => `
      <button class="item-card" data-id="${i.id}">
        ${thumbHTML(i)}
        ${statusTag(i, 'on-photo')}
        <span class="item-meta">
          <strong>${esc(i.name)}</strong>
          <small>${esc(categoryById[i.category]?.single || '')} · ${relativeWorn(i.lastWorn)}</small>
        </span>
      </button>`).join('')}
  </div>`;
}

export function renderWardrobe(root) {
  const ui = state.ui.wardrobe;
  const counts = Object.fromEntries(STATUSES.map(s => [s.id, 0]));
  state.items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });

  root.innerHTML = `
    <div class="view-pad">
      <label class="search">${icon('search', 18)}
        <input type="search" placeholder="Search your wardrobe" value="${esc(ui.search)}" data-search>
      </label>
      <div class="chip-row">
        <button class="chip${!ui.status ? ' active' : ''}" data-status="">All <b>${state.items.length}</b></button>
        ${STATUSES.filter(s => counts[s.id] || ui.status === s.id).map(s => `
          <button class="chip${ui.status === s.id ? ' active' : ''}" data-status="${s.id}" style="--c:${s.color}">
            <i></i>${esc(s.label)} <b>${counts[s.id]}</b>
          </button>`).join('')}
      </div>
      <div class="tabs-row">
        <button class="tab-pill${!ui.category ? ' active' : ''}" data-cat="">All</button>
        ${CATEGORIES.map(c => `<button class="tab-pill${ui.category === c.id ? ' active' : ''}" data-cat="${c.id}">${esc(c.label)}</button>`).join('')}
      </div>
      <div data-list>${listHTML()}</div>
    </div>
    <button class="fab" data-add aria-label="Add item">${icon('plus', 26)}</button>`;

  const bindList = () => {
    $$('[data-id]', root).forEach(b => { b.onclick = () => openItemSheet(b.dataset.id); });
    $('[data-bulk]', root)?.addEventListener('click', () => advance(filtered()));
    $$('[data-list] [data-add]', root).forEach(b => { b.onclick = () => openItemForm(null, { category: ui.category || 'top' }); });
  };

  $('[data-search]', root).oninput = e => {
    ui.search = e.target.value;
    $('[data-list]', root).innerHTML = listHTML();
    bindList();
  };
  $$('[data-status]', root).forEach(b => {
    b.onclick = () => { ui.status = ui.status === b.dataset.status ? '' : b.dataset.status; renderWardrobe(root); };
  });
  $$('[data-cat]', root).forEach(b => {
    b.onclick = () => { ui.category = b.dataset.cat; renderWardrobe(root); };
  });
  $('.fab', root).onclick = () => openItemForm(null, { category: ui.category || 'top' });
  bindList();
}
