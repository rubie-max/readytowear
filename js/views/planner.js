import { $, $$, esc, icon, openSheet, isoDay, addDays, parseDay, dayLabel, confirmSheet } from '../ui.js';
import { state, outfitById, outfitInfo, itemById, planFor, setPlan, deleteLog } from '../state.js';
import { stageHTML, readyBadge, thumbHTML } from '../mannequin.js';
import { sortedOutfits, wearOutfit, openOutfitSheet } from './outfits.js';

const DAYS_AHEAD = 14;

export function renderPlanner(root, go) {
  const ui = state.ui.planner;
  root.innerHTML = `
    <div class="view-pad">
      <div class="seg seg-full">
        <button class="${ui.tab === 'upcoming' ? 'active' : ''}" data-tab="upcoming">Upcoming</button>
        <button class="${ui.tab === 'history' ? 'active' : ''}" data-tab="history">History</button>
      </div>
      ${ui.tab === 'upcoming' ? upcomingHTML() : historyHTML()}
    </div>`;

  $$('[data-tab]', root).forEach(b => { b.onclick = () => { ui.tab = b.dataset.tab; renderPlanner(root, go); }; });
  $$('[data-day]', root).forEach(b => { b.onclick = () => openPlanSheet(b.dataset.day); });
  $$('[data-outfit]', root).forEach(b => { b.onclick = e => { e.stopPropagation(); openOutfitSheet(b.dataset.outfit, go); }; });
  $$('[data-wear-today]', root).forEach(b => {
    b.onclick = e => { e.stopPropagation(); wearOutfit(outfitById(b.dataset.wearToday)); };
  });
  $$('[data-del-log]', root).forEach(b => {
    b.onclick = async () => {
      if (await confirmSheet({ title: 'Remove from history?', message: 'This only removes the history entry. Clothes keep their current status.', confirmLabel: 'Remove' })) {
        deleteLog(b.dataset.delLog);
      }
    };
  });
}

function upcomingHTML() {
  const today = new Date();
  const wornToday = state.logs.some(l => l.day === isoDay());
  return `<div class="day-list">
    ${Array.from({ length: DAYS_AHEAD }, (_, n) => {
      const day = isoDay(addDays(today, n));
      const plan = planFor(day);
      const outfit = plan && outfitById(plan.outfitId);
      const date = parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const label = n > 1 ? parseDay(day).toLocaleDateString(undefined, { weekday: 'long' }) : dayLabel(day);
      const head = `<div class="day-date"><strong>${esc(label)}</strong><small>${esc(date)}</small></div>`;
      if (!outfit) {
        return `<div class="day-row">${head}<button class="day-empty" data-day="${day}">${icon('plus', 18)} Plan outfit</button></div>`;
      }
      const info = outfitInfo(outfit);
      return `<div class="day-row">${head}
        <div class="day-plan" data-day="${day}" role="button" tabindex="0">
          <button class="day-thumb" data-outfit="${outfit.id}" aria-label="Open ${esc(outfit.name)}">${stageHTML(info.items, { size: 'tiny' })}</button>
          <span class="day-info"><strong>${esc(outfit.name)}</strong>${readyBadge(info)}</span>
          ${n === 0 && !wornToday ? `<button class="btn btn-small btn-primary" data-wear-today="${outfit.id}">Wear</button>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function historyHTML() {
  if (!state.logs.length) {
    return `<div class="empty-state">${icon('calendar', 40)}<h3>No history yet</h3>
      <p>Whenever you tap "Wear today", it shows up here.</p></div>`;
  }
  const byDay = new Map();
  state.logs.forEach(l => byDay.set(l.day, [...(byDay.get(l.day) || []), l]));
  const monthStart = isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const thisMonth = state.logs.filter(l => l.day >= monthStart).length;
  return `
    <p class="history-stat"><b>${thisMonth}</b> ${thisMonth === 1 ? 'outfit' : 'outfits'} worn this month</p>
    <div class="history">
      ${[...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, logs]) => `
        <section>
          <h4>${esc(dayLabel(day))}</h4>
          ${logs.map(l => {
            const items = l.itemIds.map(itemById).filter(Boolean);
            const name = (l.outfitId && outfitById(l.outfitId)?.name) || l.outfitName || 'Mixed items';
            return `<div class="log-row">
              <div class="log-thumbs">${items.slice(0, 5).map(i => thumbHTML(i, 'thumb thumb-xs')).join('')}</div>
              <div class="log-info"><strong>${esc(name)}</strong><small>${items.map(i => esc(i.name)).join(', ') || 'Deleted items'}</small></div>
              <button class="icon-btn" data-del-log="${l.id}" aria-label="Remove">${icon('x', 18)}</button>
            </div>`;
          }).join('')}
        </section>`).join('')}
    </div>`;
}

function openPlanSheet(day) {
  const sheet = openSheet({
    title: `Plan for ${dayLabel(day).toLowerCase()}`,
    render: () => {
      const current = planFor(day)?.outfitId;
      const list = sortedOutfits();
      if (!list.length) return `<p class="sheet-text">Save an outfit in Try On first, then you can plan it here.</p>`;
      return `
        <div class="sheet-actions top">
          <button class="btn btn-secondary" data-suggest>${icon('sparkle', 18)} Pick for me</button>
          ${current ? `<button class="btn btn-ghost" data-clear>Remove plan</button>` : ''}
        </div>
        <div class="choose-list">
          ${list.map(({ o, info }) => `
            <button class="choose-row${o.id === current ? ' selected' : ''}" data-choose="${o.id}">
              ${stageHTML(info.items, { size: 'tiny' })}
              <span class="day-info"><strong>${esc(o.name)}</strong>${readyBadge(info)}</span>
              ${o.id === current ? icon('check', 20) : ''}
            </button>`).join('')}
        </div>`;
    },
    bind: el => {
      const choose = id => { setPlan(day, id); sheet.close(); };
      $$('[data-choose]', el).forEach(b => { b.onclick = () => choose(b.dataset.choose); });
      $('[data-clear]', el)?.addEventListener('click', () => choose(null));
      $('[data-suggest]', el)?.addEventListener('click', () => {
        const plannedSoon = new Set(state.plans.filter(p => p.day >= isoDay() && p.day !== day).map(p => p.outfitId));
        const list = sortedOutfits();
        const pick = list.find(x => x.info.ready && !plannedSoon.has(x.o.id)) || list.find(x => x.info.ready) || list[0];
        choose(pick.o.id);
      });
    },
  });
}
