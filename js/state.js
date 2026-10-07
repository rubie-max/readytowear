import { categoryById, nextStatus, statusById } from './constants.js';
import { isoDay, toast, refreshLiveSheets } from './ui.js';

export const state = {
  store: null,
  user: null,
  items: [],
  outfits: [],
  plans: [],
  logs: [],
  urls: {},
  view: 'wardrobe',
  ui: {
    wardrobe: { status: '', category: '', search: '' },
    outfits: { mode: 'grid', readyOnly: false, index: 0 },
    planner: { tab: 'upcoming' },
    tryon: null,
  },
};

let renderView = () => {};
export function onChange(fn) { renderView = fn; }
export function changed() {
  renderView();
  refreshLiveSheets();
}

export const itemById = id => state.items.find(i => i.id === id);
export const outfitById = id => state.outfits.find(o => o.id === id);
export const planFor = day => state.plans.find(p => p.day === day);
export const imageUrl = item => (item?.imagePath ? state.urls[item.imagePath] : '');

export function outfitInfo(outfit) {
  const items = outfit.itemIds.map(itemById).filter(Boolean);
  const blockers = items.filter(i => i.status !== 'clean');
  return { items, blockers, ready: items.length > 0 && blockers.length === 0 };
}

async function persist(task) {
  try {
    await task();
  } catch (e) {
    console.error(e);
    toast(`Couldn't save: ${e.message || e}`, { error: true });
  }
}

const upsertLocal = (arr, obj) => {
  const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj;
  else arr.push(obj);
};

/* ---------- Loading ---------- */

export async function loadAll() {
  Object.assign(state, await state.store.loadAll());
  state.urls = {};
  await loadUrls();
}

// Pulls in changes saved from another device. Quietly does nothing when offline.
export async function syncFromRemote() {
  try {
    const fresh = await state.store.refresh();
    if (!fresh) return;
    Object.assign(state, fresh);
    await loadUrls();
    changed();
  } catch (e) {
    console.warn('Sync failed', e);
  }
}

export async function loadUrls() {
  const missing = state.items.map(i => i.imagePath).filter(p => p && !state.urls[p]);
  if (!missing.length) return;
  try {
    Object.assign(state.urls, await state.store.imageUrls([...new Set(missing)]));
  } catch (e) {
    console.error(e);
  }
}

/* ---------- Items ---------- */

export function newItem(fields) {
  return {
    id: crypto.randomUUID(),
    name: '',
    category: 'top',
    color: '#9a958c',
    status: 'clean',
    imagePath: null,
    fit: null,
    needsIroning: false,
    wearsBeforeWash: 1,
    wearsSinceWash: 0,
    wearCount: 0,
    lastWorn: null,
    notes: '',
    ...fields,
  };
}

export const fitFor = item => item.fit || categoryById[item.category]?.fit;

export async function saveItem(item, { image } = {}) {
  if (image) {
    const oldPath = item.imagePath;
    item.imagePath = await state.store.uploadImage(image.blob, image.ext);
    state.urls[item.imagePath] = image.previewUrl;
    if (oldPath) state.store.deleteImage(oldPath).catch(() => {});
  }
  upsertLocal(state.items, item);
  changed();
  await persist(() => state.store.saveItems([item]));
}

export async function saveItems(items) {
  items.forEach(i => upsertLocal(state.items, i));
  changed();
  await persist(() => state.store.saveItems(items));
}

function applyStatus(item, status) {
  if (status === 'washing' || (item.status === 'dirty' && status === 'clean')) item.wearsSinceWash = 0;
  item.status = status;
}

export function setStatus(item, status) {
  applyStatus(item, status);
  return saveItems([item]);
}

export function advance(items) {
  const moved = items.filter(i => nextStatus(i));
  moved.forEach(i => applyStatus(i, nextStatus(i)));
  if (moved.length === 1) toast(`${moved[0].name}: ${statusById[moved[0].status].label}`);
  else if (moved.length) toast(`Moved ${moved.length} items`);
  return saveItems(moved);
}

export async function deleteItem(item) {
  state.items = state.items.filter(i => i.id !== item.id);
  const touched = state.outfits.filter(o => o.itemIds.includes(item.id));
  touched.forEach(o => { o.itemIds = o.itemIds.filter(id => id !== item.id); });
  changed();
  await persist(async () => {
    await state.store.deleteItem(item);
    if (touched.length) await state.store.saveOutfits(touched);
  });
}

/* ---------- Wearing ---------- */

export async function wear(itemIds, outfit = null) {
  const day = isoDay();
  const items = itemIds.map(itemById).filter(Boolean);
  items.forEach(item => {
    item.wearCount = (item.wearCount || 0) + 1;
    item.wearsSinceWash = (item.wearsSinceWash || 0) + 1;
    item.lastWorn = day;
    if (item.wearsSinceWash >= (item.wearsBeforeWash || 1)) item.status = 'dirty';
  });
  if (outfit) {
    outfit.wearCount = (outfit.wearCount || 0) + 1;
    outfit.lastWorn = day;
  }
  const log = { id: crypto.randomUUID(), day, outfitId: outfit?.id || null, outfitName: outfit?.name || null, itemIds: items.map(i => i.id) };
  state.logs.unshift(log);
  changed();
  toast(outfit ? `Wearing "${outfit.name}" today` : 'Marked as worn today');
  await persist(async () => {
    await state.store.saveItems(items);
    if (outfit) await state.store.saveOutfits([outfit]);
    await state.store.addLog(log);
  });
}

export async function deleteLog(id) {
  state.logs = state.logs.filter(l => l.id !== id);
  changed();
  await persist(() => state.store.deleteLog(id));
}

/* ---------- Outfits & plans ---------- */

export async function saveOutfit(outfit) {
  upsertLocal(state.outfits, outfit);
  changed();
  await persist(() => state.store.saveOutfits([outfit]));
}

export async function deleteOutfit(id) {
  state.outfits = state.outfits.filter(o => o.id !== id);
  state.plans = state.plans.filter(p => p.outfitId !== id);
  changed();
  await persist(() => state.store.deleteOutfit(id));
}

export async function setPlan(day, outfitId) {
  state.plans = state.plans.filter(p => p.day !== day);
  if (outfitId) state.plans.push({ day, outfitId });
  changed();
  await persist(() => state.store.setPlan(day, outfitId));
}

/* ---------- Suggestions ---------- */

// Picks a clean item per required slot, favouring things not worn for a while.
export function suggestPick(slots) {
  const pick = {};
  slots.forEach(cat => {
    const pool = state.items.filter(i => i.category === cat.id && i.status === 'clean');
    if (!pool.length || (!cat.required && Math.random() < 0.5)) {
      pick[cat.id] = null;
      return;
    }
    const weighted = pool.flatMap(i => {
      const days = i.lastWorn ? (Date.now() - new Date(i.lastWorn).getTime()) / 86400000 : 60;
      return Array(Math.max(1, Math.min(10, Math.round(days / 3)))).fill(i);
    });
    pick[cat.id] = weighted[Math.floor(Math.random() * weighted.length)].id;
  });
  return pick;
}
