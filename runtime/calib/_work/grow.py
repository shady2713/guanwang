"""Grow the strict white-vehicle core bbox outward along rows/cols of car-like
pixels, so the shadowed rear bumper is included without leaking into lane
markings (a marking is a narrow strip, far below the width threshold).
"""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cx0, cy0, cx1, cy1 = (int(v) for v in sys.argv[4:8])
CORE = int(sys.argv[8]) if len(sys.argv) > 8 else 150
SOFT = int(sys.argv[9]) if len(sys.argv) > 9 else 95
FRAC = float(sys.argv[10]) if len(sys.argv) > 10 else 0.30


def masks(n):
    a = np.asarray(Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB"))
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    soft = (lum >= SOFT) & (sat <= 78)
    core = (lum >= CORE) & (sat <= 45)
    soft[:270, :] = False
    core[:270, :] = False
    return core, soft


def largest_cc(mask, minpx=250):
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


prev = None
for n in range(first, last + 1):
    core, soft = masks(n)
    t = (n - 1) * 0.25
    if prev is None:
        m = np.zeros((H, W), bool)
        m[cy0:cy1, cx0:cx1] = core[cy0:cy1, cx0:cx1]
    else:
        px0, py0, px1, py1 = prev
        m = np.zeros((H, W), bool)
        a0, a1 = max(0, px0 - 55), min(W, px1 + 55)
        b0, b1 = max(270, py0 - 50), min(H, py1 + 50)
        m[b0:b1, a0:a1] = core[b0:b1, a0:a1]
    cc = largest_cc(m)
    if cc is None:
        print("t=%.2f NONE" % t)
        continue
    x0, y0, x1, y1, _ = cc
    wpx, hpx = x1 - x0, y1 - y0
    thr_x = max(6, int(FRAC * hpx))
    thr_y = max(6, int(FRAC * wpx))
    lo_x, hi_x = max(0, x0 - 30), min(W - 1, x1 + 30)
    lo_y, hi_y = max(270, y0 - 30), min(H - 1, y1 + 30)
    # bottom
    y = y1 + 1
    miss = 0
    while y <= hi_y and miss < 2:
        c = int(soft[y, lo_x:hi_x + 1].sum())
        if c >= thr_x:
            y1 = y
            miss = 0
        else:
            miss += 1
        y += 1
    y = y0 - 1
    miss = 0
    while y >= lo_y and miss < 2:
        c = int(soft[y, lo_x:hi_x + 1].sum())
        if c >= thr_x:
            y0 = y
            miss = 0
        else:
            miss += 1
        y -= 1
    x = x1 + 1
    miss = 0
    while x <= hi_x and miss < 2:
        c = int(soft[lo_y:hi_y + 1, x].sum())
        if c >= thr_y:
            x1 = x
            miss = 0
        else:
            miss += 1
        x += 1
    x = x0 - 1
    miss = 0
    while x >= lo_x and miss < 2:
        c = int(soft[lo_y:hi_y + 1, x].sum())
        if c >= thr_y:
            x0 = x
            miss = 0
        else:
            miss += 1
        x -= 1
    print("t=%.2f  box=(%d,%d,%d,%d) w=%d h=%d" % (t, x0, y0, x1, y1, x1 - x0, y1 - y0))
    prev = (x0, y0, x1, y1)
