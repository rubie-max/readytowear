import { CATEGORIES, statusById } from '../constants.js';
import { $, $$, esc, icon, openSheet, toast } from '../ui.js';
import { state, itemById, outfitById, saveOutfit, wear, suggestPick } from '../state.js';
import { stageHTML, thumbHTML } from '../mannequin.js';
import { openItemSheet, openItemForm } from './items.js';

const SLOTS = CATEGORIES;

function tryonState() {
  if (!state.ui.tryon) {
    const pick = {};
    SLOTS.forEach(cat => {
      const first = state.items
        .filter(i => i.category === cat.id && i.status === 'clean')
        .sort((a, b) => a.name.localeCompare(b.name))[0];
      pick[cat.id] = cat.required && first ? first.id : null;
    });
    state.ui.tryon = { pick, cleanOnly: true, slot: 'top', outfitId: null };
  }
  return state.ui.tryon;
}

export function startTryOn(outfit = null) {
  const pick = Object.fromEntries(SLOTS.map(c => [c.id, null]));
  outfit?.itemIds.map(itemById).filter(Boolean).forEach(i => { pick[i.category] = i.id; });
  state.ui.tryon = { pick, cleanOnly: !outfit, slot: 'top', outfitId: outfit?.id || null };
}

function options(cat, t) {
  const items = state.items
    .filter(i => i.category === cat.id && (!t.cleanOnly || i.status === 'clean' || i.id === t.pick[cat.id]))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => i.id);
  return cat.required && items.length ? items : [null, ...items];
}

function cycle(catId, dir) {
  const t = tryonState();
  const cat = SLOTS.find(c => c.id === catId);
  const list = options(cat, t);
  const i = list.indexOf(t.pick[catId]);
  t.pick[catId] = list[(i + dir + list.length) % list.length];
  t.slot = catId;
}

const pickedItems = t => SLOTS.map(c => itemById(t.pick[c.id])).filter(Boolean);

export function renderTryOn(root) {
  const t = tryonState();
  if (!state.items.length) {
    root.innerHTML = `<div class="view-pad"><div class="empty-state">
      ${icon('person', 40)}
      <h3>Nothing to try on yet</h3>
      <p>Add some clothes to your wardrobe first, then mix and match them here.</p>
      <button class="btn btn-primary" data-add>${icon('plus', 18)} Add item</button>
    </div></div>`;
    $('[data-add]', root).onclick = () => openItemForm();
    return;
  }

  const items = pickedItems(t);
  const notClean = items.filter(i => i.status !== 'clean');
  const editing = t.outfitId && outfitById(t.outfitId);
  const activeCat = SLOTS.find(c => c.id === t.slot) || SLOTS[0];
  const strip = options(activeCat, t);

  root.innerHTML = `
    <div class="tryon">
      ${editing ? `<div class="editing-bar">Editing <b>${esc(editing.name)}</b><button class="link-btn" data-stop-edit>Done</button></div>` : ''}
      <div class="stage-wrap" data-stage>
        ${stageHTML(items, { size: 'full' })}
        <span class="stage-badge ${notClean.length ? 'wait' : 'ready'}">
          ${items.length ? (notClean.length ? `${notClean.length} not clean` : 'All clean') : 'Pick some clothes'}
        </span>
        <span class="stage-hint">Swipe on the body to swap</span>
      </div>

      <div class="slots">
        ${SLOTS.map(cat => {
          const item = itemById(t.pick[cat.id]);
          const s = item && statusById[item.status];
          return `
            <div class="slot${t.slot === cat.id ? ' active' : ''}">
              <button class="slot-arrow" data-cycle="${cat.id}" data-dir="-1" aria-label="Previous ${esc(cat.single)}">${icon('left')}</button>
              <button class="slot-main" data-slot="${cat.id}">
                <small>${esc(cat.single)}</small>
                <span>${item ? esc(item.name) : '<em>None</em>'}</span>
                ${item && item.status !== 'clean' ? `<i class="dot" style="--c:${s.color}" title="${esc(s.label)}"></i>` : ''}
              </button>
              <button class="slot-arrow" data-cycle="${cat.id}" data-dir="1" aria-label="Next ${esc(cat.single)}">${icon('right')}</button>
            </div>`;
        }).join('')}
      </div>

      <div class="strip" aria-label="${esc(activeCat.label)}">
        ${strip.map(id => {
          const item = itemById(id);
          const selected = t.pick[activeCat.id] === id;
          if (!item) return `<button class="strip-item none${selected ? ' selected' : ''}" data-pick="">None</button>`;
          return `<button class="strip-item${selected ? ' selected' : ''}" data-pick="${id}" title="${esc(item.name)}">
            ${thumbHTML(item)}
            ${item.status !== 'clean' ? `<i class="dot" style="--c:${statusById[item.status].color}"></i>` : ''}
          </button>`;
        }).join('')}
      </div>

      <label class="switch-row compact"><span>Only show clean clothes</span>
        <input type="checkbox" class="switch" data-clean ${t.cleanOnly ? 'checked' : ''}></label>

      <div class="tryon-actions">
        <button class="btn btn-secondary" data-suggest>${icon('shuffle', 18)} Suggest</button>
        <button class="btn btn-secondary" data-save ${items.length ? '' : 'disabled'}>${icon('save', 18)} Save</button>
        <button class="btn btn-primary" data-wear ${items.length ? '' : 'disabled'}>${icon('check', 18)} Wear today</button>
      </div>
    </div>`;

  const rerender = () => renderTryOn(root);

  $$('[data-cycle]', root).forEach(b => {
    b.onclick = () => { cycle(b.dataset.cycle, Number(b.dataset.dir)); rerender(); };
  });
  $$('[data-slot]', root).forEach(b => {
    b.onclick = () => {
      if (t.slot === b.dataset.slot && t.pick[t.slot]) openItemSheet(t.pick[t.slot]);
      else { t.slot = b.dataset.slot; rerender(); }
    };
  });
  $$('[data-pick]', root).forEach(b => {
    b.onclick = () => { t.pick[activeCat.id] = b.dataset.pick || null; rerender(); };
  });
  $('[data-clean]', root).onchange = e => { t.cleanOnly = e.target.checked; rerender(); };
  $('[data-stop-edit]', root)?.addEventListener('click', () => { t.outfitId = null; rerender(); });
  $('[data-suggest]', root).onclick = () => {
    t.pick = suggestPick(SLOTS);
    t.outfitId = null;
    rerender();
  };
  $('[data-save]', root).onclick = () => openSaveSheet(t);
  $('[data-wear]', root).onclick = () => {
    const ids = pickedItems(t).map(i => i.id);
    const outfit = editing && sameItems(editing.itemIds, ids) ? editing : null;
    wear(ids, outfit);
  };

  bindSwipe($('[data-stage]', root), t, rerender);
}

const sameItems = (a, b) => a.length === b.length && a.every(id => b.includes(id));

function bindSwipe(el, t, rerender) {
  let start = null;
  el.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const box = $('.stage', el).getBoundingClientRect();
    const rel = (start.y - box.top) / box.height;
    start = null;
    const slot = rel < 0.47 ? (t.pick.outerwear && t.slot === 'outerwear' ? 'outerwear' : 'top') : rel < 0.83 ? 'bottom' : 'shoes';
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      cycle(slot, dx < 0 ? 1 : -1);
      rerender();
    } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && t.slot !== slot) {
      t.slot = slot;
      rerender();
    }
  });
  el.addEventListener('pointercancel', () => { start = null; });
}

function openSaveSheet(t) {
  const ids = pickedItems(t).map(i => i.id);
  const editing = t.outfitId && outfitById(t.outfitId);
  const sheet = openSheet({
    title: editing ? 'Save outfit' : 'Save as outfit',
    render: () => `
      <form class="form">
        <label class="field"><span>Name</span>
          <input name="name" value="${esc(editing?.name || '')}" placeholder="e.g. Office Monday" autocomplete="off" required></label>
        <div class="sheet-actions">
          ${editing
            ? `<button type="button" class="btn btn-secondary" data-new>Save as new</button>
               <button type="submit" class="btn btn-primary">Update</button>`
            : `<button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
               <button type="submit" class="btn btn-primary">Save outfit</button>`}
        </div>
      </form>`,
    bind: el => {
      const form = $('form', el);
      setTimeout(() => form.name.focus(), 250);
      const save = asNew => {
        const name = form.name.value.trim();
        if (!name) { form.name.focus(); return; }
        const outfit = editing && !asNew
          ? { ...editing, name, itemIds: ids }
          : { id: crypto.randomUUID(), name, itemIds: ids, notes: '', wearCount: 0, lastWorn: null };
        saveOutfit(outfit);
        t.outfitId = outfit.id;
        sheet.close();
        toast(`Saved "${name}"`);
      };
      form.onsubmit = e => { e.preventDefault(); save(false); };
      $('[data-new]', el)?.addEventListener('click', () => save(true));
      $('[data-cancel]', el)?.addEventListener('click', () => sheet.close());
    },
  });
}
