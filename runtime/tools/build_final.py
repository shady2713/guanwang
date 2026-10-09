"""Build the two hand-calibrated industry analysis JSONs.

Van boxes/anchors come from runtime/calib/industry/van_track.py (read off real frames).
The ROI quad is held on ONE fixed piece of road by pinning its left edge to the
carriageway's median-side kerb, whose screen line was measured by hand at t=0.00
(x(0.60)=0.838, slope -0.310) and t=5.00 (x(0.60)=0.820, slope -0.295) and
interpolated linearly for the camera drift in between.
"""
import json, math, os, glob, importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAL = os.path.join(ROOT, "runtime", "calib", "industry")
OUT = os.path.join(ROOT, "homepage", "data", "analysis")

spec = importlib.util.spec_from_file_location("vt", os.path.join(CAL, "van_track.py"))
vt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vt)

# ---- camera / kerb model -------------------------------------------------
def kerb(t):
    """Return (b, m) so the kerb is x = b + m*y, measured on the frame at time t."""
    return (1.024 - 0.0054 * t, -0.310 + 0.0030 * t)


def basis(t):
    b, m = kerb(t)
    L = math.hypot(m, 1.0)
    u = (m / L, 1.0 / L)          # up-road direction (screen), m<0 so uy<0
    n = (-u[1], u[0])             # rotate; pick the branch pointing +x
    if n[0] < 0:
        n = (-n[0], -n[1])
    return b, m, u, n


Y_NEAR, Y_FAR, WIDTH = 0.620, 0.520, 0.085


def quad(t):
    b, m, u, n = basis(t)
    lnx = b + m * Y_NEAR
    ln = (lnx, Y_NEAR)
    rn = (lnx + WIDTH * n[0], Y_NEAR + WIDTH * n[1])
    dx = Y_NEAR - Y_FAR          # = 0.1
    sx, sy = -u[0] * dx, -u[1] * dx
    rf = (rn[0] + sx, rn[1] + sy)
    lf = (ln[0] + sx, ln[1] + sy)
    return [[round(ln[0], 4), round(ln[1], 4)], [round(rn[0], 4), round(rn[1], 4)],
            [round(rf[0], 4), round(rf[1], 4)], [round(lf[0], 4), round(lf[1], 4)]]


# ---- shared blocks ------------------------------------------------------
MEDIA = {
    "mediaId": "industry-v1",
    "sha256": "75a14723f494ceffb8613d87930167b852ee53642e0c7b8fc5df9be5990a0a5",
    "encodedWidth": 1264,
    "encodedHeight": 640,
    "durationSec": 10,
    "timebase": "presentation-seconds",
    "frameRate": {"numerator": 24, "denominator": 1},
}
PROV = {"kind": "authored-demo", "displayLabel": "功能演示", "annotationMethod": "manual-reviewed"}
REVIEWED = "2026-10-09T00:00:00+08:00"
WINDOW = {"startSec": 0.0, "endSec": 5.25}
SEG = {"id": "vehicle-a-s1", "interval": {"startSec": 0.0, "endSec": 5.25},
       "interpolation": "linear", "maxInterpolationGapSec": 0.35}

CHAIN_DETECT = json.load(open(os.path.join(
    ROOT, "outputs", "homepage-implementation-handoff-v1", "content", "algorithm-chains.json"),
    encoding="utf-8"))
chains = {c["id"]: c for c in CHAIN_DETECT} if isinstance(CHAIN_DETECT, list) else CHAIN_DETECT


def track_samples(with_anchor):
    out = []
    for i, (t, x, y, w, h) in enumerate(vt.VAN):
        s = {"timeSec": round(t, 2),
             "box": {"x": x, "y": y, "width": w, "height": h}}
        if with_anchor:
            s["anchor"] = {"x": vt.ANCHOR[i][0], "y": vt.ANCHOR[i][1]}
        out.append(s)
    return out


def track(with_anchor):
    return [{"id": "vehicle-a", "label": "车辆 A", "className": "vehicle",
             "segments": [dict(SEG, samples=track_samples(with_anchor))]}]


def roi_samples():
    return [{"timeSec": round(t, 2),
             "vertices": [{"x": p[0], "y": p[1]} for p in quad(t)]}
            for (t, *_rest) in vt.VAN]


# ---- file 1: vehicle detection -----------------------------------------
det = {
    "schemaVersion": "1.0",
    "analysisId": "industry-vehicle-detection-v1",
    "scenarioId": "industry",
    "presetId": "vehicle-detection",
    "status": "ready",
    "provenance": PROV,
    "reviewedAt": REVIEWED,
    "media": MEDIA,
    "playbackWindow": dict(WINDOW),
    "chain": chains["chain-detection"],
    "tracks": track(False),
    "rois": [],
    "rules": [],
    "events": [],
    "evidence": [],
    "cues": [
        {"id": "c-det-input", "range": {"startSec": 0.0, "endSec": 0.7}, "kind": "node-emphasis",
         "targetId": "input", "purpose": "explanation"},
        {"id": "c-det-preprocess", "range": {"startSec": 1.4, "endSec": 2.1}, "kind": "node-emphasis",
         "targetId": "preprocess", "purpose": "explanation"},
        {"id": "c-det-detect", "range": {"startSec": 2.9, "endSec": 3.6}, "kind": "node-emphasis",
         "targetId": "detect", "purpose": "explanation"},
        {"id": "c-det-output", "range": {"startSec": 4.5, "endSec": 5.25}, "kind": "node-emphasis",
         "targetId": "output", "purpose": "explanation"},
    ],
}

# ---- file 2: region entry ----------------------------------------------
reg = {
    "schemaVersion": "1.0",
    "analysisId": "industry-region-entry-v1",
    "scenarioId": "industry",
    "presetId": "region-entry",
    "status": "ready",
    "provenance": PROV,
    "reviewedAt": REVIEWED,
    "media": MEDIA,
    "playbackWindow": dict(WINDOW),
    "chain": chains["chain-region-entry"],
    "tracks": track(True),
    "rois": [{
        "id": "roi-gate",
        "label": "区域 A",
        "coordinateSpace": "encoded-frame-normalized",
        "role": "ground-region",
        "segments": [{
            "interval": {"startSec": 0.0, "endSec": 5.25},
            "interpolation": "linear",
            "maxInterpolationGapSec": 0.35,
            "samples": roi_samples(),
        }],
    }],
    "rules": [{
        "id": "rule-gate",
        "type": "outside-to-inside",
        "trackIds": ["vehicle-a"],
        "roiId": "roi-gate",
        "anchor": "annotated-ground-contact",
        "boundary": "inside",
        "minimumInsideSec": 0.4,
    }],
    "events": [{
        "id": "ev-region-entry",
        "mediaId": "industry-v1",
        "kind": "region-entry",
        "timeSec": 1.66,
        "observedCrossingTimeSec": 1.26,
        "visible": {"startSec": 1.66, "endSec": 5.25},
        "trackIds": ["vehicle-a"],
        "roiId": "roi-gate",
        "title": "车辆进入指定区域",
        "evidenceIds": [],
    }],
    "evidence": [],
    "cues": [
        {"id": "c-entry-input", "range": {"startSec": 0.0, "endSec": 0.7}, "kind": "node-emphasis",
         "targetId": "input", "purpose": "explanation"},
        {"id": "c-entry-roi", "range": {"startSec": 0.8, "endSec": 1.2}, "kind": "node-emphasis",
         "targetId": "roi-gate", "purpose": "explanation"},
        {"id": "c-entry-rule", "range": {"startSec": 1.25, "endSec": 1.6}, "kind": "node-emphasis",
         "targetId": "rule", "purpose": "explanation"},
        {"id": "c-entry-event", "range": {"startSec": 1.66, "endSec": 2.15}, "kind": "node-emphasis",
         "targetId": "ev-region-entry", "purpose": "explanation"},
        {"id": "c-entry-preprocess", "range": {"startSec": 2.4, "endSec": 3.1}, "kind": "node-emphasis",
         "targetId": "preprocess", "purpose": "explanation"},
        {"id": "c-entry-detect", "range": {"startSec": 3.3, "endSec": 4.0}, "kind": "node-emphasis",
         "targetId": "detect", "purpose": "explanation"},
        {"id": "c-entry-track", "range": {"startSec": 4.2, "endSec": 4.9}, "kind": "node-emphasis",
         "targetId": "track", "purpose": "explanation"},
        {"id": "c-entry-output", "range": {"startSec": 5.0, "endSec": 5.25}, "kind": "node-emphasis",
         "targetId": "output", "purpose": "explanation"},
    ],
}

os.makedirs(OUT, exist_ok=True)
for name, obj in (("industry-vehicle-detection.json", det), ("industry-region-entry.json", reg)):
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", p, os.path.getsize(p))

for t in (0.0, 1.25, 2.5, 5.0):
    print(f"t={t}: {quad(t)}")