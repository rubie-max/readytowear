"""Draws sample clothes that line up with assets/mannequin.jpg and writes a seed data.json.

    python tools/make_test_clothes.py [out_dir]

Each garment is drawn on the full 720x1280 mannequin canvas, then cropped; the crop
position becomes the item's `fit`, so it lands exactly on the body in the app.
"""
import json
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, S = 720, 1280, 2
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'seed')
rng = np.random.default_rng(7)


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def mirror(pts):
    return [(W - x, y) for x, y in reversed(pts)]


def sym(left):
    """Left half outline running from top-center to bottom-center -> full outline."""
    return left + mirror(left)[1:-1]


def mx(pts):
    return [(W - x, y) for x, y in pts]


def sc(pts):
    return [(x * S, y * S) for x, y in pts]


# ---------- fabrics ----------

def fabric(kind, size, base, **o):
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    b = np.array(base, np.float32)
    img = np.ones((h, w, 3), np.float32) * b
    if kind == 'heather':
        n = rng.normal(0, 14, (h // 2 + 1, w // 2 + 1)).astype(np.float32)
        n = np.kron(n, np.ones((2, 2), np.float32))[:h, :w]
        img += n[..., None]
    elif kind == 'denim':
        twill = ((xx + yy) % 6 < 2).astype(np.float32) * 14 - 5
        n = rng.normal(0, 9, (h, w)).astype(np.float32)
        img += (twill + n)[..., None]
        img[..., 2] += 4
    elif kind == 'check':
        p = o.get('period', 44) * S
        c2 = np.array(o['c2'], np.float32)
        c3 = np.array(o['c3'], np.float32)
        bx = (xx % p) < p * 0.45
        by = (yy % p) < p * 0.45
        img = np.where((bx & by)[..., None], c2 * 0.85 + b * 0.15, img)
        img = np.where((bx ^ by)[..., None], (b + c2) / 2, img)
        thin = ((xx % p) > p * 0.72) & ((xx % p) < p * 0.76) | ((yy % p) > p * 0.72) & ((yy % p) < p * 0.76)
        img = np.where(thin[..., None], c3, img)
        img += rng.normal(0, 5, (h, w, 1)).astype(np.float32)
    elif kind == 'hstripe':
        p = o.get('period', 22) * S
        img = np.where(((yy % p) < p * o.get('ratio', 0.4))[..., None], np.array(o['c2'], np.float32), img)
        img += rng.normal(0, 3, (h, w, 1)).astype(np.float32)
    elif kind == 'vstripe':
        p = o.get('period', 9) * S
        img = np.where(((xx % p) < p * o.get('ratio', 0.3))[..., None], np.array(o['c2'], np.float32), img)
        img += rng.normal(0, 3, (h, w, 1)).astype(np.float32)
    else:
        img += rng.normal(0, o.get('grain', 4), (h, w, 1)).astype(np.float32)
    return img


# ---------- garment canvas ----------

class Garment:
    def __init__(self, base, kind='solid', **fabric_opts):
        self.base = rgb(base) if isinstance(base, str) else base
        self.kind = kind
        self.fabric_opts = fabric_opts
        self.mask = Image.new('L', (W * S, H * S), 0)
        self.folds = Image.new('L', (W * S, H * S), 0)
        self.details = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
        self.m = ImageDraw.Draw(self.mask)
        self.f = ImageDraw.Draw(self.folds)
        self.d = ImageDraw.Draw(self.details)
        self.parts = []  # extra flat-colored parts drawn over the fabric: (pts, color)

    def body(self, pts):
        self.m.polygon(sc(pts), fill=255)

    def hole(self, pts):
        self.m.polygon(sc(pts), fill=0)

    def part(self, pts, color, outline=None, add_mask=True):
        if add_mask:
            self.m.polygon(sc(pts), fill=255)
        self.d.polygon(sc(pts), fill=color + (255,))
        if outline:
            self.line(pts + [pts[0]], outline, 1.4)

    def line(self, pts, color, width=1.5, alpha=255):
        self.d.line(sc(pts), fill=color + (alpha,), width=max(1, int(width * S)), joint='curve')

    def stitch(self, pts, color, width=1.0, alpha=200):
        """Dashed topstitch line."""
        seg = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(1, int(np.hypot(x1 - x0, y1 - y0) / 3))
            for i in range(n):
                if i % 2 == 0:
                    t0, t1 = i / n, (i + 1) / n
                    seg.append([(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0), (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)])
        for s in seg:
            self.line(s, color, width, alpha)

    def dot(self, x, y, r, color, ring=None):
        self.d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=color + (255,),
                       outline=(ring + (255,)) if ring else None, width=S)

    def fold(self, pts, width=6, strength=120):
        self.f.line(sc(pts), fill=strength, width=int(width * S), joint='curve')

    def render(self, path):
        bbox = self.mask.getbbox()
        x0, y0, x1, y1 = bbox
        size = (x1 - x0, y1 - y0)
        mask = self.mask.crop(bbox)
        img = fabric(self.kind, size, self.base, **self.fabric_opts)

        # Soft edge darkening gives the flat shape some volume.
        edge = np.asarray(mask.filter(ImageFilter.GaussianBlur(16 * S)), np.float32) / 255
        light = 0.74 + 0.26 * np.clip(edge * 1.6, 0, 1)
        yy = np.linspace(0, 1, size[1], dtype=np.float32)[:, None]
        light *= 1.03 - 0.07 * yy
        folds = np.asarray(self.folds.crop(bbox).filter(ImageFilter.GaussianBlur(5 * S)), np.float32) / 255
        light *= 1 - 0.32 * folds
        img *= light[..., None]

        out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
        det = self.details.crop(bbox)
        # Details get the same lighting so they don't look pasted on.
        det_arr = np.asarray(det, np.float32)
        det_arr[..., :3] *= light[..., None]
        det = Image.fromarray(np.clip(det_arr, 0, 255).astype(np.uint8), 'RGBA')
        out = Image.alpha_composite(out, det)
        out.putalpha(mask)

        full = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
        full.paste(out, bbox[:2])
        full = full.resize((W, H), Image.LANCZOS)
        a = np.asarray(full)[..., 3]
        ys, xs = np.where(a > 6)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crop = full.crop((bx0, by0, bx1, by1))
        crop.save(path, optimize=True)
        return {
            'x': round(float(bx0 + bx1) / 2 / W * 100, 2),
            'y': round(float(by0) / H * 100, 2),
            'w': round(float(bx1 - bx0) / W * 100, 2),
        }


# ---------- tops ----------

TEE = [(360, 248), (334, 250), (296, 254), (252, 269), (222, 285), (203, 326), (192, 404), (264, 418),
       (274, 372), (270, 480), (262, 600), (260, 654), (310, 658), (360, 660)]
TEE_NECK = [(334, 253), (340, 268), (350, 278), (360, 281), (370, 278), (380, 268), (386, 253), (360, 249)]
TEE_RIB = [(331, 251), (339, 270), (350, 281), (360, 284), (370, 281), (381, 270), (389, 251)]


def tshirt(base, kind='solid', **o):
    g = Garment(base, kind, **o)
    c = g.base
    g.body(sym(TEE))
    g.hole(TEE_NECK)
    dark = shade(c, 0.78) if sum(c) > 150 else shade(mix(c, (255, 255, 255), 0.12), 1)
    g.line(TEE_RIB, dark, 3.2)
    for side in (lambda p: p, mx):
        g.stitch(side([(195, 393), (266, 407)]), dark, 0.9)
        g.fold(side([(276, 384), (296, 440)]), 5, 90)
        g.fold(side([(214, 330), (236, 380)]), 4, 60)
        g.fold(side([(282, 560), (318, 596)]), 5, 70)
    g.stitch([(262, 645), (310, 649), (360, 650), (410, 649), (458, 645)], dark, 0.9)
    return g


SHIRT = [(360, 246), (336, 248), (298, 253), (250, 268), (220, 284), (204, 330), (200, 420), (197, 520),
         (193, 622), (238, 630), (247, 520), (256, 432), (272, 374), (268, 480), (261, 600), (259, 652),
         (290, 664), (325, 672), (360, 676)]
COLLAR = [(333, 243), (325, 256), (323, 271), (338, 303), (360, 288), (354, 273), (348, 259), (347, 248)]
SHIRT_NECK = [(347, 248), (348, 258), (354, 272), (360, 286), (366, 272), (372, 258), (373, 248), (360, 246)]


def shirt(base, kind='solid', **o):
    g = Garment(base, kind, **o)
    c = g.base
    dark = shade(c, 0.72) if sum(c) > 150 else shade(mix(c, (255, 255, 255), 0.2), 1)
    g.body(sym(SHIRT))
    g.hole(SHIRT_NECK)
    for side in (lambda p: p, mx):
        g.body(side(COLLAR))
        g.line(side(COLLAR) + [side(COLLAR)[0]], dark, 1.3)
        g.line(side([(228, 300), (242, 342), (264, 378)]), dark, 0.9, 150)
        g.line(side([(195, 596), (242, 604)]), dark, 1.1)
        g.fold(side([(276, 386), (300, 444)]), 5, 90)
        g.fold(side([(202, 470), (244, 484)]), 4, 80)
        g.fold(side([(200, 540), (244, 556)]), 4, 60)
        g.fold(side([(284, 580), (316, 620)]), 5, 70)
    g.line([(353, 290), (353, 674)], dark, 0.9, 170)
    g.line([(367, 290), (367, 674)], dark, 0.9, 170)
    btn = mix(c, (255, 255, 255), 0.35) if sum(c) < 400 else shade(c, 0.9)
    for y in (312, 364, 416, 468, 520, 572, 624):
        g.dot(360, y, 3.3, btn, dark)
    g.line([(296, 336), (334, 336), (334, 376), (315, 384), (296, 376), (296, 336)], dark, 1.0, 190)
    return g


# ---------- outerwear ----------

def sleeves_closed(hem, side_x=256):
    return [(360, 244), (338, 246), (298, 251), (248, 265), (216, 281), (199, 328), (194, 430), (190, 528),
            (186, 634), (242, 642), (249, 530), (255, 434), (266, 378), (262, 480), (side_x, 600), (side_x - 2, hem),
            (360, hem + 4)]


def denim_jacket():
    c = rgb('#5a7fad')
    g = Garment(c, 'denim')
    hem = 640
    g.body(sym(sleeves_closed(hem)))
    g.hole([(342, 250), (346, 262), (360, 272), (374, 262), (378, 250), (360, 246)])
    st = (196, 140, 72)
    dark = shade(c, 0.7)
    for side in (lambda p: p, mx):
        g.part(side([(330, 244), (318, 256), (316, 270), (334, 300), (360, 276), (346, 262), (342, 250)]), shade(c, 0.9), dark)
        g.line(side([(186, 606), (244, 614)]), dark, 1.2)
        g.stitch(side([(186, 610), (244, 618)]), st, 0.9)
        g.part(side([(290, 330), (336, 330), (336, 352), (313, 362), (290, 352)]), shade(c, 0.94), dark)
        g.stitch(side([(292, 334), (334, 334)]), st, 0.8)
        g.dot(*side([(313, 350)])[0], 2.6, (200, 170, 120), (120, 90, 50))
        g.stitch(side([(290, 368), (300, 470), (304, 610)]), st, 0.8)
        g.fold(side([(270, 390), (292, 446)]), 5, 90)
        g.fold(side([(196, 470), (246, 486)]), 4, 80)
    g.line([(256, 612), (464, 612)], dark, 1.2)
    g.stitch([(256, 616), (464, 616)], st, 0.9)
    g.line([(364, 272), (364, hem + 2)], dark, 1.2)
    g.stitch([(370, 276), (370, hem)], st, 0.8)
    for y in (300, 360, 420, 480, 540, 625):
        g.dot(364, y, 3.2, (200, 170, 120), (120, 90, 50))
    return g


def bomber():
    c = rgb('#222326')
    g = Garment(c, 'solid', grain=3)
    hem = 626
    left = sleeves_closed(hem, 262)
    left[-3] = (262, 590)
    left[-2] = (270, hem)
    g.body(sym(left))
    g.hole([(340, 250), (346, 264), (360, 270), (374, 264), (380, 250), (360, 246)])
    rib = (52, 54, 58)
    hi = (70, 72, 78)
    g.part([(332, 242), (340, 262), (360, 270), (380, 262), (388, 242), (380, 252), (360, 258), (340, 252)], rib)
    for y in range(600, hem + 2, 4):
        g.line([(266, y), (454, y)], rib, 1.2)
    for side in (lambda p: p, mx):
        g.part(side([(186, 612), (243, 620), (242, 642), (186, 634)]), rib)
        g.line(side([(250, 282), (226, 300), (250, 360), (270, 378)]), hi, 1.0, 120)
        g.fold(side([(270, 390), (292, 446)]), 6, 110)
        g.fold(side([(196, 470), (246, 486)]), 5, 110)
        g.fold(side([(194, 540), (244, 560)]), 5, 90)
    g.line([(360, 268), (360, 600)], (120, 120, 126), 1.6)
    g.dot(360, 278, 2.6, (150, 150, 156))
    g.line([(208, 360), (234, 362)], (120, 120, 126), 1.4)
    return g


def hoodie():
    c = rgb('#8e9095')
    g = Garment(c, 'heather')
    hem = 668
    g.body(sym(sleeves_closed(hem)))
    dark = shade(c, 0.72)
    hood = [(318, 252), (326, 234), (344, 224), (360, 222), (376, 224), (394, 234), (402, 252), (392, 268),
            (372, 282), (360, 284), (348, 282), (328, 268)]
    g.part(hood, shade(c, 0.92), dark)
    g.part([(338, 240), (360, 234), (382, 240), (378, 262), (360, 274), (342, 262)], shade(c, 0.5))
    g.hole([(344, 244), (360, 240), (376, 244), (373, 260), (360, 268), (347, 260)])
    for x0, x1 in ((350, 347), (370, 373)):
        g.line([(x0, 280), (x1, 352)], (235, 235, 235), 2.0)
        g.part([(x1 - 2, 350), (x1 + 2, 350), (x1 + 2, 362), (x1 - 2, 362)], (200, 200, 200), add_mask=False)
    g.line([(300, 520), (420, 520), (444, 616), (276, 616), (300, 520)], dark, 1.3)
    for y in range(hem - 22, hem + 3, 4):
        g.line([(256, y), (464, y)], shade(c, 0.86), 1.1)
    for side in (lambda p: p, mx):
        for y in range(610, 640, 4):
            g.line(side([(187, y), (243, y + 8)]), shade(c, 0.86), 1.1)
        g.fold(side([(270, 390), (292, 446)]), 6, 100)
        g.fold(side([(196, 470), (246, 486)]), 5, 100)
        g.fold(side([(194, 540), (244, 560)]), 5, 80)
    return g


def open_jacket(base, hem, kind='solid', **o):
    g = Garment(base, kind, **o)
    left = [(342, 246), (298, 251), (248, 265), (216, 281), (199, 328), (194, 430), (190, 528), (186, 634),
            (242, 642), (249, 530), (255, 434), (266, 378), (262, 480), (256, 600), (252, hem), (354, hem + 4),
            (354, 420), (348, 320)]
    g.body(left)
    g.body(mirror(left))
    return g


def blazer():
    c = rgb('#1f2b45')
    g = open_jacket(c, 690, 'solid', grain=3)
    lapel = shade(c, 0.85)
    edge = mix(c, (255, 255, 255), 0.18)
    for side in (lambda p: p, mx):
        g.part(side([(342, 246), (328, 250), (318, 262), (326, 284), (318, 300), (352, 420), (354, 420), (348, 320)]), lapel, edge)
        g.line(side([(270, 600), (318, 598)]), edge, 1.2)
        g.line(side([(186, 610), (243, 618)]), edge, 0.9, 140)
        g.fold(side([(270, 390), (292, 446)]), 6, 100)
        g.fold(side([(196, 470), (246, 486)]), 5, 100)
    g.line([(296, 384), (330, 380)], edge, 1.4)
    for y in (560, 616):
        g.dot(349, y, 3.6, (40, 46, 60), edge)
    return g


def field_jacket():
    c = rgb('#6b6a45')
    g = Garment(c, 'solid', grain=5)
    hem = 676
    g.body(sym(sleeves_closed(hem)))
    g.hole([(342, 250), (346, 262), (360, 272), (374, 262), (378, 250), (360, 246)])
    dark = shade(c, 0.7)
    for side in (lambda p: p, mx):
        g.part(side([(328, 242), (316, 256), (314, 272), (334, 300), (360, 276), (346, 262), (342, 250)]), shade(c, 0.92), dark)
        g.line(side([(290, 330), (336, 330), (336, 386), (290, 386), (290, 330)]), dark, 1.0)
        g.part(side([(288, 324), (338, 324), (338, 344), (288, 344)]), shade(c, 0.95), dark)
        g.line(side([(276, 520), (338, 520), (338, 600), (276, 600), (276, 520)]), dark, 1.0)
        g.part(side([(274, 514), (340, 514), (340, 536), (274, 536)]), shade(c, 0.95), dark)
        g.line(side([(186, 612), (243, 620)]), dark, 1.0)
        g.fold(side([(270, 390), (292, 446)]), 6, 100)
        g.fold(side([(196, 470), (246, 486)]), 5, 100)
    g.line([(352, 274), (352, hem + 2)], dark, 1.0)
    g.line([(368, 274), (368, hem + 2)], dark, 1.0)
    for y in (300, 370, 440, 510, 580, 650):
        g.dot(360, y, 3.0, shade(c, 0.6))
    return g


# ---------- bottoms ----------

PANTS = [(360, 546), (272, 546), (265, 590), (253, 650), (254, 720), (260, 820), (264, 940), (266, 1090),
         (324, 1094), (330, 960), (338, 840), (350, 722), (360, 688)]


def pants(base, kind='solid', style='chino', **o):
    g = Garment(base, kind, **o)
    c = g.base
    left = list(PANTS)
    if style == 'jogger':
        left[6:9] = [(264, 940), (268, 1058), (272, 1092), (318, 1094)]
        left[9] = (322, 1060)
    g.body(sym(left))
    dark = shade(c, 0.7) if sum(c) > 150 else shade(mix(c, (255, 255, 255), 0.18), 1)
    st = (196, 140, 72) if style == 'jeans' else dark
    if style == 'jogger':
        for y in range(552, 572, 4):
            g.line([(270, y), (450, y)], shade(c, 0.85), 1.1)
        g.line([(354, 572), (350, 620)], (230, 230, 225), 1.8)
        g.line([(366, 572), (370, 620)], (230, 230, 225), 1.8)
        for side in (lambda p: p, mx):
            for y in range(1066, 1094, 4):
                g.line(side([(268, y), (320, y)]), shade(c, 0.85), 1.1)
            g.line(side([(274, 600), (300, 640)]), dark, 1.0)
            g.part(side([(256, 780), (300, 780), (302, 850), (258, 850)]), shade(c, 0.95), dark)
    else:
        g.line([(270, 566), (450, 566)], dark, 1.2)
        for x in (292, 334, 386, 428):
            g.line([(x, 546), (x, 568)], dark, 3.0)
        g.stitch([(368, 568), (368, 636), (360, 652)], st, 1.0)
        for side in (lambda p: p, mx):
            g.stitch(side([(276, 570), (302, 624)]), st, 1.0) if style == 'jeans' else g.line(side([(276, 570), (302, 624)]), dark, 1.1)
        if style == 'jeans':
            g.stitch([(270, 562), (450, 562)], st, 0.9)
            g.stitch([(404, 572), (424, 572), (426, 592), (406, 594)], st, 0.8)
            for p in ((276, 572), (444, 572)):
                g.dot(*p, 2.0, (190, 160, 110))
            g.dot(360, 556, 3.2, (190, 170, 130), (120, 100, 70))
            for side in (lambda p: p, mx):
                g.stitch(side([(256, 660), (260, 820), (266, 1086)]), st, 0.8, 120)
        if style == 'trouser':
            for side in (lambda p: p, mx):
                g.line(side([(298, 600), (296, 1092)]), shade(c, 0.86), 1.2, 200)
    for side in (lambda p: p, mx):
        g.fold(side([(340, 690), (322, 722)]), 6, 110)
        g.fold(side([(268, 860), (322, 872)]), 5, 70)
        g.fold(side([(270, 1020), (322, 1036)]), 5, 70)
    return g


# ---------- shoes ----------

FEET = (291, 431)


def shoes(base, style='sneaker', sole='#f2f1ec', accent=None):
    c = rgb(base)
    g = Garment(c, 'solid', grain=3)
    sole_c = rgb(sole)
    dark = shade(c, 0.6) if sum(c) > 150 else mix(c, (255, 255, 255), 0.25)
    for cx in FEET:
        if style == 'boot':
            pts = [(cx - 24, 1034), (cx + 24, 1034), (cx + 25, 1100), (cx + 33, 1150), (cx + 37, 1188),
                   (cx - 37, 1188), (cx - 33, 1150), (cx - 25, 1100)]
        elif style == 'oxford':
            pts = [(cx - 18, 1104), (cx + 18, 1104), (cx + 26, 1132), (cx + 33, 1166), (cx + 35, 1190),
                   (cx - 35, 1190), (cx - 33, 1166), (cx - 26, 1132)]
        else:
            pts = [(cx - 19, 1096), (cx + 19, 1096), (cx + 26, 1124), (cx + 34, 1160), (cx + 37, 1188),
                   (cx - 37, 1188), (cx - 34, 1160), (cx - 26, 1124)]
        g.body(pts)
        sole_pts = [(cx - 38, 1186), (cx + 38, 1186), (cx + 37, 1200), (cx + 33, 1205), (cx - 33, 1205), (cx - 37, 1200)]
        if style in ('oxford', 'boot'):
            sole_pts = [(x, y - 2 if y > 1190 else y) for x, y in sole_pts]
        g.part(sole_pts, sole_c, shade(sole_c, 0.75))
        if style in ('sneaker', 'runner', 'canvas'):
            g.part([(cx - 30, 1166), (cx + 30, 1166), (cx + 35, 1186), (cx - 35, 1186)],
                   rgb(accent) if accent and style == 'canvas' else shade(c, 0.95), dark)
            g.part([(cx - 13, 1098), (cx + 13, 1098), (cx + 14, 1112), (cx - 14, 1112)], shade(c, 0.9))
            for i, y in enumerate(range(1114, 1156, 8)):
                half = 12 + i * 2.5
                g.line([(cx - half, y), (cx + half, y)], (245, 245, 242) if sum(c) < 300 else shade(c, 0.7), 2.0)
            if style == 'runner' and accent:
                a = rgb(accent)
                g.line([(cx - 30, 1150), (cx - 6, 1170), (cx + 10, 1160)], a, 3.0)
        elif style == 'oxford':
            g.line([(cx - 20, 1128), (cx, 1120), (cx + 20, 1128)], dark, 1.2)
            g.line([(cx - 6, 1110), (cx - 6, 1126)], dark, 1.0)
            g.line([(cx + 6, 1110), (cx + 6, 1126)], dark, 1.0)
            g.part([(cx - 8, 1160), (cx + 8, 1160), (cx + 6, 1176), (cx - 6, 1176)], mix(c, (255, 255, 255), 0.18), add_mask=False)
        elif style == 'boot':
            g.part([(cx - 24, 1052), (cx - 14, 1052), (cx - 14, 1120), (cx - 24, 1110)], shade(c, 0.6), add_mask=False)
            g.part([(cx - 8, 1158), (cx + 8, 1158), (cx + 6, 1176), (cx - 6, 1176)], mix(c, (255, 255, 255), 0.15), add_mask=False)
    return g


# ---------- catalogue ----------

def item(name, cat, color, maker, status='clean', ironing=False, wbw=1, notes=''):
    return dict(name=name, category=cat, color=color, maker=maker, status=status,
                needsIroning=ironing, wearsBeforeWash=wbw, notes=notes)


CATALOGUE = [
    item('White Oxford Shirt', 'top', '#f2f1ec', lambda: shirt('#f2f1ec', grain=5), ironing=True, wbw=2),
    item('Sky Blue Oxford Shirt', 'top', '#a9c6e4', lambda: shirt('#a9c6e4', grain=5), 'ironing', True, 2),
    item('Navy Check Flannel', 'top', '#23344f',
         lambda: shirt('#23344f', 'check', c2=(47, 90, 70), c3=(150, 54, 54), period=40), ironing=False, wbw=3),
    item('Black Dress Shirt', 'top', '#1e1e21', lambda: shirt('#1e1e21', grain=3), 'drycleaner', True, 1),
    item('Olive Linen Shirt', 'top', '#7b7d55', lambda: shirt('#7b7d55', 'heather'), ironing=True, wbw=2),
    item('Blue Striped Shirt', 'top', '#e9eef5',
         lambda: shirt('#eef2f7', 'vstripe', c2=(74, 111, 168), period=8, ratio=0.32), ironing=True, wbw=2),

    item('White Crew T-shirt', 'top', '#f5f5f2', lambda: tshirt('#f5f5f2')),
    item('Black Crew T-shirt', 'top', '#1c1c1e', lambda: tshirt('#1c1c1e', grain=3)),
    item('Heather Grey T-shirt', 'top', '#9a9b9d', lambda: tshirt('#9a9b9d', 'heather')),
    item('Navy T-shirt', 'top', '#1f2a44', lambda: tshirt('#1f2a44'), 'dirty'),
    item('Maroon T-shirt', 'top', '#6e2433', lambda: tshirt('#6e2433'), 'washing'),
    item('Breton Striped T-shirt', 'top', '#f1ede4',
         lambda: tshirt('#f1ede4', 'hstripe', c2=(31, 42, 68), period=22, ratio=0.38)),

    item('Beige Chinos', 'bottom', '#c8b48f', lambda: pants('#c8b48f'), ironing=True, wbw=4),
    item('Navy Chinos', 'bottom', '#283750', lambda: pants('#283750'), ironing=True, wbw=4),
    item('Blue Jeans', 'bottom', '#3e5f8a', lambda: pants('#3e5f8a', 'denim', 'jeans'), wbw=6),
    item('Black Jeans', 'bottom', '#26272b', lambda: pants('#26272b', 'denim', 'jeans'), 'drying', wbw=6),
    item('Grey Wool Trousers', 'bottom', '#6d6f73', lambda: pants('#6d6f73', 'heather', 'trouser'), ironing=True, wbw=4),
    item('Olive Joggers', 'bottom', '#5d6146', lambda: pants('#5d6146', 'solid', 'jogger'), 'repair', wbw=3,
         notes='Drawstring came loose'),

    item('Denim Jacket', 'outerwear', '#5a7fad', denim_jacket, wbw=15),
    item('Black Bomber Jacket', 'outerwear', '#222326', bomber, wbw=15),
    item('Grey Hoodie', 'outerwear', '#8e9095', hoodie, 'dirty', wbw=4),
    item('Navy Blazer', 'outerwear', '#1f2b45', blazer, wbw=20),
    item('Olive Field Jacket', 'outerwear', '#6b6a45', field_jacket, wbw=15),

    item('White Leather Sneakers', 'shoes', '#f3f2ee', lambda: shoes('#f3f2ee', 'sneaker'), wbw=60),
    item('Black Oxford Shoes', 'shoes', '#1a1a1b', lambda: shoes('#1a1a1b', 'oxford', '#2a2523'), wbw=60),
    item('Brown Chelsea Boots', 'shoes', '#6b4428', lambda: shoes('#6b4428', 'boot', '#2b211a'), wbw=60),
    item('Grey Running Shoes', 'shoes', '#8c9097', lambda: shoes('#8c9097', 'runner', '#f2f1ec', '#e2632d'), wbw=30),
    item('Navy Canvas Sneakers', 'shoes', '#2b3a5c', lambda: shoes('#2b3a5c', 'canvas', '#f2f1ec', '#f2f1ec'), 'away',
         wbw=30, notes='Left at the beach house'),
]

OUTFITS = [
    ('Office day', ['White Oxford Shirt', 'Grey Wool Trousers', 'Navy Blazer', 'Black Oxford Shoes']),
    ('Weekend classic', ['White Crew T-shirt', 'Blue Jeans', 'White Leather Sneakers']),
    ('Autumn walk', ['Navy Check Flannel', 'Beige Chinos', 'Olive Field Jacket', 'Brown Chelsea Boots']),
    ('Date night', ['Black Crew T-shirt', 'Black Jeans', 'Black Bomber Jacket', 'Brown Chelsea Boots']),
    ('Seaside', ['Breton Striped T-shirt', 'Navy Chinos', 'Navy Canvas Sneakers']),
    ('Summer linen', ['Olive Linen Shirt', 'Beige Chinos', 'White Leather Sneakers']),
    ('Gym run', ['Heather Grey T-shirt', 'Olive Joggers', 'Grey Hoodie', 'Grey Running Shoes']),
    ('Smart denim', ['Blue Striped Shirt', 'Blue Jeans', 'Denim Jacket', 'White Leather Sneakers']),
]
PLANS = [(1, 'Office day'), (2, 'Autumn walk'), (4, 'Weekend classic'), (6, 'Date night')]
HISTORY = [(-1, 'Weekend classic'), (-2, 'Office day'), (-4, 'Autumn walk'), (-6, 'Seaside'),
           (-8, 'Summer linen'), (-11, 'Smart denim'), (-13, 'Office day')]


def main():
    img_dir = OUT / 'images'
    img_dir.mkdir(parents=True, exist_ok=True)
    today = date.today()
    now = datetime.now(timezone.utc).replace(microsecond=0)
    by_name = {}
    items = []
    for i, spec in enumerate(CATALOGUE):
        iid = str(uuid.uuid4())
        path = f'images/{iid}.png'
        fit = spec['maker']().render(OUT / path)
        it = {
            'id': iid, 'name': spec['name'], 'category': spec['category'], 'color': spec['color'],
            'status': spec['status'], 'imagePath': path, 'fit': fit, 'needsIroning': spec['needsIroning'],
            'wearsBeforeWash': spec['wearsBeforeWash'], 'wearsSinceWash': 0, 'wearCount': 0, 'lastWorn': None,
            'notes': spec['notes'], 'createdAt': (now - timedelta(days=30, minutes=i)).isoformat(),
        }
        if it['status'] == 'dirty':
            it['wearsSinceWash'] = it['wearsBeforeWash']
        items.append(it)
        by_name[it['name']] = it
        print(f"{spec['name']:28s} {fit}")

    outfits = []
    by_outfit = {}
    for i, (name, names) in enumerate(OUTFITS):
        o = {'id': str(uuid.uuid4()), 'name': name, 'itemIds': [by_name[n]['id'] for n in names], 'notes': '',
             'wearCount': 0, 'lastWorn': None, 'createdAt': (now - timedelta(days=25, minutes=i)).isoformat()}
        outfits.append(o)
        by_outfit[name] = o

    logs = []
    for offset, name in sorted(HISTORY):
        day = (today + timedelta(days=offset)).isoformat()
        o = by_outfit[name]
        o['wearCount'] += 1
        o['lastWorn'] = max(o['lastWorn'] or day, day)
        for iid in o['itemIds']:
            it = next(x for x in items if x['id'] == iid)
            it['wearCount'] += 1
            it['lastWorn'] = max(it['lastWorn'] or day, day)
        logs.append({'id': str(uuid.uuid4()), 'day': day, 'outfitId': o['id'], 'outfitName': name,
                     'itemIds': list(o['itemIds']), 'createdAt': f'{day}T08:00:00+00:00'})
    logs.sort(key=lambda l: l['day'], reverse=True)

    plans = [{'day': (today + timedelta(days=d)).isoformat(), 'outfitId': by_outfit[n]['id']} for d, n in PLANS]

    data = {'version': 1, 'items': items, 'outfits': outfits, 'plans': plans, 'logs': logs}
    (OUT / 'data.json').write_text(json.dumps(data, indent=1), encoding='utf-8')
    print(f'{len(items)} items, {len(outfits)} outfits, {len(plans)} plans, {len(logs)} history entries -> {OUT}')


if __name__ == '__main__':
    main()
