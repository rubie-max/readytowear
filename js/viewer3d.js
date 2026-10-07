// Spin-and-zoom 3D try-on. Each clothing photo is wrapped onto a loose shell around the
// mannequin, using the same fit (position/size) as the 2D stage.
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { BODY_PARTS, FLOOR, PARTS, STAGE_H, STAGE_W, UNIT, partGeometry } from './body3d.js';
import { fitFor, imageUrl } from './state.js';

// Which body parts each kind of clothing can cover, and how it drapes there
// (see partGeometry). Bigger ease = further out, so outer layers sit on top.
const CUT = {
  top: {
    neck: { ease: 5 }, torsoLong: { ease: 7, taper: 0.03, folds: 1 },
    armL: { ease: 5, taper: 0.05, folds: 1 }, armR: { ease: 5, taper: 0.05, folds: 1 },
  },
  outerwear: {
    neck: { ease: 11 }, torsoLong: { ease: 14, taper: 0.015, folds: 1 },
    armL: { ease: 10, taper: 0.04, folds: 1 }, armR: { ease: 10, taper: 0.04, folds: 1 },
  },
  bottom: {
    torso: { ease: 5 },
    legL: { ease: 6, taper: 0.05, folds: 0.8, drop: [960, 1120, 16] },
    legR: { ease: 6, taper: 0.05, folds: 0.8, drop: [960, 1120, 16] },
  },
  shoes: { footL: { ease: 5 }, footR: { ease: 5 }, legL: { ease: 4 }, legR: { ease: 4 } },
  accessory: {
    head: { ease: 6 }, neck: { ease: 16 }, torsoLong: { ease: 18, taper: 0.015 },
    armL: { ease: 14, taper: 0.04 }, armR: { ease: 14, taper: 0.04 },
  },
};
const FOV = 20;
const CENTER_Y = (FLOOR - 640) * UNIT;
const BASE_DIST = 6.1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const HOME = { yaw: -0.32, pitch: 0.06, zoom: 1, targetY: CENTER_Y };
const MAX_ZOOM = 2.6;

let viewer = null;

export function show3D(host, items, opts = {}) {
  viewer ||= createViewer();
  viewer.show(host, items, opts);
  return viewer;
}

function createViewer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'stage3d-canvas';
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 1, 120);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9bfb2, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(-6, 14, 16);
  key.target.position.set(0, CENTER_Y, 0);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -6.5, right: 6.5, top: 7.5, bottom: -7.5, near: 1, far: 50 });
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xfff3e6, 0.4);
  fill.position.set(9, 5, 7);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(3, 9, -14);
  scene.add(key, key.target, fill, rim);
  scene.add(contactShadow());

  const figure = new THREE.Group();
  scene.add(figure);
  // Satin fibreglass, like a shop-window mannequin.
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xeeebe5, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35,
  });
  BODY_PARTS.forEach(name => {
    const mesh = new THREE.Mesh(partGeometry(PARTS[name]).geometry, skin);
    mesh.castShadow = mesh.receiveShadow = true;
    figure.add(mesh);
  });
  const clothes = new THREE.Group();
  figure.add(clothes);
  const wrinkles = wrinkleTexture();

  const view = { ...HOME };
  let anim = null, spin = 0, frame = 0, opts = {}, shownKey = null, version = 0, firstShow = true;
  const textures = new Map();
  const garments = new Map();
  const shells = new Map();
  const shellsFor = category => {
    if (!shells.has(category)) {
      const cut = CUT[category] || CUT.top;
      shells.set(category, Object.entries(cut).map(([name, drape]) => partGeometry(PARTS[name], drape)));
    }
    return shells.get(category);
  };

  /* ---------- Rendering ---------- */

  function place() {
    const dist = BASE_DIST / view.zoom;
    camera.position.set(0, view.targetY + Math.sin(view.pitch) * dist, Math.cos(view.pitch) * dist);
    camera.lookAt(0, view.targetY, 0);
    figure.rotation.y = view.yaw;
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  let last = 0;
  function tick(now) {
    frame = 0;
    if (!canvas.isConnected) return;
    const dt = Math.min(50, last ? now - last : 16);
    let more = false;
    if (anim) {
      const t = Math.min(1, (now - anim.start) / anim.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      for (const k in anim.to) view[k] = anim.from[k] + (anim.to[k] - anim.from[k]) * e;
      if (t < 1) more = true;
      else anim = null;
    } else if (!drag && Math.abs(spin) > 0.00005) {
      view.yaw += spin * dt;
      spin *= Math.exp(-dt / 320);
      more = true;
    }
    last = more ? now : 0;
    place();
    renderer.render(scene, camera);
    if (more) requestRender();
  }

  function animateTo(to, duration = 650) {
    spin = 0;
    anim = { from: { ...view }, to, start: performance.now(), duration };
    requestRender();
  }

  function resize() {
    const host = canvas.parentElement;
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const observer = new ResizeObserver(resize);

  /* ---------- Clothes ---------- */

  function texturesFor(item) {
    const path = item.imagePath;
    if (!textures.has(path)) {
      const p = makeTextures(imageUrl(item), maxAniso);
      p.catch(() => textures.delete(path));
      textures.set(path, p);
    }
    return textures.get(path);
  }

  function garmentFor(item) {
    const fit = fitFor(item);
    const k = `${item.imagePath}|${item.category}|${fit.x},${fit.y},${fit.w}`;
    if (!garments.has(k)) {
      const p = texturesFor(item).then(tex => buildGarment(shellsFor(item.category), tex, fit, wrinkles));
      p.catch(() => garments.delete(k));
      garments.set(k, p);
    }
    return garments.get(k).then(mesh => { mesh.userData.slot = item.category; return mesh; });
  }

  async function setItems(items) {
    const withPhotos = items.filter(i => imageUrl(i));
    const k = withPhotos.map(i => `${i.id}|${i.imagePath}|${JSON.stringify(fitFor(i))}`).join(';');
    if (k === shownKey) return;
    shownKey = k;
    const token = ++version;
    const meshes = await Promise.all(withPhotos.map(i => garmentFor(i).catch(e => { console.warn(e); return null; })));
    if (token !== version) return;
    clothes.clear();
    meshes.filter(Boolean).forEach(m => clothes.add(m));
    opts.onReady?.();
    requestRender();
  }

  /* ---------- Touch & mouse ---------- */

  const pointers = new Map();
  let drag = null, pinch = null, lastTap = 0;

  const worldPerPx = () => (2 * (BASE_DIST / view.zoom) * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / canvas.clientHeight;
  const clampTarget = () => {
    const half = 6.1 / view.zoom;
    const lo = Math.min(CENTER_Y, half - 0.4), hi = Math.max(CENTER_Y, 11.6 - half);
    view.targetY = Math.min(hi, Math.max(lo, view.targetY));
  };

  // Zooms while keeping the point under (screen offset) `oy` from the centre in place.
  function zoomAt(zoom, oy) {
    const before = worldPerPx();
    const anchor = view.targetY - oy * before;
    view.zoom = Math.min(MAX_ZOOM, Math.max(1, zoom));
    view.targetY = anchor + oy * worldPerPx();
    clampTarget();
  }

  const offsetY = clientY => {
    const r = canvas.getBoundingClientRect();
    return clientY - (r.top + r.height / 2);
  };

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, y: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    anim = null;
    spin = 0;
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp, moved: false, mouse: e.pointerType === 'mouse' };
      if (drag.mouse) canvas.setPointerCapture(e.pointerId);
    } else if (pointers.size === 2) {
      drag = null;
      pinch = { ...pinchInfo(), zoom: view.zoom, targetY: view.targetY };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const now = pinchInfo();
      view.zoom = pinch.zoom;
      view.targetY = pinch.targetY + (now.y - pinch.y) * worldPerPx();
      zoomAt(pinch.zoom * (now.dist / pinch.dist), offsetY(now.y));
      requestRender();
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const dt = Math.max(1, e.timeStamp - drag.t);
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      view.yaw += dx * 0.011;
      if (drag.mouse) view.pitch = Math.min(0.5, Math.max(-0.12, view.pitch + dy * 0.005));
      spin = spin * 0.6 + ((dx * 0.011) / dt) * 0.4;
      Object.assign(drag, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      requestRender();
    }
  });

  const release = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) { spin = 0; return; }
    const tapped = !drag.moved && e.type === 'pointerup';
    if (e.timeStamp - drag.t > 80) spin = 0;
    drag = null;
    if (tapped) {
      spin = 0;
      if (e.timeStamp - lastTap < 300) { lastTap = 0; animateTo({ ...HOME }); return; }
      lastTap = e.timeStamp;
      pick(e);
    }
    requestRender();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    anim = null;
    zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0015), offsetY(e.clientY));
    requestRender();
  }, { passive: false });

  const raycaster = new THREE.Raycaster();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(figure, true)[0];
    if (!hit) return;
    let slot = hit.object.userData.slot;
    if (!slot) {
      const rel = (FLOOR - hit.point.y / UNIT) / STAGE_H;
      slot = rel < 0.47 ? 'top' : rel < 0.83 ? 'bottom' : 'shoes';
    }
    opts.onPick?.(slot);
  }

  return {
    show(host, items, o) {
      opts = o;
      if (canvas.parentElement !== host) host.appendChild(canvas);
      observer.disconnect();
      observer.observe(host);
      resize();
      if (firstShow) {
        firstShow = false;
        Object.assign(view, HOME, { yaw: HOME.yaw - 1.2 });
        animateTo({ ...HOME }, 1100);
      }
      setItems(items).catch(e => console.warn(e));
      if (clothes.children.length || !items.some(i => imageUrl(i))) opts.onReady?.();
      requestRender();
    },
    spin360() {
      animateTo({ yaw: view.yaw + Math.PI * 2 }, 2600);
    },
  };
}

/* ---------- Clothing textures ---------- */

const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

function averageColor(img) {
  const c = makeCanvas(24, 24).getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0, 24, 24);
  const d = c.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < d.length; i += 4) {
    const w = d[i + 3];
    r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; a += w;
  }
  return a ? `rgb(${r / a | 0},${g / a | 0},${b / a | 0})` : '#888';
}

// Colour stays fully opaque (edges bled outward) and the outline lives in separate alpha
// maps; transparent pixels would otherwise leave a dark fringe around the clothes.
async function makeTextures(url, anisotropy) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const P = 6, W = w + 2 * P, H = h + 2 * P;

  const color = makeCanvas(W, H);
  const c = color.getContext('2d');
  c.fillStyle = averageColor(img);
  c.fillRect(0, 0, W, H);
  for (const r of [40, 24, 14, 8, 4, 2]) {
    for (let k = 0; k < 8; k++) c.drawImage(img, P + r * Math.cos((k * Math.PI) / 4), P + r * Math.sin((k * Math.PI) / 4), w, h);
  }
  c.drawImage(img, P, P, w, h);

  // Back and sides: the same fabric smeared sideways, which wipes out front-only details
  // (buttons, zips, lapels, pockets) while keeping colour and horizontal patterns.
  const backColor = makeCanvas(W, H);
  const b2 = backColor.getContext('2d');
  const reach = Math.max(6, Math.round(w * 0.1));
  b2.drawImage(color, 0, 0);
  for (let i = 1; i <= 16; i++) {
    b2.globalAlpha = 1 / (i + 1);
    b2.drawImage(color, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (reach / 8), 0);
  }

  const silhouette = makeCanvas(W, H);
  const sc = silhouette.getContext('2d');
  sc.drawImage(img, P, P, w, h);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = '#fff';
  sc.fillRect(0, 0, W, H);

  const front = makeCanvas(W, H);
  const fc = front.getContext('2d', { willReadFrequently: true });
  fc.fillStyle = '#000';
  fc.fillRect(0, 0, W, H);
  // Grown a few px: loose 3D clothes need a little more fabric than the flat photo shows.
  for (const r of [2, 4]) {
    for (let k = 0; k < 8; k++) fc.drawImage(silhouette, r * Math.cos((k * Math.PI) / 4), r * Math.sin((k * Math.PI) / 4));
  }
  fc.drawImage(silhouette, 0, 0);
  const fd = fc.getImageData(0, 0, W, H).data;
  const frontA = new Uint8Array(W * H);
  for (let i = 0; i < frontA.length; i++) frontA[i] = fd[i * 4];

  // The back has no photo of its own: reuse the front, but close neck holes and front
  // openings by filling each row between its outermost fabric pixels.
  const backA = new Uint8Array(frontA);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (frontA[row + x] > 127) { if (l < 0) l = x; r = x; }
    if (l >= 0) backA.fill(255, row + l, row + r + 1);
  }
  const back = makeCanvas(W, H);
  const bc = back.getContext('2d');
  const bd = bc.createImageData(W, H);
  for (let i = 0; i < backA.length; i++) bd.data.set([backA[i], backA[i], backA[i], 255], i * 4);
  bc.putImageData(bd, 0, 0);

  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };
  return {
    w, h, P, W, H, frontA, backA,
    map: tex(color, true), backMap: tex(backColor, true), frontMask: tex(front), backMask: tex(back),
  };
}

/* ---------- Clothing shells ---------- */

function buildGarment(shells, tex, fit, wrinkles) {
  const boxW = (fit.w / 100) * STAGE_W;
  const k = boxW / tex.w; // stage px per texture px
  const left = (fit.x / 100) * STAGE_W - boxW / 2 - tex.P * k;
  const top = (fit.y / 100) * STAGE_H - tex.P * k;
  const spanW = tex.W * k, spanH = tex.H * k;
  const alphaAt = (mask, px, py) => {
    const tx = Math.floor((px - left) / k), ty = Math.floor((py - top) / k);
    return tx < 0 || ty < 0 || tx >= tex.W || ty >= tex.H ? 0 : mask[ty * tex.W + tx];
  };

  const pos = [], nor = [], uv = [], front = [], back = [];
  for (const p of shells) {
    const P = p.geometry.attributes.position.array;
    const N = p.geometry.attributes.normal.array;
    const Q = p.geometry.attributes.proj.array;
    const I = p.geometry.index.array;
    const remap = new Int32Array(P.length / 3).fill(-1);
    const add = i => {
      if (remap[i] < 0) {
        remap[i] = pos.length / 3;
        pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        uv.push((Q[i * 2] - left) / spanW, 1 - (Q[i * 2 + 1] - top) / spanH);
      }
      return remap[i];
    };
    // Shoes keep their end caps so the toes are closed.
    const count = p.name.startsWith('foot') ? I.length : p.sideCount;
    for (let t = 0; t < count; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      // Only clearly front-facing fabric keeps the photo's openings (necklines, jacket
      // fronts); shoulder tops, sides and the back use the filled-in outline.
      const isBack = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2] < 0.75;
      const mask = isBack ? tex.backA : tex.frontA;
      const covered = Math.max(alphaAt(mask, Q[a * 2], Q[a * 2 + 1]), alphaAt(mask, Q[b * 2], Q[b * 2 + 1]), alphaAt(mask, Q[c * 2], Q[c * 2 + 1]));
      if (covered < 80) continue;
      (isBack ? back : front).push(add(a), add(b), add(c));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex([...front, ...back]);
  geometry.addGroup(0, front.length, 0);
  geometry.addGroup(front.length, back.length, 1);
  geometry.computeBoundingSphere();

  const normalMap = wrinkles.clone();
  normalMap.repeat.set(spanW / 220, spanH / 220);
  const material = (map, alphaMap) => new THREE.MeshPhysicalMaterial({
    map, alphaMap, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide,
    roughness: 0.9, sheen: 0.25, sheenRoughness: 0.8, sheenColor: 0xffffff,
    normalMap, normalScale: new THREE.Vector2(0.12, 0.12),
  });
  const mesh = new THREE.Mesh(geometry, [material(tex.map, tex.frontMask), material(tex.backMap, tex.backMask)]);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Tileable normal map of soft creases, so fabric doesn't look like smooth plastic.
function wrinkleTexture() {
  const S = 128;
  const height = (x, y) => {
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    return 0.5 * Math.sin(u + 1.7 * Math.sin(v * 2 + u)) + 0.35 * Math.sin(v * 3 + 1.3 * Math.sin(u * 2 - v))
      + 0.15 * Math.sin(u * 4 + v * 5 + Math.sin(v * 3));
  };
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * 3;
      const dy = (height(x, y + 1) - height(x, y - 1)) * 3;
      const l = Math.hypot(dx, dy, 1);
      img.data.set([(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * S + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function contactShadow() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,32,24,0.42)');
  grad.addColorStop(0.55, 'rgba(40,32,24,0.16)');
  grad.addColorStop(1, 'rgba(40,32,24,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.scale.set(3.4, 2.4, 1);
  plane.position.set(0, 0.003, 0.25);
  return plane;
}
