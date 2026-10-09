"""Track the bright (white/silver) vehicle blob in the right carriageway.

Simple luminance threshold + connected components (4-neighbour BFS), restricted to
a search window that follows the previous box. Prints px bbox per frame.
"""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src = sys.argv[1]
first, last = int(sys.argv[2]), int(sys.argv[3])
x0, y0, x1, y1 = (int(v) for v in sys.argv[4:8])  # seed search rect for first frame


def bright_mask(a):
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = mx - mn
    return (lum >= 150) & (sat <= 45) & (r >= 120)


def largest_cc(mask):
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    best = None
    best_n = 0
    idx = np.argwhere(mask)
    for sy, sx in idx:
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
            best_n = len(pix)
            best = pix
    if best is None:
        return None
    ys = [p[0] for p in best]
    xs = [p[1] for p in best]
    return min(xs), min(ys), max(xs), max(ys), best_n


prev = None
for n in range(first, last + 1):
    p = os.path.join(src, "f%03d.jpg" % n)
    a = np.asarray(Image.open(p).convert("RGB"))
    if prev is None:
        sx0, sy0, sx1, sy1 = x0, y0, x1, y1
    else:
        px0, py0, px1, py1 = prev
        mx, my = 110, 90
        sx0, sy0 = max(0, px0 - mx), max(0, py0 - my)
        sx1, sy1 = min(W, px1 + mx), min(H, py1 + my)
    m = np.zeros((H, W), bool)
    m[sy0:sy1, sx0:sx1] = bright_mask(a)[sy0:sy1, sx0:sx1]
    m[:260, :] = False  # sky/horizon
    cc = largest_cc(m)
    t = (n - 1) * 0.25
    if cc is None:
        print("t=%.2f  NONE  search=%s" % (t, (sx0, sy0, sx1, sy1)))
        prev = None
        continue
    bx0, by0, bx1, by1, cnt = cc
    print("t=%.2f  box=(%d,%d,%d,%d) w=%d h=%d px=%d search=(%d,%d,%d,%d)"
          % (t, bx0, by0, bx1, by1, bx1 - bx0, by1 - by0, cnt, sx0, sy0, sx1, sy1))
    prev = (bx0, by0, bx1, by1)
