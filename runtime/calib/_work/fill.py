"""Flood-fill the sedan silhouette from a seed inside the car; report px bbox.

Threshold is loose enough to include the shadowed rear bumper but tight enough to
stay off asphalt, so the fill cannot leak into lane markings (they are not
4-connected to the car body).
"""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
sx0, sy0, sx1, sy1 = (int(v) for v in sys.argv[4:8])
THR = int(sys.argv[8]) if len(sys.argv) > 8 else 102

a_cache = {}


def arr(n):
    if n not in a_cache:
        a_cache[n] = np.asarray(Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB"))
    return a_cache[n]


def mask_of(n):
    a = arr(n)
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    m = (lum >= THR) & (sat <= 75)
    m[:270, :] = False
    return m


seed = ((sx0 + sx1) // 2, (sy0 + sy1) // 2)
for n in range(first, last + 1):
    m = mask_of(n)
    t = (n - 1) * 0.25
    # nudge the seed onto a mask pixel nearest the previous centre
    best = None
    for rad in range(0, 40):
        found = False
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                if max(abs(dy), abs(dx)) != rad:
                    continue
                y, x = seed[1] + dy, seed[0] + dx
                if 0 <= y < H and 0 <= x < W and m[y, x]:
                    best = (y, x)
                    found = True
                    break
            if found:
                break
        if found:
            break
    if best is None:
        print("t=%.2f  NO SEED" % t)
        continue
    sy, sx = best
    seen = np.zeros((H, W), bool)
    stack = [(sy, sx)]
    seen[sy, sx] = True
    ys, xs = [], []
    while stack:
        y, x = stack.pop()
        ys.append(y)
        xs.append(x)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    print("t=%.2f  box=(%d,%d,%d,%d) w=%d h=%d area=%d seed=(%d,%d)"
          % (t, x0, y0, x1, y1, x1 - x0, y1 - y0, len(ys), sx, sy))
    seed = ((x0 + x1) // 2, (y0 + y1) // 2)
