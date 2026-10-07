import { ACCOUNTS, DATA_BRANCH, DATA_REPO } from './config.js';

const DATA_FILE = 'data.json';
const PBKDF2_ITERATIONS = 250000;
const emptyDb = () => ({ version: 1, items: [], outfits: [], plans: [], logs: [] });
const pick = db => structuredClone({ items: db.items, outfits: db.outfits, plans: db.plans, logs: db.logs });

export const isConfigured = () => Boolean(DATA_REPO && Object.keys(ACCOUNTS).length);

export async function createStore() {
  return isConfigured() ? createGitHubStore() : createDemoStore();
}

/* ---------- Edits shared by both stores ---------- */

// Each edit returns a function that applies the change to a database object, so the
// GitHub store can re-apply it on top of newer data if another device saved first.
const upsert = (arr, list) => list.forEach(x => {
  const i = arr.findIndex(y => y.id === x.id);
  if (i >= 0) arr[i] = structuredClone(x);
  else arr.push(structuredClone(x));
});

const edits = {
  saveItems: list => db => upsert(db.items, list),
  deleteItem: item => db => { db.items = db.items.filter(i => i.id !== item.id); },
  saveOutfits: list => db => upsert(db.outfits, list),
  deleteOutfit: id => db => {
    db.outfits = db.outfits.filter(o => o.id !== id);
    db.plans = db.plans.filter(p => p.outfitId !== id);
    db.logs.forEach(l => { if (l.outfitId === id) l.outfitId = null; });
  },
  setPlan: (day, outfitId) => db => {
    db.plans = db.plans.filter(p => p.day !== day);
    if (outfitId) db.plans.push({ day, outfitId });
  },
  addLog: log => db => { db.logs = [structuredClone(log), ...db.logs.filter(l => l.id !== log.id)]; },
  deleteLog: id => db => { db.logs = db.logs.filter(l => l.id !== id); },
};

/* ---------- Encoding & token encryption ---------- */

const b64ToBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const textToB64 = text => bytesToB64(new TextEncoder().encode(text));
const b64ToText = b64 => new TextDecoder().decode(b64ToBytes(b64));

async function passwordKey(username, password, salt, usage) {
  const base = await crypto.subtle.importKey('raw',
    new TextEncoder().encode(`${username.trim().toLowerCase()}:${password}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

export async function sealToken(username, password, token) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(username, password, salt, 'encrypt');
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) };
}

async function unsealToken(account, username, password) {
  const key = await passwordKey(username, password, b64ToBytes(account.salt), 'decrypt');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(account.iv) }, key, b64ToBytes(account.data));
  return new TextDecoder().decode(plain);
}

/* ---------- GitHub store: data.json + images/ in a private repo ---------- */

function createGitHubStore() {
  const SESSION_KEY = 'readytowear-session-v1';
  const IMAGE_CACHE = 'readytowear-images-v1';
  let session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  let db = emptyDb();
  let sha = null;
  let editCount = 0;
  let merged = false;
  let writing = 0;
  let writeChain = Promise.resolve();
  let flushTimer = null;
  const queue = [];
  const objectUrls = {};

  const errorText = (status, body) => {
    if (status === 401) return 'GitHub refused the saved access key. Sign out and sign in again, or make a new key.';
    if (status === 403 && /rate limit/i.test(body)) return 'GitHub is limiting requests right now. Try again in a few minutes.';
    if (status === 404) return 'Not found on GitHub.';
    return `GitHub error ${status}`;
  };

  async function api(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${DATA_REPO}/${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('No connection to GitHub. Check your internet.');
    }
    if (!res.ok) {
      const err = new Error(errorText(res.status, await res.text()));
      err.status = res.status;
      throw err;
    }
    return res;
  }

  async function readDb() {
    let meta;
    try {
      meta = await (await api(`contents/${DATA_FILE}?ref=${DATA_BRANCH}`)).json();
    } catch (e) {
      if (e.status === 404) return { db: emptyDb(), sha: null };
      throw e;
    }
    // The contents API leaves `content` empty for files over 1 MB; fetch the blob instead.
    const text = meta.encoding === 'base64' && meta.content
      ? b64ToText(meta.content)
      : await (await api(`git/blobs/${meta.sha}`, { accept: 'application/vnd.github.raw+json' })).text();
    return { db: { ...emptyDb(), ...JSON.parse(text) }, sha: meta.sha };
  }

  // GitHub rejects parallel commits to one branch, so every write goes through this chain.
  function serial(task) {
    writing++;
    const run = writeChain.then(task).finally(() => { writing--; });
    writeChain = run.catch(() => {});
    return run;
  }

  async function retryOnConflict(task) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await task();
      } catch (e) {
        if (e.status !== 409 || attempt >= 3) throw e;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  const putFile = (path, content, fileSha, message) => api(`contents/${path}`, {
    method: 'PUT',
    body: { message, content, branch: DATA_BRANCH, ...(fileSha ? { sha: fileSha } : {}) },
  }).then(r => r.json());

  // Edits made within half a second are saved together as one commit.
  function edit(change) {
    editCount++;
    return new Promise((resolve, reject) => {
      queue.push({ change, resolve, reject });
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 500);
    });
  }

  function flush() {
    const batch = queue.splice(0);
    if (!batch.length) return;
    serial(async () => {
      for (let attempt = 0; ; attempt++) {
        const next = structuredClone(db);
        batch.forEach(b => b.change(next));
        try {
          const res = await putFile(DATA_FILE, textToB64(JSON.stringify(next, null, 1)), sha,
            `Update wardrobe (${batch.length} change${batch.length > 1 ? 's' : ''})`);
          db = next;
          sha = res.content.sha;
          return;
        } catch (e) {
          // 409/422: data.json changed on another device. Reload it and re-apply our edits on top.
          if (![409, 422].includes(e.status) || attempt >= 3) throw e;
          ({ db, sha } = await readDb());
          merged = true;
        }
      }
    }).then(() => {
      batch.forEach(b => b.resolve());
      if (merged) store.onRemoteChange?.();
    }, e => batch.forEach(b => b.reject(e)));
  }

  const imageCache = () => ('caches' in window ? caches.open(IMAGE_CACHE) : Promise.resolve(null));
  const cacheKey = path => new URL(`__images/${path}`, location.href).href;
  const mimeFor = path => (/\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg');

  async function imageBlob(path) {
    const cache = await imageCache();
    const hit = await cache?.match(cacheKey(path));
    if (hit) return hit.blob();
    const res = await api(`contents/${path}?ref=${DATA_BRANCH}`, { accept: 'application/vnd.github.raw+json' });
    const blob = new Blob([await res.arrayBuffer()], { type: mimeFor(path) });
    await cache?.put(cacheKey(path), new Response(blob, { headers: { 'Content-Type': blob.type } }));
    return blob;
  }

  const store = {
    mode: 'github',
    // Set by the app; called when a save had to merge in changes from another device.
    onRemoteChange: null,

    async getUser() { return session?.user || null; },

    async signIn(username, password) {
      const account = ACCOUNTS[username.trim().toLowerCase()];
      if (!account || !password) throw new Error('Wrong username or password.');
      let token;
      try {
        token = await unsealToken(account, username, password);
      } catch {
        throw new Error('Wrong username or password.');
      }
      session = { token, user: { name: account.name, username: username.trim().toLowerCase() } };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session.user;
    },

    async signOut() {
      session = null;
      localStorage.removeItem(SESSION_KEY);
      Object.values(objectUrls).forEach(URL.revokeObjectURL);
      if ('caches' in window) await caches.delete(IMAGE_CACHE);
    },

    async loadAll() {
      ({ db, sha } = await readDb());
      return pick(db);
    },

    // Returns fresh data if another device saved since we last looked, otherwise null.
    async refresh() {
      if (queue.length || writing) return null;
      const before = editCount;
      const remote = await readDb();
      if (before !== editCount || queue.length || writing) return null;
      if (remote.sha === sha && !merged) return null;
      ({ db, sha } = remote);
      merged = false;
      return pick(db);
    },

    saveItems: list => edit(edits.saveItems(list)),
    async deleteItem(item) {
      await edit(edits.deleteItem(item));
      if (item.imagePath) await this.deleteImage(item.imagePath).catch(() => {});
    },
    saveOutfits: list => edit(edits.saveOutfits(list)),
    deleteOutfit: id => edit(edits.deleteOutfit(id)),
    setPlan: (day, outfitId) => edit(edits.setPlan(day, outfitId)),
    addLog: log => edit(edits.addLog(log)),
    deleteLog: id => edit(edits.deleteLog(id)),

    async uploadImage(blob, ext) {
      const path = `images/${crypto.randomUUID()}.${ext}`;
      const content = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
      await serial(() => retryOnConflict(() => putFile(path, content, null, 'Add photo')));
      const cache = await imageCache();
      await cache?.put(cacheKey(path), new Response(blob, { headers: { 'Content-Type': mimeFor(path) } }));
      return path;
    },

    async deleteImage(path) {
      await serial(() => retryOnConflict(async () => {
        let meta;
        try {
          meta = await (await api(`contents/${path}?ref=${DATA_BRANCH}`)).json();
        } catch (e) {
          if (e.status === 404) return;
          throw e;
        }
        await api(`contents/${path}`, { method: 'DELETE', body: { message: 'Remove photo', sha: meta.sha, branch: DATA_BRANCH } });
      }));
      (await imageCache())?.delete(cacheKey(path));
    },

    async imageUrls(paths) {
      const out = {};
      const todo = [...paths];
      const worker = async () => {
        while (todo.length) {
          const path = todo.shift();
          try {
            objectUrls[path] ||= URL.createObjectURL(await imageBlob(path));
            out[path] = objectUrls[path];
          } catch (e) {
            console.warn('Photo failed to load', path, e);
          }
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      return out;
    },
  };
  return store;
}

/* ---------- Demo store: this browser only ---------- */

function createDemoStore() {
  const KEY = 'readytowear-demo-v1';
  const db = { user: null, ...emptyDb(), ...JSON.parse(localStorage.getItem(KEY) || 'null') };

  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      throw new Error('Browser storage is full. Remove some photos.');
    }
  };
  const apply = change => { change(db); write(); };

  return {
    mode: 'demo',

    async getUser() { return db.user; },
    async signIn(username, password) {
      if (!username.trim() || !password) throw new Error('Enter your username and password.');
      db.user = { name: username.trim(), username: username.trim().toLowerCase() };
      write();
      return db.user;
    },
    async signOut() {
      db.user = null;
      write();
    },

    async loadAll() { return pick(db); },
    async refresh() { return null; },

    async saveItems(list) { apply(edits.saveItems(list)); },
    async deleteItem(item) { apply(edits.deleteItem(item)); },
    async saveOutfits(list) { apply(edits.saveOutfits(list)); },
    async deleteOutfit(id) { apply(edits.deleteOutfit(id)); },
    async setPlan(day, outfitId) { apply(edits.setPlan(day, outfitId)); },
    async addLog(log) { apply(edits.addLog(log)); },
    async deleteLog(id) { apply(edits.deleteLog(id)); },

    uploadImage(blob) {
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
