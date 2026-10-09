"""Detect the median-side kerb line (green verge -> asphalt) per frame.

Usage: python kerbline.py <framesDir> <out.json> [ys y0 y1]
For each frame and each scan row y in ys, scan x in [x0,x1] and report the first x where
N consecutive pixels are 'asphalt' (R-B>-6, R-G>-14, 68<R<232).  Also reports the matching
right-hand asphalt end found by scanning back from x1.
"""
import json, os, sys
import numpy as np
from PIL import Image

fd, outp = sys.argv[1], sys.argv[2]
ys = [float(v) for v in sys.argv[3:6]] if len(sys.argv) >= 6 else [0.45, 0.80, 0.025]
x0, x1 = (float(sys.argv[6]), float(sys.argv[7])) if len(sys.argv) >= 8 else (0.74, 1.0)
N = 12
res = {}
for i in range(1, 41):
    name = "d%03d" % i
    im = np.asarray(Image.open(os.path.join(fd, name + ".jpg")).convert("RGB"), dtype=np.int16)
    H, W, _ = im.shape
    R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    road = (R - B > -6) & (R - G > -14) & (R > 68) & (R < 232)
    rows = []
    yv = ys[0]
    while yv <= ys[1] + 1e-9:
        py = int(round(yv * (H - 1)))
        a = int(x0 * (W - 1))
        b = int(x1 * (W - 1))
        seg = road[py, a:b]
        L = None
        for k in range(len(seg) - N):
            if seg[k:k + N].all():
                L = (k + a) / (W - 1)
                break
        Rr = None
        for k in range(len(seg) - N, 0, -1):
            if seg[k - N:k].all():
                Rr = (k + a) / (W - 1)
                break
        rows.append({"y": round(yv, 4), "L": round(L, 4) if L else None,
                     "R": round(Rr, 4) if Rr else None})
        yv += ys[2]
    res[name] = rows
    print(name, " ".join(f"{r['y']:.3f}:{r['L']}-{r['R']}" for r in rows))
json.dump(res, open(outp, "w"), indent=1)
print("wrote", outp)