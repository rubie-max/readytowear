import { categoryById, statusById } from './constants.js';
import { esc } from './ui.js';
import { fitFor, imageUrl } from './state.js';

const layerOf = item => categoryById[item.category]?.layer ?? 3;

export function layerStyle(fit, item) {
  return `left:${fit.x}%;top:${fit.y}%;width:${fit.w}%;z-index:${layerOf(item)}`;
}

// size: 'full' (Try On), 'medium' (sheets), 'mini' (cards), 'tiny' (lists)
export function stageHTML(items, { size = 'full', active = null } = {}) {
  const layers = items
    .filter(i => imageUrl(i))
    .sort((a, b) => layerOf(a) - layerOf(b))
    .map(i => `<img class="stage-layer${i.id === active ? ' is-active' : ''}" data-layer="${i.id}"
      src="${esc(imageUrl(i))}" style="${layerStyle(fitFor(i), i)}" alt="${esc(i.name)}" draggable="false">`)
    .join('');
  const missing = items.filter(i => !imageUrl(i));
  const named = size === 'full' || size === 'medium';
  const chips = size === 'tiny' ? '' : `<div class="stage-missing${named ? '' : ' dots-only'}">
    ${missing.map(i => `<span title="${esc(i.name)}"><i style="background:${esc(i.color)}"></i>${named ? esc(i.name) : ''}</span>`).join('')}
  </div>`;
  return `<div class="stage stage-${size}">
    <img class="stage-base" src="assets/mannequin.jpg" alt="" draggable="false">
    ${layers}${missing.length ? chips : ''}
  </div>`;
}

export function thumbHTML(item, cls = 'thumb') {
  const url = imageUrl(item);
  if (url) return `<div class="${cls}"><img src="${esc(url)}" alt="" loading="lazy" draggable="false"></div>`;
  const initial = esc((item.name || '?').trim().slice(0, 1).toUpperCase());
  return `<div class="${cls} thumb-empty${isLight(item.color) ? ' light' : ''}" style="--swatch:${esc(item.color)}"><span>${initial}</span></div>`;
}

function isLight(hex = '') {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.72;
}

export function statusTag(item, extra = '') {
  const s = statusById[item.status] || statusById.clean;
  return `<span class="status-tag ${extra}" style="--c:${s.color}"><i></i>${esc(s.label)}</span>`;
}

export function readyBadge(info) {
  if (!info.items.length) return `<span class="badge badge-muted">Empty</span>`;
  return info.ready
    ? `<span class="badge badge-ready">Ready to wear</span>`
    : `<span class="badge badge-wait">${info.blockers.length} not clean</span>`;
}
