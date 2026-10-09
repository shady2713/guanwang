"""Estimate the inter-frame camera transform on static background (building) patches.

Usage: python regcam.py <framesDir> <refFrame> <out.json> [x0 y0 x1 y1]
Fits per-frame (dx, dy, scale) by brute-force search minimising SSD on a static patch.
"""
import json, os, sys
import numpy as np
from PIL import Image

fd, ref, outp = sys.argv[1], sys.argv[2], sys.argv[3]
patch = [float(v) for v in sys.argv[4:8]] if len(sys.argv) >= 8 else [0.10, 0.12, 0.50, 0.45]


def load(name):
    return np.asarray(Image.open(os.path.join(fd, name + ".jpg")).convert("L"), dtype=np.float32)


refim = load(ref)
H, W = refim.shape
px0, py0, px1, py1 = int(patch[0] * W), int(patch[1] * H), int(patch[2] * W), int(patch[3] * H)


def prep(im, scale, dx, dy, box):
    """Crop `box` from im, scale about its centre, translate, return subimage."""
    x0, y0, x1, y1 = box
    sub = im[y0:y1, x0:x1]
    if abs(scale - 1.0) > 1e-3:
        nh, nw = int(round(sub.shape[0] * scale)), int(round(sub.shape[1] * scale))
        sub = np.asarray(Image.fromarray(sub.astype(np.uint8)).resize((nw, nh), Image.BILINEAR), dtype=np.float32)
    h, w = sub.shape
    out = np.zeros_like(refim[y0:y1, x0:x1], dtype=np.float32)
    # place sub into an output of the same size as the reference crop, centred
    cy, cx = h // 2, w // 2
    ry0, rx0 = (y1 - y0) // 2, (x1 - x0) // 2
    oy, ox = ry0 - cy + int(round(dy)), rx0 - cx + int(round(dx))
    ys0, ys1 = max(0, oy), min(out.shape[0], oy + h)
    xs0, xs1 = max(0, ox), min(out.shape[1], ox + w)
    out[ys0:ys1, xs0:xs1] = sub[ys0 - oy:ys1 - oy, xs0 - ox:xs1 - ox]
    return out


refpatch = refim[py0:py1, px0:px1]
res = {}
for i in range(1, 41):
    name = "d%03d" % i
    if name == ref:
        res[name] = {"dx": 0.0, "dy": 0.0, "scale": 1.0, "sse": 0.0}
        continue
    im = load(name)
    best = None
    for sc in [0.94, 0.96, 0.98, 1.0, 1.02, 1.04, 1.06]:
        for dy in range(-30, 31, 2):
            for dx in range(-30, 31, 2):
                p = prep(im, sc, dx, dy, (px0, py0, px1, py1))
                sse = float(((p - refpatch) ** 2).mean())
                if best is None or sse < best[0]:
                    best = (sse, dx, dy, sc)
    # refine
    sse, dx, dy, sc = best
    for _ in range(3):
        improved = False
        for ddx in (-1, 0, 1):
            for ddy in (-1, 0, 1):
                for dsc in (-0.01, 0.0, 0.01):
                    p = prep(im, sc + dsc, dx + ddx, dy + ddy, (px0, py0, px1, py1))
                    s = float(((p - refpatch) ** 2).mean())
                    if s < sse:
                        sse, dx, dy, sc = s, dx + ddx, dy + ddy, sc + dsc
                        improved = True
        if not improved:
            break
    res[name] = {"dx": float(dx), "dy": float(dy), "scale": float(sc), "sse": sse}
    print(name, dx, dy, round(sc, 3), round(sse, 1))

json.dump({"ref": ref, "patch": patch, "W": W, "H": H, "frames": res}, open(outp, "w"), indent=1)
print("wrote", outp)