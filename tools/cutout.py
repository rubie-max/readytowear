"""Turn a clothing photo on a plain light background into a transparent, tightly cropped PNG.

Usage: python tools/cutout.py input.jpg [more.jpg ...] [--out folder] [--tolerance 28]
Only background connected to the image edges is removed, so white details inside the garment survive.
"""
import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def cutout(path: Path, out_dir: Path, tolerance: int) -> Path:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3),
                              a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    close = np.abs(a - bg).max(axis=2) <= tolerance

    background = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not background[y, x]:
                background[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not background[y, x]:
                background[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not background[ny, nx]:
                background[ny, nx] = True
                queue.append((ny, nx))

    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.copy()
    rgba.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 16 else 0).getbbox()
    if box:
        rgba = rgba.crop(box)

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{path.stem}.png"
    rgba.save(out, optimize=True)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("images", nargs="+", type=Path)
    p.add_argument("--out", type=Path, default=Path("cutouts"))
    p.add_argument("--tolerance", type=int, default=28)
    args = p.parse_args()
    for img in args.images:
        print(cutout(img, args.out, args.tolerance))


if __name__ == "__main__":
    main()
