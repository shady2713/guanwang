"""Detect the median-side kerb by scanning LEFT from inside the carriageway.

Usage: python kerbline2.py <framesDir> <out.json> [y0 y1 dy xStart]
Green test: G-R>12 and G-B>12.  The kerb x = right edge of the last green run left of xStart.
"""
import json, os, sys
import numpy as np
from PIL import Image

fd, outp = sys.argv[1], sys.argv[2]
ys = [float(v) for v in sys.argv[3:6]] if len(sys.argv) >= 6 else [0.50, 0.70, 0.01]
xs = float(sys.argv[6]) if len(sys.argv) >= 7 else 0.885
res = {}
for i in range(1, 41):
    name = "d%03d" % i
    im = np.asarray(Image.open(os.path.join(fd, name + ".jpg")).convert("RGB"), dtype=np.int16)
    H, W, _ = im.shape
    R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    green = (G - R > 12) & (G - B > 12)
    rows = []
    yv = ys[0]
    while yv <= ys[1] + 1e-9:
        py = int(round(yv * (H - 1)))
        seg = green[py, 0:int(xs * (W - 1))]
        last = None
        k = 0
        while k < len(seg):
            if seg[k]:
                s = k
                while k < len(seg) and seg[k]:
                    k += 1
                if k - s >= 10:
                    last = (s, k - 1)
            else:
                k += 1
        rows.append({"y": round(yv, 4), "L": round((last[1] + 1) / (W - 1), 4) if last else None})
        yv += ys[2]
    res[name] = rows
    print(name, " ".join(f"{r['y']:.2f}:{r['L']}" for r in rows))
json.dump(res, open(outp, "w"), indent=1)
print("wrote", outp)