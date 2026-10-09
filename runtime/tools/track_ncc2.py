"""Scale-aware template tracker over an explicit list of frames.

Usage:
  python track_ncc2.py <outCsv> <idx0> <idx1> ... -- <nx> <ny> <w> <h> <searchR> <scales>

For each frame a template is taken from the previous frame (centred on the
previous solution, sized by the previous solution) and matched by normalized
cross-correlation over a small position x scale search. Prints normalized
centre and box for every frame so each can be checked by eye.
"""
import sys
import numpy as np
from PIL import Image
from pathlib import Path

args = sys.argv[1:]
out = args[0]
idxs = []
i = 1
while i < len(args) and args[i] != "--":
    idxs.append(int(args[i]))
    i += 1
nx, ny, w, h = (float(v) for v in args[i + 1:i + 5])
R = int(float(args[i + 5]) * 1280)
scales = [float(s) for s in args[i + 6].split(",")]

D = Path(r"C:\Users\64576\Desktop\视界\runtime\calib\_full")
cache = {}


def gray(i):
    if i not in cache:
        cache[i] = np.asarray(Image.open(D / f"d{i:03d}.jpg").convert("L"),
                              dtype=np.float32)
    return cache[i]


g0 = gray(idxs[0])
H, W = g0.shape
cx, cy, bw, bh = nx * W, ny * H, w * W, h * H
lines = []
for k, fi in enumerate(idxs):
    if k == 0:
        lines.append(f"{fi} {(fi - 1) / 8:.3f} {cx / W:.4f} {cy / H:.4f} "
                     f"{(cx - bw / 2) / W:.4f} {(cy - bh / 2) / H:.4f} "
                     f"{bw / W:.4f} {bh / H:.4f} 1.000")
        continue
    src = gray(fi - (idxs[k - 1] - idxs[k - 1]))  # placeholder, replaced below
    src = gray(idxs[k - 1])
    tw0, th0 = int(round(bw)), int(round(bh))
    tx0, ty0 = int(round(cx - tw0 / 2)), int(round(cy - th0 / 2))
    tpl = src[ty0:ty0 + th0, tx0:tx0 + tw0]
    tpl = tpl - tpl.mean()
    tn = np.sqrt((tpl * tpl).sum())
    tgt = gray(fi)
    best, bbest = -2.0, None
    for s in scales:
        tw, th = max(6, int(round(tw0 * s))), max(6, int(round(th0 * s)))
        tsub = np.zeros((th, tw), dtype=np.float32)
        hh, ww = min(th, th0), min(tw, tw0)
        tsub[:hh, :ww] = tpl[:hh, :ww]
        tsub -= tsub.mean()
        tn = np.sqrt((tsub * tsub).sum())
        for yy in range(max(0, int(cy - R)), min(H - th, int(cy + R)) + 1, 2):
            for xx in range(max(0, int(cx - R)), min(W - tw, int(cx + R)) + 1, 2):
                p = tgt[yy:yy + th, xx:xx + tw]
                p = p - p.mean()
                den = np.sqrt((p * p).sum()) * tn
                sc = float((p * tsub).sum() / den) if den else -2.0
                if sc > best:
                    best, bbest = sc, (xx, yy, tw, th, s)
    xx, yy, tw, th, s = bbest
    cx, cy, bw, bh = xx + tw / 2, yy + th / 2, tw, th
    lines.append(f"{fi} {(fi - 1) / 8:.3f} {cx / W:.4f} {cy / H:.4f} "
                 f"{(cx - bw / 2) / W:.4f} {(cy - bh / 2) / H:.4f} "
                 f"{bw / W:.4f} {bh / H:.4f} {best:.3f}")
Path(out).write_text("\n".join(lines) + "\n", encoding="utf-8")
print("\n".join(lines))
