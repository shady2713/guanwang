"""Template-track a small figure across the fps=8 frame sequence with NCC.

Usage:
  python track_ncc.py <firstFrame> <lastFrame> <tplNx> <tplNy> <tplW> <tplH> <searchR> [step]

Positions are normalized to the 1280x720 encoded frame. Prints one line per
frame: index timeSec nx ny  score  (nx,ny = template centre).
"""
import sys
import numpy as np
from PIL import Image
from pathlib import Path

first = int(sys.argv[1])
last = int(sys.argv[2])
tnx, tny, tnw, tnh = (float(v) for v in sys.argv[3:7])
R = int(float(sys.argv[7]) * 1280)
step = int(sys.argv[8]) if len(sys.argv) > 8 else 1

D = Path(r"C:\Users\64576\Desktop\视界\runtime\calib\_full")


def gray(i):
    return np.asarray(Image.open(D / f"d{i:03d}.jpg").convert("L"), dtype=np.float32)


g = {i: gray(i) for i in range(first, last + step, step)}
H, W = g[first].shape
tw, th = int(round(tnw * W)), int(round(tnh * H))
tx, ty = int(round(tnx * W)), int(round(tny * H))
x0, y0 = tx - tw // 2, ty - th // 2
tpl = g[first][y0:y0 + th, x0:x0 + tw]
tpl = tpl - tpl.mean()

px, py = x0, y0
for i in sorted(g):
    im = g[i]
    if i != first:
        best, bx, by = -2.0, px, py
        for yy in range(max(0, py - R), min(H - th, py + R) + 1, 2):
            for xx in range(max(0, px - R), min(W - tw, px + R) + 1, 2):
                p = im[yy:yy + th, xx:xx + tw]
                p = p - p.mean()
                d = (p * tpl).sum()
                n = np.sqrt((p * p).sum() * (tpl * tpl).sum())
                s = float(d / n) if n else -2.0
                if s > best:
                    best, bx, by = s, xx, yy
        px, py = bx, by
    cx = (px + tw / 2) / W
    cy = (py + th / 2) / H
    print(f"{i} {(i - 1) / 8:.3f} {cx:.4f} {cy:.4f} px={px} py={py}")
