"""Fit the median-side kerb (left edge of the van's carriageway) per frame and build roi-gate.

The kerb is found per scan row as the right edge of the LAST green run when scanning left
from inside the carriageway (x < xStart). Points are robustly fitted (trimmed Theil-Sen) per
frame; frames whose fit is still unreliable fall back to a linear-in-time prior built from the
clean frames.

Quad construction guarantees a single fixed piece of road:
  Ln / Lf  = kerb points at two fixed screen-y stations (Y_NEAR, Y_FAR)
  p        = unit normal of the kerb pointing into the carriageway
  right edge = left edge + WIDTH * p   (WIDTH measured perpendicular to the road)
  winding   = [Ln, Ln+W*p, Lf+W*p, Lf]  (identical at every sample)
"""
import json, os, glob
import numpy as np
from PIL import Image

d = glob.glob(os.path.expanduser("~/Desktop/*/runtime/calib/industry"))[0]
FD = glob.glob(os.path.expanduser("~/Desktop/*/runtime/calib/industry4"))[0]
Y_LO, Y_HI, DY = 0.50, 0.72, 0.01
X_START, MIN_RUN = 0.90, 6
FIT_LO, FIT_HI = 0.50, 0.72
Y_NEAR, Y_FAR, WIDTH = 0.610, 0.520, 0.095
NFR = 21

imgs = {}
for i in range(1, NFR + 1):
    a = np.asarray(Image.open(os.path.join(FD, "d%03d.jpg" % i)).convert("RGB"), dtype=np.int16)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    imgs["d%03d" % i] = ((G - R > 12) & (G - B > 12), a.shape[1], a.shape[0])


def detect(name):
    green, W, H = imgs[name]
    hi = int(round(X_START * (W - 1)))
    pts = []
    yv = Y_LO
    while yv <= Y_HI + 1e-9:
        py = int(round(yv * (H - 1)))
        seg = green[py, :hi + 1]
        last = None
        k = 0
        while k <= hi:
            if seg[k]:
                s = k
                while k <= hi and seg[k]:
                    k += 1
                if k - s >= MIN_RUN:
                    last = k - 1
            else:
                k += 1
        if last is not None:
            pts.append((yv, (last + 1) / (W - 1)))
        yv += DY
    return pts


def fit(pts):
    for _ in range(4):
        if len(pts) < 5:
            return None, pts
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        sl = [(xs[j] - xs[i]) / (ys[j] - ys[i])
              for i in range(len(ys)) for j in range(i + 1, len(ys)) if abs(ys[j] - ys[i]) > 0.015]
        if not sl:
            return None, pts
        m = float(np.median(sl)); b = float(np.median(xs - m * ys))
        r = np.abs(xs - (m * ys + b))
        mad = float(np.median(np.abs(r - np.median(r))))
        thr = max(0.004, 3.0 * 1.4826 * mad)
        keep = r <= thr
        if keep.all():
            return (m, b, float(np.median(r))), pts
        pts = [pts[k] for k in range(len(pts)) if keep[k]]
    return (m, b, float(np.median(r))), pts


fits, kpts = {}, {}
for i in range(1, NFR + 1):
    name = "d%03d" % i
    f, kp = fit([p for p in detect(name) if FIT_LO <= p[0] <= FIT_HI])
    fits[name], kpts[name] = f, kp
    if f:
        print(name, f"m={f[0]:.4f} b={f[1]:.4f} med={f[2]:.4f} n={len(kp)} kept={kp[0][0]:.2f}-{kp[-1][0]:.2f}")
    else:
        print(name, "FAIL")

good = [i for i in range(1, NFR + 1)
        if fits["d%03d" % i] and fits["d%03d" % i][2] < 0.006 and -0.95 < fits["d%03d" % i][0] < -0.55]
ts = np.array(good, dtype=float)
cb = np.polyfit(ts, [fits["d%03d" % i][1] for i in good], 1)
cm = np.polyfit(ts, [fits["d%03d" % i][0] for i in good], 1)
print("clean frames", good)
print("prior b(t)=%.6f*t+%.4f  m(t)=%.6f*t+%.4f" % (cb[0], cb[1], cm[0], cm[1]))

out = []
for i in range(1, NFR + 1):
    name = "d%03d" % i
    f = fits[name]
    src = "measured"
    if f is None or f[2] >= 0.006 or not (-0.95 < f[0] < -0.55):
        m = cm[0] * i + cm[1]; b = cb[0] * i + cb[1]; src = "prior"
    else:
        m, b, _ = f
    n = np.array([1.0, -m]); n /= np.linalg.norm(n)
    p = np.array([n[1], -n[0]])
    if p[0] < 0:
        p = -p
    Ln = np.array([m * Y_NEAR + b, Y_NEAR]); Lf = np.array([m * Y_FAR + b, Y_FAR])
    quad = [Ln, Ln + WIDTH * p, Lf + WIDTH * p, Lf]
    out.append({"frame": name, "t": round((i - 1) * 0.25, 2), "m": round(m, 4), "b": round(b, 4),
                "src": src, "npts": len(kpts[name]),
                "roi": [[round(float(q[0]), 4), round(float(q[1]), 4)] for q in quad]})
    print(name, f"t={(i-1)*0.25:.2f} {src:8s}", " ".join(f"({q[0]:.4f},{q[1]:.4f})" for q in quad))
json.dump(out, open(os.path.join(d, "_roi.json"), "w"), indent=1)
print("wrote _roi.json")