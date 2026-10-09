"""Measure 目标 2 (the distant white sedan in the right carriageway).

Same edge rules as the primary car, with a lower white threshold because the
object is small and distant.
"""
import sys, os, json
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cx0, cy0, cx1, cy1 = (int(v) for v in sys.argv[4:8])
CORE, SOFT = 138, 88


def masks(n):
    a = np.asarray(Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB"))
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    soft = (lum >= SOFT) & (sat <= 80)
    core = (lum >= CORE) & (sat <= 50)
    soft[:200, :] = False
    core[:200, :] = False
    return core, soft


def largest_cc(mask, minpx=60):
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    best, best_n = None, 0
    for sy, sx in np.argwhere(mask):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        pix = []
        while stack:
            y, x = stack.pop()
            pix.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(pix) > best_n:
            best_n, best = len(pix), pix
    if best is None or best_n < minpx:
        return None
    ys = [p[0] for p in best]
    xs = [p[1] for p in best]
    return min(xs), min(ys), max(xs), max(ys), best_n


out = {}
prev = None
for n in range(first, last + 1):
    core, soft = masks(n)
    t = round((n - 1) * 0.25, 2)
    if prev is None:
        m = np.zeros((H, W), bool)
        m[cy0:cy1, cx0:cx1] = core[cy0:cy1, cx0:cx1]
    else:
        px0, py0, px1, py1 = prev
        m = np.zeros((H, W), bool)
        a0, a1 = max(0, px0 - 16), min(W, px1 + 16)
        b0, b1 = max(200, py0 - 12), min(H, py1 + 12)
        m[b0:b1, a0:a1] = core[b0:b1, a0:a1]
    cc = largest_cc(m)
    if cc is None:
        print("t=%.2f NONE" % t)
        continue
    kx0, ky0, kx1, ky1, _ = cc
    top = ky0
    bot = ky1
    for y in range(ky1, min(H, ky1 + 12)):
        if int(soft[y, kx0 - 4:kx1 + 5].sum()) >= 0.45 * (kx1 - kx0):
            bot = y
    colcount = soft[top:bot + 1, :].sum(axis=0)
    L, R = max(0, kx0 - 6), min(W - 1, kx1 + 6)
    needC = max(3, int(0.14 * (bot - top)))
    left = next(x for x in range(L, R + 1) if colcount[x] >= needC)
    right = next(x for x in range(R, L - 1, -1) if colcount[x] >= needC)
    bot = ky1
    for y in range(ky1, min(H, ky1 + 12)):
        if int(soft[y, left + 5:right - 4].sum()) >= 0.55 * (right - left - 9):
            bot = y
    out["%.2f" % t] = [int(left) - 1, int(top), int(right) + 1, int(bot) + 1]
    print("t=%.2f  box=(%d,%d,%d,%d) w=%d h=%d  core=(%d,%d,%d,%d)"
          % (t, left - 1, top, right + 1, bot + 1, right - left + 2, bot - top + 1, kx0, ky0, kx1, ky1))
    prev = (left, top, right, bot)
json.dump(out, open("boxes_t2.json", "w"), indent=1)
print("wrote boxes_t2.json")
