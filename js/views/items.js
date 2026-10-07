import { CATEGORIES, FULL_FIT, STATUSES, categoryById, nextStatus, statusById } from '../constants.js';
import { $, $$, esc, icon, openSheet, confirmSheet, prepareImage, relativeWorn, toast } from '../ui.js';
import { state, itemById, newItem, saveItem, setStatus, advance, wear, deleteItem, fitFor } from '../state.js';
import { stageHTML, thumbHTML, layerStyle } from '../mannequin.js';

const sameFit = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w;

/* ---------- Item detail ---------- */

export function openItemSheet(id) {
  const sheet = openSheet({
    title: 'Item',
    live: true,
    render: () => {
      const item = itemById(id);
      if (!item) {
        setTimeout(() => sheet.close());
        return '';
      }
      const next = nextStatus(item);
      const wears = (item.wearsBeforeWash || 1) > 1
        ? `<p class="detail-note">${item.wearsSinceWash || 0} of ${item.wearsBeforeWash} wears before it needs a wash</p>` : '';
      return `
        <div class="detail-hero">${thumbHTML(item, 'thumb thumb-hero')}</div>
        <div class="detail-title">
          <h3>${esc(item.name)}</h3>
          <p>${esc(categoryById[item.category]?.single || '')} · worn ${item.wearCount || 0}× · ${relativeWorn(item.lastWorn)}</p>
          ${item.notes ? `<p class="detail-notes">${esc(item.notes)}</p>` : ''}
        </div>
        <p class="section-label">Status</p>
        <div class="status-grid">
          ${STATUSES.map(s => `
            <button class="status-opt${s.id === item.status ? ' active' : ''}" data-set="${s.id}" style="--c:${s.color}">
              <i></i>${esc(s.label)}
            </button>`).join('')}
        </div>
        ${wears}
        <div class="detail-actions">
          ${next ? `<button class="btn btn-primary" data-next>Move to ${esc(statusById[next].label.toLowerCase())} ${icon('arrow', 18)}</button>` : ''}
          ${item.status === 'clean' ? `<button class="btn btn-secondary" data-wear>${icon('check', 18)} Wore it today</button>` : ''}
        </div>
        <div class="detail-links">
          <button class="link-btn" data-edit>${icon('edit', 18)} Edit</button>
          <button class="link-btn" data-fit>${icon('move', 18)} Fit on mannequin</button>
          <button class="link-btn danger" data-delete>${icon('trash', 18)} Delete</button>
        </div>`;
    },
    bind: (el, self) => {
      const item = itemById(id);
      if (!item) return;
      self.setTitle(item.name);
      $$('[data-set]', el).forEach(b => { b.onclick = () => setStatus(item, b.dataset.set); });
      $('[data-next]', el)?.addEventListener('click', () => advance([item]));
      $('[data-wear]', el)?.addEventListener('click', () => wear([item.id]));
      $('[data-edit]', el).onclick = () => openItemForm(item);
      $('[data-fit]', el).onclick = () => openFitSheet(item);
      $('[data-delete]', el).onclick = async () => {
        if (await confirmSheet({ title: 'Delete item?', message: `"${item.name}" will be removed from your wardrobe and from any outfits.` })) {
          sheet.close();
          deleteItem(item);
        }
      };
    },
  });
}

/* ---------- Add / edit form ---------- */

export function openItemForm(existing = null, defaults = {}) {
  const item = existing ? structuredClone(existing) : newItem(defaults);
  let image = null;
  let fullFit = sameFit(item.fit, FULL_FIT);

  const sheet = openSheet({
    title: existing ? 'Edit item' : 'Add item',
    render: () => {
      const preview = image?.previewUrl || state.urls[item.imagePath] || '';
      return `
        <form class="form" novalidate>
          <div class="photo-pick">
            <label class="photo-box${preview ? ' has-photo' : ''}">
              ${preview ? `<img src="${esc(preview)}" alt="">` : `${icon('image', 28)}<span>Add photo</span>`}
              <input type="file" accept="image/*" hidden data-photo>
            </label>
            <div class="photo-help">
              <p>Cut-out pictures with a transparent background look best on the mannequin.</p>
              <label class="check-row"><input type="checkbox" data-fullfit ${fullFit ? 'checked' : ''}>
                <span>Picture is already sized to the mannequin</span></label>
            </div>
          </div>

          <label class="field"><span>Name</span>
            <input name="name" value="${esc(item.name)}" placeholder="e.g. Navy polo" autocomplete="off" required></label>

          <div class="field"><span>Type</span>
            <div class="seg seg-wrap">
              ${CATEGORIES.map(c => `
                <label class="seg-opt"><input type="radio" name="category" value="${c.id}" ${c.id === item.category ? 'checked' : ''}>
                <span>${esc(c.single)}</span></label>`).join('')}
            </div>
          </div>

          ${existing ? '' : `
          <label class="field"><span>Status right now</span>
            <select name="status">${STATUSES.map(s => `<option value="${s.id}" ${s.id === item.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
          </label>`}

          <div class="field-row">
            <label class="field"><span>Color</span><input type="color" name="color" value="${esc(item.color)}"></label>
            <div class="field"><span>Wears before washing</span>
              <div class="stepper">
                <button type="button" data-step="-1" aria-label="Fewer">−</button>
                <input name="wearsBeforeWash" type="number" min="1" max="30" value="${item.wearsBeforeWash || 1}" inputmode="numeric">
                <button type="button" data-step="1" aria-label="More">+</button>
              </div>
            </div>
          </div>

          <label class="switch-row"><span>Needs ironing after washing</span>
            <input type="checkbox" class="switch" name="needsIroning" ${item.needsIroning ? 'checked' : ''}></label>

          <label class="field"><span>Notes</span>
            <textarea name="notes" rows="2" placeholder="Optional">${esc(item.notes)}</textarea></label>

          <p class="form-error" hidden></p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>`;
    },
    bind: el => {
      const form = $('form', el);
      const readForm = () => {
        item.name = form.name.value;
        item.category = form.category.value;
        item.color = form.color.value;
        item.wearsBeforeWash = Math.max(1, parseInt(form.wearsBeforeWash.value, 10) || 1);
        item.needsIroning = form.needsIroning.checked;
        item.notes = form.notes.value;
        if (form.status) item.status = form.status.value;
        fullFit = $('[data-fullfit]', el).checked;
      };

      $('[data-photo]', el).onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          readForm();
          image = await prepareImage(file);
          sheet.refresh();
        } catch (err) {
          toast(err.message, { error: true });
        }
      };
      $$('[data-step]', el).forEach(b => {
        b.onclick = () => {
          const input = form.wearsBeforeWash;
          input.value = Math.min(30, Math.max(1, (parseInt(input.value, 10) || 1) + Number(b.dataset.step)));
        };
      });
      $('[data-cancel]', el).onclick = () => sheet.close();

      form.onsubmit = async e => {
        e.preventDefault();
        readForm();
        item.name = item.name.trim();
        item.notes = item.notes.trim();
        const error = $('.form-error', el);
        if (!item.name) {
          error.textContent = 'Give it a name.';
          error.hidden = false;
          return;
        }
        if (fullFit) item.fit = { ...FULL_FIT };
        else if (sameFit(item.fit, FULL_FIT) || (existing && existing.category !== item.category)) item.fit = null;

        const submit = $('[type="submit"]', el);
        submit.disabled = true;
        submit.textContent = image ? 'Uploading…' : 'Saving…';
        try {
          await saveItem(item, { image });
          sheet.close();
          toast(existing ? 'Saved' : `Added ${item.name}`);
        } catch (err) {
          error.textContent = `Couldn't save: ${err.message || err}`;
          error.hidden = false;
          submit.disabled = false;
          submit.textContent = 'Save';
        }
      };
    },
  });
}

/* ---------- Fit on mannequin ---------- */

export function openFitSheet(original) {
  const item = structuredClone(original);
  const fit = { ...fitFor(item) };
  const round = n => Math.round(n * 10) / 10;

  const sheet = openSheet({
    title: 'Fit on mannequin',
    render: () => state.urls[item.imagePath] ? `
      <p class="sheet-text">Drag the picture into place, then fine-tune with the sliders.</p>
      <div class="fit-stage">${stageHTML([item], { size: 'medium', active: item.id })}</div>
      <div class="fit-controls">
        <label class="slider"><span>Size</span><input type="range" min="8" max="130" step="0.5" value="${fit.w}" data-k="w"></label>
        <label class="slider"><span>Up / down</span><input type="range" min="-20" max="100" step="0.5" value="${fit.y}" data-k="y"></label>
        <label class="slider"><span>Left / right</span><input type="range" min="0" max="100" step="0.5" value="${fit.x}" data-k="x"></label>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-ghost" data-reset>${icon('undo', 18)} Reset</button>
        <button class="btn btn-primary" data-save>Save fit</button>
      </div>` : `<p class="sheet-text">Add a photo to this item first, then you can place it on the mannequin.</p>`,
    bind: el => {
      const layer = $('.stage-layer', el);
      if (!layer) return;
      const stage = $('.stage', el);
      const apply = () => {
        layer.setAttribute('style', layerStyle(fit, item));
        $$('[data-k]', el).forEach(r => { r.value = fit[r.dataset.k]; });
      };
      $$('[data-k]', el).forEach(r => {
        r.oninput = () => { fit[r.dataset.k] = Number(r.value); apply(); };
      });

      let drag = null;
      stage.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, fx: fit.x, fy: fit.y };
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener('pointermove', e => {
        if (!drag) return;
        const box = stage.getBoundingClientRect();
        fit.x = round(drag.fx + ((e.clientX - drag.x) / box.width) * 100);
        fit.y = round(drag.fy + ((e.clientY - drag.y) / box.height) * 100);
        apply();
      });
      const end = () => { drag = null; };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);

      $('[data-reset]', el).onclick = () => {
        Object.assign(fit, categoryById[item.category].fit);
        apply();
      };
      $('[data-save]', el).onclick = async () => {
        await saveItem({ ...itemById(item.id), fit: { ...fit } });
        sheet.close();
        toast('Fit saved');
      };
    },
  });
}
