"""Track the white/silver vehicle with a tunable mask + closing; print px bbox."""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
x0, y0, x1, y1 = (int(v) for v in sys.argv[4:8])
THR = int(sys.argv[8]) if len(sys.argv) > 8 else 115
SAT = int(sys.argv[9]) if len(sys.argv) > 9 else 58
CLOSE = int(sys.argv[10]) if len(sys.argv) > 10 else 1
MINPX = int(sys.argv[11]) if len(sys.argv) > 11 else 400


def mask_of(a):
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    return (lum >= THR) & (sat <= SAT) & (r >= 90)


def close(m, k):
    for _ in range(k):
        m2 = m.copy()
        m2[1:, :] |= m[:-1, :]
        m2[:-1, :] |= m[1:, :]
        m2[:, 1:] |= m[:, :-1]
        m2[:, :-1] |= m[:, 1:]
        m = m2
    for _ in range(k):
        m2 = m.copy()
        m2[1:, :] &= m[:-1, :]
        m2[:-1, :] &= m[1:, :]
        m2[:, 1:] &= m[:, :-1]
        m2[:, :-1] &= m[:, 1:]
        m = m2
    return m


def largest_cc(mask, minpx):
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
    a = np.asarray(Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB"))
    if prev is None:
        sx0, sy0, sx1, sy1 = x0, y0, x1, y1
    else:
        px0, py0, px1, py1 = prev
        sx0, sy0 = max(0, px0 - 60), max(0, py0 - 55)
        sx1, sy1 = min(W, px1 + 60), min(H, py1 + 55)
    m = np.zeros((H, W), bool)
    m[sy0:sy1, sx0:sx1] = close(mask_of(a)[sy0:sy1, sx0:sx1], CLOSE)
    m[:270, :] = False
    cc = largest_cc(m, MINPX)
    t = (n - 1) * 0.25
    if cc is None:
        print("t=%.2f  NONE" % t)
        prev = None
        continue
    bx0, by0, bx1, by1, cnt = cc
    print("t=%.2f  box=(%d,%d,%d,%d) w=%d h=%d px=%d" % (t, bx0, by0, bx1, by1, bx1 - bx0, by1 - by0, cnt))
    prev = (bx0, by0, bx1, by1)
