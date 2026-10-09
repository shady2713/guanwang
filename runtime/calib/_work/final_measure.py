"""Final hand-calibrated box measurement for the sedan.

For each 0.25s frame:
  top    : strict white-core top (verified wide-span; only t=6.25 needs a manual
           override because a lane marking merges with the roof in the core mask)
  left/right : first/last column with >= MINC car-like pixels inside [top,bottom]
  bottom : last row with >= 45% of the core width still car-like (the shadowed
           rear bumper), which thin lane markings cannot satisfy
"""
import sys, os, json
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cx0, cy0, cx1, cy1 = (int(v) for v in sys.argv[4:8])
CORE, SOFT, MINC = 150, 92, 4
TOP_OVERRIDE = {6.25: 484}


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
        a0, a1 = max(0, px0 - 40), min(W, px1 + 40)
        b0, b1 = max(270, py0 - 30), min(H, py1 + 35)
        m[b0:b1, a0:a1] = core[b0:b1, a0:a1]
    cc = largest_cc(m)
    if cc is None:
        print("t=%.2f NONE" % t)
        continue
    kx0, ky0, kx1, ky1, _ = cc
    top = TOP_OVERRIDE.get(t, ky0)
    # provisional bottom from the core, then widen left/right on that band
    bot = ky1
    for y in range(ky1, min(H, ky1 + 22)):
        if int(soft[y, kx0 - 6:kx1 + 7].sum()) >= 0.45 * (kx1 - kx0):
            bot = y
    band = soft[top:bot + 1, :]
    colcount = band.sum(axis=0)
    L = max(0, kx0 - 6)
    R = min(W - 1, kx1 + 6)
    # a car edge column is covered by many rows; a lane-marking column by few
    needC = max(5, int(0.14 * (bot - top)))
    left = next(x for x in range(L, R + 1) if colcount[x] >= needC)
    right = next(x for x in range(R, L - 1, -1) if colcount[x] >= needC)
    bot = ky1
    for y in range(ky1, min(H, ky1 + 22)):
        if int(soft[y, left:right + 1].sum()) >= 0.45 * (right - left):
            bot = y
    out["%.2f" % t] = [int(left), int(top), int(right), int(bot)]
    print("t=%.2f  box=(%d,%d,%d,%d)  w=%d h=%d   core=(%d,%d,%d,%d)"
          % (t, left, top, right, bot, right - left, bot - top, kx0, ky0, kx1, ky1))
    prev = (left, top, right, bot)
json.dump(out, open("boxes_final.json", "w"), indent=1)
print("wrote boxes_final.json")
