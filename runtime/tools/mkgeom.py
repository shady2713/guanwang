"""Build a checkboxes geometry file from a compact table in a python literal.

Table rows: (timeSec, x, y, w, h, anchorX|None, anchorY|None)
"""
import json, sys, ast

src = sys.argv[1]      # path to a .py file defining VAN = [(t,x,y,w,h), ...]
out = sys.argv[2]
ns = {}
exec(open(src, encoding="utf-8").read(), ns)
VAN = ns["VAN"]
CAR = ns.get("CAR") or []
ROI = ns.get("ROI")
FOCUS = ns.get("FOCUS") or [
    {"hw": 0.05, "hh": 0.055, "step": 0.01, "scale": 5},
    {"hw": 0.035, "hh": 0.04, "step": 0.005, "scale": 8},
    {"hw": 0.08, "hh": 0.07, "step": 0.02, "scale": 4},
]


def mk(rows, with_anchor):
    seg = {"id": "s1", "samples": []}
    for i, r in enumerate(rows):
        t, x, y, w, h = r[0], r[1], r[2], r[3], r[4]
        sm = {"timeSec": round(t, 3),
              "box": {"x": round(x, 4), "y": round(y, 4),
                      "width": round(w, 4), "height": round(h, 4)}}
        if with_anchor:
            sm["anchor"] = {"x": round(x + w / 2, 4), "y": round(y + h, 4)}
        seg["samples"].append(sm)
    return {"segs": [seg]}


G = {"boxes": [], "rois": [], "focus": FOCUS}
G["boxes"].append({"track": "vehicle-a", **mk(VAN, True)})
if CAR:
    G["boxes"].append({"track": "vehicle-b", **mk(CAR, False)})
if ROI:
    seg = {"id": "r1", "samples": [
        {"timeSec": round(t, 3), "vertices": [{"x": round(p[0], 4), "y": round(p[1], 4)} for p in v]}
        for t, v in ROI]}
    G["rois"].append({"id": "roi-gate", "segs": [seg]})
json.dump(G, open(out, "w", encoding="utf-8"), indent=1)
print("wrote", out, "van", len(VAN), "car", len(CAR), "roi", 0 if not ROI else len(ROI))
