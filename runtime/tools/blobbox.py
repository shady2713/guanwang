"""Objective dark-blob bbox around a known target, for cross-checking eye reads.

Usage:
  python blobbox.py <t0> <t1> ... with the first arg = csv of t,nx,ny,w,h

Reads a CSV of `timeSec,cx,cy,w,h` (normalized) and, for each row, finds the
connected component of "not bright red path" pixels nearest (cx,cy) inside a
generous window, then prints its bbox. Used only as a sanity cross-check of the
hand-read boxes; the final numbers stay hand-verified against the frames.
"""
import sys
import numpy as np
from PIL import Image
from pathlib import Path

D = Path(r"C:\Users\64576\Desktop\视界\runtime\calib\_full")


def comp_bbox(mask, sx, sy, seedx, seedy):
    H, W = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    stack = [(seedx, seedy)]
    seen[sy, sx] = True
    minx = maxx = sx
    miny = maxy = sy
    n = 0
    while stack:
        x, y = stack.pop()
        n += 1
        minx, maxx = min(minx, x), max(maxx, x)
        miny, maxy = min(miny, y), max(maxy, y)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((nx, ny))
    return minx, miny, maxx - minx + 1, maxy - miny + 1, n


for line in Path(sys.argv[1]).read_text(encoding="utf-8").split("\n"):
    if not line.strip():
        continue
    t, cx, cy, w, h = (float(v) for v in line.split(","))
    im = Image.open(D / f"d{int(round(t * 8)) + 1:03d}.jpg").convert("RGB")
    a = np.asarray(im, dtype=np.int16)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    dark = (np.maximum(np.maximum(R, G), B) < 145) & (R < 175)
    H, W = dark.shape
    px, py = int(cx * W), int(cy * H)
    pad_x, pad_y = int(w * W) + 14, int(h * H) + 16
    x0, x1 = max(0, px - pad_x), min(W, px + pad_x)
    y0, y1 = max(0, py - pad_y), min(H, py + pad_y)
    sub = np.zeros_like(dark)
    sub[y0:y1, x0:x1] = dark[y0:y1, x0:x1]
    sx = min(max(px, x0), x1 - 1)
    sy = min(max(py, y0), y1 - 1)
    if not sub[sy, sx]:
        ys, xs = np.nonzero(sub)
        d = (xs - px) ** 2 + (ys - py) ** 2
        i = int(np.argmin(d))
        sx, sy = int(xs[i]), int(ys[i])
    bx, by, bw, bh, n = comp_bbox(sub, sx, sy, sx, sy)
    print(f"t={t:5.2f} blob x={bx / W:.4f} y={by / H:.4f} w={bw / W:.4f} "
          f"h={bh / H:.4f} ({bw}x{bh}px) n={n}  | cur x={cx - w / 2:.4f} "
          f"y={cy - h / 2:.4f} w={w:.4f} h={h:.4f}")
