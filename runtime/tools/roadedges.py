"""Find the carriageway (grey asphalt) horizontal extent per scan row, per frame.

Usage: python roadedges.py <framesDir> <out.json> [y0 y1 dy x0 x1]
Greedy: longest contiguous run of asphalt-grey pixels, reported as [xstart, xend] per row.
"""
import json, os, sys
import numpy as np
from PIL import Image

fd, outp = sys.argv[1], sys.argv[2]
ys = [float(v) for v in sys.argv[3:8]] if len(sys.argv) >= 8 else [0.40, 0.72, 0.01, 0.70, 1.0]
y0, y1, dy, x0, x1 = ys
res = {}
for i in range(1, 41):
    name = "d%03d" % i
    im = np.asarray(Image.open(os.path.join(fd, name + ".jpg")).convert("RGB"), dtype=np.int16)
    H, W, _ = im.shape
    R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    grey = (R - B > -6) & (R - G > -14) & (R > 68) & (R < 232)
    rows = []
    yv = y0
    while yv <= y1 + 1e-9:
        py = int(round(yv * (H - 1)))
        row = grey[py, int(x0 * (W - 1)):int(x1 * (W - 1))]
        best = (0, 0, 0)
        s = None
        for k, v in enumerate(list(row) + [False]):
            if v and s is None:
                s = k
            elif not v and s is not None:
                if k - s > best[0]:
                    best = (k - s, s, k - 1)
                s = None
        L = best[1] / (W - 1) + x0
        Rr = best[2] / (W - 1) + x0
        rows.append({"y": round(yv, 4), "x0": round(L, 4) if best[0] else None,
                     "x1": round(Rr, 4) if best[0] else None, "len": best[0]})
        yv += dy
    res[name] = rows
    print(name, " ".join(f"{r['y']:.2f}:{r['x0']}-{r['x1']}" if r["x0"] is not None else f"{r['y']:.2f}:--" for r in rows))
json.dump(res, open(outp, "w"), indent=1)
print("wrote", outp)