export const STATUSES = [
  { id: 'clean',      label: 'Clean',          color: '#2f9e6a' },
  { id: 'dirty',      label: 'Dirty',          color: '#c27a3a' },
  { id: 'washing',    label: 'In the wash',    color: '#3b7dd8' },
  { id: 'drying',     label: 'Drying',         color: '#46aac0' },
  { id: 'ironing',    label: 'Needs ironing',  color: '#d29b14' },
  { id: 'repair',     label: 'Needs repair',   color: '#c94a4a' },
  { id: 'drycleaner', label: 'At dry cleaner', color: '#8b6cc9' },
  { id: 'away',       label: 'Lent / away',    color: '#8d8a85' },
];
export const statusById = Object.fromEntries(STATUSES.map(s => [s.id, s]));

// `fit` is where an uploaded picture lands on the mannequin by default:
// x = horizontal center, y = top edge, w = width, all as % of the mannequin stage.
// Pictures prepared to match the mannequin exactly use FULL_FIT instead.
export const CATEGORIES = [
  { id: 'top',       label: 'Tops',        single: 'Top',       layer: 3, required: true,  fit: { x: 50, y: 17.5, w: 50 } },
  { id: 'bottom',    label: 'Bottoms',     single: 'Bottom',    layer: 2, required: true,  fit: { x: 50, y: 43,   w: 29 } },
  { id: 'outerwear', label: 'Outerwear',   single: 'Outerwear', layer: 4, required: false, fit: { x: 50, y: 17,   w: 56 } },
  { id: 'shoes',     label: 'Shoes',       single: 'Shoes',     layer: 1, required: true,  fit: { x: 50, y: 82.5, w: 31 } },
  { id: 'accessory', label: 'Accessories', single: 'Accessory', layer: 5, required: false, fit: { x: 50, y: 4,    w: 22 } },
];
export const categoryById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
export const FULL_FIT = { x: 50, y: 0, w: 100 };

export function nextStatus(item) {
  switch (item.status) {
    case 'dirty':      return 'washing';
    case 'washing':    return 'drying';
    case 'drying':     return item.needsIroning ? 'ironing' : 'clean';
    case 'ironing':
    case 'repair':
    case 'drycleaner':
    case 'away':       return 'clean';
    default:           return null;
  }
}
