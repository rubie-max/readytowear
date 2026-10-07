import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const BUCKET = 'clothes';
const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;

const itemFromRow = r => ({
  id: r.id,
  name: r.name,
  category: r.category,
  color: r.color || '#9a958c',
  status: r.status,
  imagePath: r.image_path,
  fit: r.fit,
  needsIroning: r.needs_ironing,
  wearsBeforeWash: r.wears_before_wash,
  wearsSinceWash: r.wears_since_wash,
  wearCount: r.wear_count,
  lastWorn: r.last_worn,
  notes: r.notes || '',
  createdAt: r.created_at,
});
const itemToRow = i => ({
  id: i.id,
  name: i.name,
  category: i.category,
  color: i.color,
  status: i.status,
  image_path: i.imagePath || null,
  fit: i.fit || null,
  needs_ironing: !!i.needsIroning,
  wears_before_wash: i.wearsBeforeWash || 1,
  wears_since_wash: i.wearsSinceWash || 0,
  wear_count: i.wearCount || 0,
  last_worn: i.lastWorn || null,
  notes: i.notes || null,
});
const outfitFromRow = r => ({
  id: r.id,
  name: r.name,
  itemIds: r.item_ids || [],
  notes: r.notes || '',
  wearCount: r.wear_count,
  lastWorn: r.last_worn,
  createdAt: r.created_at,
});
const outfitToRow = o => ({
  id: o.id,
  name: o.name,
  item_ids: o.itemIds,
  notes: o.notes || null,
  wear_count: o.wearCount || 0,
  last_worn: o.lastWorn || null,
});
const logFromRow = r => ({
  id: r.id,
  day: r.day,
  outfitId: r.outfit_id,
  outfitName: r.outfit_name,
  itemIds: r.item_ids || [],
  createdAt: r.created_at,
});

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function createStore() {
  return isConfigured() ? createSupabaseStore() : createDemoStore();
}

async function createSupabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let user = null;

  const check = ({ data, error }) => {
    if (error) throw error;
    return data;
  };

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession();
      user = data.session?.user || null;
      return user;
    },
    async signIn(email, password) {
      user = check(await sb.auth.signInWithPassword({ email, password })).user;
      return user;
    },
    async signOut() {
      await sb.auth.signOut();
      user = null;
    },

    async loadAll() {
      const [items, outfits, plans, logs] = (await Promise.all([
        sb.from('items').select('*').order('name'),
        sb.from('outfits').select('*').order('created_at'),
        sb.from('plans').select('*'),
        sb.from('wear_log').select('*').order('day', { ascending: false }).limit(500),
      ])).map(check);
      return {
        items: items.map(itemFromRow),
        outfits: outfits.map(outfitFromRow),
        plans: plans.map(r => ({ day: r.day, outfitId: r.outfit_id })),
        logs: logs.map(logFromRow),
      };
    },

    async saveItems(list) {
      check(await sb.from('items').upsert(list.map(itemToRow)));
    },
    async deleteItem(item) {
      check(await sb.from('items').delete().eq('id', item.id));
      if (item.imagePath) await sb.storage.from(BUCKET).remove([item.imagePath]);
    },

    async saveOutfits(list) {
      check(await sb.from('outfits').upsert(list.map(outfitToRow)));
    },
    async deleteOutfit(id) {
      check(await sb.from('outfits').delete().eq('id', id));
    },

    async setPlan(day, outfitId) {
      if (outfitId) {
        check(await sb.from('plans').upsert({ user_id: user.id, day, outfit_id: outfitId }, { onConflict: 'user_id,day' }));
      } else {
        check(await sb.from('plans').delete().eq('day', day));
      }
    },

    async addLog(log) {
      check(await sb.from('wear_log').insert({
        id: log.id, day: log.day, outfit_id: log.outfitId, outfit_name: log.outfitName, item_ids: log.itemIds,
      }));
    },
    async deleteLog(id) {
      check(await sb.from('wear_log').delete().eq('id', id));
    },

    async uploadImage(blob, ext) {
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }));
      return path;
    },
    async deleteImage(path) {
      await sb.storage.from(BUCKET).remove([path]);
    },
    async imageUrls(paths) {
      const data = check(await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS));
      return Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
    },
  };
}

function createDemoStore() {
  const KEY = 'readytowear-demo-v1';
  let db = JSON.parse(localStorage.getItem(KEY) || 'null') || { user: null, items: [], outfits: [], plans: [], logs: [] };

  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      throw new Error('Browser storage is full. Remove some photos.');
    }
  };
  const upsert = (arr, list) => list.forEach(x => {
    const i = arr.findIndex(y => y.id === x.id);
    if (i >= 0) arr[i] = structuredClone(x);
    else arr.push(structuredClone(x));
  });

  return {
    mode: 'demo',

    async getUser() { return db.user; },
    async signIn(email, password) {
      if (!email || !password) throw new Error('Enter your email and password.');
      db.user = { email };
      write();
      return db.user;
    },
    async signOut() {
      db.user = null;
      write();
    },

    async loadAll() {
      return structuredClone({ items: db.items, outfits: db.outfits, plans: db.plans, logs: db.logs });
    },

    async saveItems(list) { upsert(db.items, list); write(); },
    async deleteItem(item) {
      db.items = db.items.filter(i => i.id !== item.id);
      write();
    },

    async saveOutfits(list) { upsert(db.outfits, list); write(); },
    async deleteOutfit(id) {
      db.outfits = db.outfits.filter(o => o.id !== id);
      db.plans = db.plans.filter(p => p.outfitId !== id);
      db.logs.forEach(l => { if (l.outfitId === id) l.outfitId = null; });
      write();
    },

    async setPlan(day, outfitId) {
      db.plans = db.plans.filter(p => p.day !== day);
      if (outfitId) db.plans.push({ day, outfitId });
      write();
    },

    async addLog(log) { db.logs.unshift(structuredClone(log)); write(); },
    async deleteLog(id) {
      db.logs = db.logs.filter(l => l.id !== id);
      write();
    },

    async uploadImage(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
    async deleteImage() {},
    async imageUrls(paths) {
      return Object.fromEntries(paths.map(p => [p, p]));
    },
  };
}
