"""List all white-ish vehicle blobs in the right carriageway per frame."""
import sys, os
import numpy as np
from PIL import Image

W, H = 1216, 672
src, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])


def mask_of(n):
    a = np.asarray(Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB"))
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    m = (lum >= 150) & (sat <= 45)
    m[:200, :] = False
    return m


def ccs(mask, minpx):
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    res = []
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
        if len(pix) >= minpx:
            ys = [p[0] for p in pix]
            xs = [p[1] for p in pix]
            res.append((min(xs), min(ys), max(xs), max(ys), len(pix)))
    return sorted(res, key=lambda r: -r[4])


for n in range(first, last + 1):
    m = mask_of(n)
    # left carriageway
    mm = np.zeros_like(m)
    mm[:, 0:600] = m[:, 0:600]
    t = (n - 1) * 0.25
    parts = []
    for x0, y0, x1, y1, c in ccs(mm, 200):
        parts.append("(%d,%d,%d,%d,w%d,a%d)" % (x0, y0, x1, y1, x1 - x0, c))
    print("t=%.2f  " % t + "  ".join(parts))
