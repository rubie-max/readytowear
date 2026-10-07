// 3D mannequin built from cross-sections measured off assets/mannequin.jpg (720x1280).
// Every vertex remembers where it sits on that 2D stage (`proj`), so clothing photos
// fitted on the 2D mannequin can be wrapped onto the 3D one without extra data.
import * as THREE from './vendor/three.module.min.js';

export const STAGE_W = 720;
export const STAGE_H = 1280;
export const CX = 359.5;   // body centre line, stage px
export const FLOOR = 1200; // stage y of the floor
export const UNIT = 0.01;  // world units per stage px

// Vertical parts: [stage y, centre x, half width, half depth, depth centre], all in stage px.
const HEAD = [
  [68, CX, 3, 4, -6], [72, CX, 15.5, 18, -6], [76, CX, 24.5, 29, -6], [80, CX, 30.5, 36, -6],
  [88, CX, 38.5, 46, -6], [100, CX, 45.5, 54, -6], [120, CX, 49.5, 59, -5], [140, CX, 49.5, 59, -4],
  [160, CX, 46.5, 55, -2], [180, CX, 40.5, 48, 0], [195, CX, 35, 41, 2], [205, CX, 28, 33, 3],
  [212, CX, 16, 20, 3], [216, CX, 4, 5, 3],
];
const NECK = [[195, CX, 34, 36, -8], [225, CX, 34.5, 36, -7], [240, CX, 44, 40, -6], [250, CX, 58, 40, -5]];
const TORSO = [
  [228, CX, 36, 34, -6], [240, CX, 46, 38, -5], [250, CX, 62, 41, -4], [260, CX, 82, 45, -3],
  [272, CX, 91, 51, -1], [290, CX, 94, 58, 1], [320, CX, 95.5, 65, 3], [350, CX, 95, 69, 4],
  [380, CX, 93, 68, 3], [400, CX, 91.5, 65, 2], [420, CX, 88.5, 62, 1], [440, CX, 84.5, 59, 0],
  [460, CX, 81.5, 57, 0], [480, CX, 82.5, 57, -1], [500, CX, 86.5, 59, -1], [540, CX, 91.5, 63, -2],
  [580, CX, 97, 67, -3], [620, CX, 102.5, 69, -4], [645, CX, 104.5, 67, -4], [658, CX, 100, 58, -3],
  [666, CX, 84, 40, -2],
];
// Tops and jackets carry on past the crotch so their hems hang free around the hips.
const TORSO_LONG = [...TORSO.slice(0, -2), [700, CX, 107, 69, -4], [800, CX, 107, 69, -4]];
const ARM = [
  [258, 266, 4, 4, -2], [263, 260, 13, 14, -2], [270, 255, 19, 22, -2], [282, 252, 22, 25, -2],
  [298, 248, 27, 29, -2], [320, 243.5, 27.5, 29, -3], [340, 238.5, 25.5, 27, -3], [380, 236, 26.5, 27, -3],
  [400, 234.5, 27.5, 27.5, -3], [440, 229.5, 26.5, 26, -2], [480, 223, 29, 26, 0], [520, 219.5, 27.5, 24, 2],
  [560, 215.5, 21.5, 20, 3], [600, 211.5, 16.5, 17, 4], [620, 210.5, 15.5, 20, 5], [640, 212.5, 19.5, 27, 6],
  [660, 210, 20, 29, 6], [680, 212.5, 19.5, 27, 7], [700, 215.5, 16.5, 22, 7], [710, 218, 11, 15, 6],
  [716, 220, 3, 4, 6],
];
const LEG = [
  [625, 307, 50, 55, -3], [660, 304.5, 50.5, 55, -2], [700, 303, 48, 52, -1], [740, 302, 43, 47, 0],
  [780, 302.5, 37.5, 41, 1], [820, 302.5, 34.5, 37, 2], [850, 300, 33, 35, 2], [880, 295, 32, 36, -1],
  [920, 294.5, 35.5, 40, -5], [960, 294.5, 31.5, 36, -5], [1000, 294, 25, 28, -3], [1040, 294, 20, 22, -2],
  [1080, 295.5, 19.5, 21, -2], [1110, 295.5, 21, 23, -3], [1150, 296, 22, 26, -6],
];
// Feet run front to back: [depth z, centre x, half width, stage y of the top]; soles sit on FLOOR.
const FOOT = [
  [-46, 297, 7, 1178], [-40, 297, 16, 1160], [-26, 296.5, 21, 1140], [-6, 296, 22.5, 1128],
  [14, 295.5, 24, 1134], [36, 294.5, 27, 1150], [58, 293, 30, 1164], [80, 291.5, 31, 1176],
  [98, 290.5, 27, 1184], [108, 290, 18, 1189], [113, 290, 7, 1194],
];

const mirror = keys => keys.map(([a, x, ...rest]) => [a, 2 * CX - x, ...rest]);
const se = (t, p) => Math.sign(t) * Math.abs(t) ** (2 / p);

// Monotone cubic (PCHIP) per channel, so the outline never overshoots between measurements.
function spline(keys) {
  const xs = keys.map(k => k[0]);
  const n = xs.length;
  const channels = keys[0].slice(1).map((_, c) => {
    const ys = keys.map(k => k[c + 1]);
    const h = [], d = [], m = [];
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else {
        const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return { ys, h, m };
  });
  return x => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    return channels.map(({ ys, h, m }) => {
      const t = Math.min(1, Math.max(0, (x - xs[i]) / h[i])), t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
        + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    });
  };
}

function sampled(keys, step) {
  const f = spline(keys);
  const t0 = keys[0][0], t1 = keys.at(-1)[0];
  const n = Math.ceil((t1 - t0) / step);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / n;
    return [t, ...f(t)];
  });
}

const vertical = (name, keys, { seg, step = 4, power = 2, shrink = 0.93 }) =>
  ({ name, kind: 'vertical', seg, power, shrink, rings: sampled(keys, step) });
const foot = (name, keys, { seg, step = 4, power = 2.6, shrink = 0.9 }) =>
  ({ name, kind: 'foot', seg, power, shrink, rings: sampled(keys, step) });

// Ring vertices are [stage x, stage y, depth z, proj x, proj y]. `proj` always comes from
// the bare body, pulled slightly toward the centre so side vertices stay inside the
// photo's outline, no matter how loose the garment built on top of it is.
//
// `ease` adds room all round (stage px). `taper` limits how fast fabric may narrow going
// down (px per px), so it hangs from the widest point instead of following the waist or
// calves; the slack that creates is turned into soft vertical folds. `drop` [from, to, px]
// lets the photo reach further down (trouser hems that break over the shoes).
function verticalRings(p, { ease = 0, taper = Infinity, folds = 0, drop = null }) {
  let hangW = 0, hangD = 0, prev = 0;
  return p.rings.map(([y, cx, hw, hd, zc], i) => {
    const t = drop ? Math.min(1, Math.max(0, (y - drop[0]) / (drop[1] - drop[0]))) : 0;
    const projY = y - (drop ? drop[2] * t * t * (3 - 2 * t) : 0);
    const w = hw + ease, d = hd + ease * 0.85;
    hangW = i ? Math.max(w, hangW - taper * (y - prev)) : w;
    hangD = i ? Math.max(d, hangD - taper * (y - prev)) : d;
    prev = y;
    const slack = Math.min(16, hangW - w + (hangD - d) * 0.6);
    const pts = [];
    for (let j = 0; j < p.seg; j++) {
      const a = (j / p.seg) * Math.PI * 2;
      const sx = se(Math.cos(a), p.power), sz = se(Math.sin(a), p.power);
      const fold = folds * slack * 0.32 * (0.6 * Math.sin(7 * a + y * 0.011) + 0.4 * Math.sin(12 * a - y * 0.017 + 1.3));
      pts.push([cx + (hangW + fold) * sx, y, zc + (hangD + fold * (hangD / hangW)) * sz, cx + hw * sx * p.shrink, projY]);
    }
    return { pts, c: [cx, y, zc] };
  });
}

function footRings(p, { ease = 0 }) {
  const z0 = p.rings[0][0], z1 = p.rings.at(-1)[0], zm = (z0 + z1) / 2;
  const stretch = 1 + (2 * ease) / (z1 - z0);
  return p.rings.map(([z, cx, hw, top]) => {
    const t = top - ease, yc = (t + FLOOR) / 2, hh = (FLOOR - t) / 2;
    const bodyYc = (top + FLOOR) / 2, bodyHh = (FLOOR - top) / 2;
    const zz = zm + (z - zm) * stretch;
    const pts = [];
    for (let j = 0; j < p.seg; j++) {
      const a = (j / p.seg) * Math.PI * 2;
      const sx = se(Math.cos(a), p.power), sy = se(Math.sin(a), p.power);
      const projY = Math.min(FLOOR, bodyYc - bodyHh * sy);
      pts.push([cx + (hw + ease) * sx, Math.min(FLOOR, yc - hh * sy), zz, cx + hw * sx * p.shrink, projY]);
    }
    return { pts, c: [cx, yc, zz] };
  });
}

// Side triangles come first in the index so clothing shells can skip the end caps.
export function partGeometry(p, drape = {}) {
  return assemble(p.name, p.kind === 'foot' ? footRings(p, drape) : verticalRings(p, drape));
}

function assemble(name, rings) {
  const seg = rings[0].pts.length;
  const verts = rings.flatMap(r => r.pts);
  const index = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
      index.push(a, b, c, b, d, c);
    }
  }
  const sideCount = index.length;
  const cap = (ring, start) => {
    const base = verts.length;
    verts.push(...ring.pts);
    const t = verts.length;
    verts.push([...ring.c, ring.c[0], ring.c[1]]);
    for (let j = 0; j < seg; j++) {
      const a = base + j, b = base + ((j + 1) % seg);
      if (start) index.push(t, b, a);
      else index.push(t, a, b);
    }
  };
  cap(rings[0], true);
  cap(rings.at(-1), false);

  const pos = new Float32Array(verts.length * 3);
  const proj = new Float32Array(verts.length * 2);
  verts.forEach(([x, y, z, px, py], i) => {
    pos.set([(x - CX) * UNIT, (FLOOR - y) * UNIT, z * UNIT], i * 3);
    proj.set([px, py], i * 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('proj', new THREE.BufferAttribute(proj, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return { name, geometry, sideCount };
}

// Body parts plus `torsoLong`, which only clothes use.
export const PARTS = Object.fromEntries([
  vertical('head', HEAD, { seg: 40, step: 3 }),
  vertical('neck', NECK, { seg: 32 }),
  vertical('torso', TORSO, { seg: 56, power: 2.4 }),
  vertical('torsoLong', TORSO_LONG, { seg: 56, power: 2.4 }),
  vertical('armL', ARM, { seg: 28 }),
  vertical('armR', mirror(ARM), { seg: 28 }),
  vertical('legL', LEG, { seg: 36 }),
  vertical('legR', mirror(LEG), { seg: 36 }),
  foot('footL', FOOT, { seg: 32 }),
  foot('footR', mirror(FOOT), { seg: 32 }),
].map(p => [p.name, p]));

export const BODY_PARTS = ['head', 'neck', 'torso', 'armL', 'armR', 'legL', 'legR', 'footL', 'footR'];
