"""Full 4-direction box measurement for the sedan: strict white core, then extend
each edge outward only while the edge line still shows a WIDE span of car-like
pixels (this rejects thin lane markings and the narrow tips of road arrows)."""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cx0, cy0, cx1, cy1 = (int(v) for v in sys.argv[4:8])
CORE, SOFT = 150, 92
FY = 0.50   # vertical (top/bottom) edge: fraction of core WIDTH that must be car-like
FX = 0.40   # horizontal (left/right) edge: fraction of core HEIGHT that must be car-like
CAPY, CAPX = 18, 0
TOP_ON = False


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


def grow(x0, y0, x1, y1, soft):
    wpx, hpx = x1 - x0, y1 - y0
    needY = max(8, int(FY * wpx))
    needX = max(6, int(FX * hpx))
    lo_x, hi_x = max(0, x0 - CAPX), min(W - 1, x1 + CAPX)
    lo_y, hi_y = max(270, y0 - CAPY), min(H - 1, y1 + CAPY)
    miss = 0
    y = y1 + 1
    while y <= hi_y and miss < 2:
        if int(soft[y, lo_x:hi_x + 1].sum()) >= needY:
            y1 = y
            miss = 0
        else:
            miss += 1
        y += 1
    miss = 0
    y = y0 - 1
    while TOP_ON and y >= lo_y and miss < 2:
        if int(soft[y, lo_x:hi_x + 1].sum()) >= needY:
            y0 = y
            miss = 0
        else:
            miss += 1
        y -= 1
    miss = 0
    x = x1 + 1
    while x <= hi_x and miss < 2:
        if int(soft[lo_y:hi_y + 1, x].sum()) >= needX:
            x1 = x
            miss = 0
        else:
            miss += 1
        x += 1
    miss = 0
    x = x0 - 1
    while x >= lo_x and miss < 2:
        if int(soft[lo_y:hi_y + 1, x].sum()) >= needX:
            x0 = x
            miss = 0
        else:
            miss += 1
        x -= 1
    return x0, y0, x1, y1


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
        a0, a1 = max(0, px0 - 45), min(W, px1 + 45)
        b0, b1 = max(270, py0 - 35), min(H, py1 + 40)
        m[b0:b1, a0:a1] = core[b0:b1, a0:a1]
    cc = largest_cc(m)
    if cc is None:
        print("t=%.2f NONE" % t)
        continue
    x0, y0, x1, y1, _ = cc
    X0, Y0, X1, Y1 = grow(x0, y0, x1, y1, soft)
    print("t=%.2f  core=(%d,%d,%d,%d)  box=(%d,%d,%d,%d) w=%d h=%d"
          % (t, x0, y0, x1, y1, X0, Y0, X1, Y1, X1 - X0, Y1 - Y0))
    prev = (X0, Y0, X1, Y1)
