import { APP_NAME } from './config.js';
import { createStore } from './store.js';
import { $, $$, esc, icon, openSheet, toast } from './ui.js';
import { state, onChange, loadAll, syncFromRemote } from './state.js';
import { renderWardrobe } from './views/wardrobe.js';
import { renderTryOn } from './views/tryon.js';
import { renderOutfits } from './views/outfits.js';
import { renderPlanner } from './views/planner.js';

const TABS = [
  { id: 'wardrobe', label: 'Wardrobe', icon: 'hanger', render: renderWardrobe },
  { id: 'tryon', label: 'Try On', icon: 'person', render: renderTryOn },
  { id: 'outfits', label: 'Outfits', icon: 'layers', render: renderOutfits },
  { id: 'planner', label: 'Planner', icon: 'calendar', render: renderPlanner },
];

const app = $('#app');

async function boot() {
  try {
    state.store = await createStore();
    state.store.onRemoteChange = syncFromRemote;
    state.user = await state.store.getUser();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="center-msg"><h2>Couldn't start</h2><p>${esc(e.message || e)}</p>
      <button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  if (state.user) enterApp();
  else showLogin();
}

function showLogin() {
  const demo = state.store.mode === 'demo';
  app.innerHTML = `
    <div class="login">
      <div class="login-card">
        <img class="login-logo" src="assets/icon-192.png" alt="">
        <h1>${esc(APP_NAME)}</h1>
        <p class="login-sub">Your wardrobe, always ready.</p>
        <form class="form" novalidate>
          <label class="field"><span>Username</span>
            <input type="text" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
          <label class="field"><span>Password</span>
            <input type="password" name="password" autocomplete="current-password" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn-primary btn-block">Sign in</button>
        </form>
        ${demo ? `<p class="login-note">Demo mode: any username and password works, and data stays in this browser.</p>` : ''}
      </div>
    </div>`;

  const form = $('form', app);
  form.onsubmit = async e => {
    e.preventDefault();
    const error = $('.form-error', form);
    const button = $('[type="submit"]', form);
    error.hidden = true;
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      state.user = await state.store.signIn(form.username.value, form.password.value);
      enterApp();
    } catch (err) {
      error.textContent = err.message || 'Could not sign in.';
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  };
}

async function enterApp() {
  app.innerHTML = `<div class="center-msg"><div class="spinner"></div></div>`;
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="center-msg"><h2>Couldn't load your wardrobe</h2><p>${esc(e.message || e)}</p>
      <button class="btn btn-primary" onclick="location.reload()">Try again</button>
      <button class="btn btn-ghost" data-logout>Sign out</button></div>`;
    $('[data-logout]', app).onclick = signOut;
    return;
  }

  app.innerHTML = `
    <header class="topbar">
      <h1 data-title></h1>
      <button class="avatar" data-account aria-label="Account">${esc(initial())}</button>
    </header>
    ${state.store.mode === 'demo' ? `<div class="demo-banner">Demo mode: data is only saved in this browser.</div>` : ''}
    <main id="view"></main>
    <nav class="tabbar">
      ${TABS.map(t => `<button class="tabbar-btn" data-tab="${t.id}">${icon(t.icon, 22)}<span>${t.label}</span></button>`).join('')}
    </nav>`;

  $$('[data-tab]', app).forEach(b => { b.onclick = () => go(b.dataset.tab); });
  $('[data-account]', app).onclick = openAccount;
  onChange(renderView);
  renderView();
}

function go(view) {
  state.view = view;
  window.scrollTo(0, 0);
  renderView();
}

function renderView() {
  const tab = TABS.find(t => t.id === state.view) || TABS[0];
  $('[data-title]', app).textContent = tab.label;
  $$('[data-tab]', app).forEach(b => b.classList.toggle('active', b.dataset.tab === tab.id));
  tab.render($('#view'), go);
}

const displayName = () => state.user?.name || state.user?.email || '';
const initial = () => (displayName() || '?')[0].toUpperCase();

async function signOut() {
  await state.store.signOut();
  Object.assign(state, { user: null, items: [], outfits: [], plans: [], logs: [], urls: {} });
  state.ui.tryon = null;
  showLogin();
  toast('Signed out');
}

function openAccount() {
  const sheet = openSheet({
    title: 'Account',
    render: () => `
      <div class="account">
        <div class="avatar avatar-lg">${esc(initial())}</div>
        <div><strong>${esc(displayName())}</strong>
          <small>${state.store.mode === 'demo' ? 'Demo mode (this browser only)' : 'Synced across your devices via GitHub'}</small></div>
      </div>
      <p class="detail-note">${state.items.length} items · ${state.outfits.length} outfits · ${state.logs.length} days in history</p>
      <div class="sheet-actions">
        <button class="btn btn-danger btn-block" data-logout>${icon('logout', 18)} Sign out</button>
      </div>`,
    bind: el => {
      $('[data-logout]', el).onclick = () => {
        sheet.close();
        signOut();
      };
    },
  });
}

// Pick up changes made on other devices when the app comes back into view, and every
// minute while it stays open.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) syncFromRemote();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && state.user) syncFromRemote();
}, 60000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
