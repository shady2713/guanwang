"""Measure ONLY the true bottom edge of the sedan (shadowed rear bumper).

For each frame: start from the strict white core bottom, then walk down while the
row still contains car-like pixels across a wide horizontal span of the car.
A lane marking / crosswalk stripe is narrow, so it fails the wide-span test.
"""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cx0, cy0, cx1, cy1 = (int(v) for v in sys.argv[4:8])
CORE, SOFT, FRAC, MAXD = 150, 92, 0.45, 20


def masks(n):
    a = np.asarray(Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB"))
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    soft = (lum >= SOFT) & (sat <= 80)
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
        b0, b1 = max(270, py0 - 45), min(H, py1 + 40)
        m[b0:b1, a0:a1] = core[b0:b1, a0:a1]
    cc = largest_cc(m)
    if cc is None:
        print("t=%.2f NONE" % t)
        continue
    x0, y0, x1, y1, _ = cc
    wpx = x1 - x0
    need = int(FRAC * wpx)
    lo, hi = max(270, x0 - 5), min(W - 1, x1 + 5)
    bot = y1
    counts = []
    for y in range(y1 + 1, min(H, y1 + 1 + MAXD)):
        c = int(soft[y, lo:hi + 1].sum())
        counts.append((y, c))
        if c >= need:
            bot = y
    print("t=%.2f core=(%d,%d,%d,%d) w=%d bottom=%d  rows=%s"
          % (t, x0, y0, x1, y1, wpx, bot, counts[:14]))
    prev = (x0, y0, x1, bot)
