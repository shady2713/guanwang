"""Render calibrated annotation data onto video frames for visual verification,
and re-derive region-entry event times from the annotated tracks + ROI.

Usage:
  python preview_annotations.py <analysis.json> <framesDir> <outDir> [--cell 620]

framesDir contains t01..tNN jpgs sampled at 0.5s intervals (file i => t=(i-1)*0.5).
The analysis JSON must follow the handoff ReadyAnalysis contract shape
(tracks[].segments[].samples, rois[].segments[].samples, events, rules).
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

argv = sys.argv[1:]
opts = {"--cell": ("cell", int), "--dt": ("dt", float), "--t0": ("t0", float)}
cell, dt, t0 = 620, 0.5, 0.0
for flag, (name, cast) in list(opts.items()):
    if flag in argv:
        i = argv.index(flag)
        if name == "cell":
            cell = int(argv[i + 1])
        elif name == "dt":
            dt = float(argv[i + 1])
        else:
            t0 = float(argv[i + 1])
        del argv[i:i + 2]
ana_path, frames_dir, out_dir = argv[0], argv[1], argv[2]
os.makedirs(out_dir, exist_ok=True)

with open(ana_path, "r", encoding="utf-8") as f:
    A = json.load(f)

try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 15)
except Exception:
    font = ImageFont.load_default()


def lerp(a, b, u):
    return a + (b - a) * u


def sample_track(seg, t):
    """Return (box, anchor, exact) for time t, or (None, None, False)."""
    ss = seg["samples"]
    if t < seg["interval"]["startSec"] or t >= seg["interval"]["endSec"]:
        return None, None, False
    if t < ss[0]["timeSec"] or t > ss[-1]["timeSec"]:
        return None, None, False
    # locate bracketing samples
    prev = ss[0]
    nxt = None
    for s in ss:
        if s["timeSec"] <= t + 1e-9:
            prev = s
        elif nxt is None:
            nxt = s
    if nxt is None:
        s = prev
        b = s["box"]
        return dict(b), (dict(s["anchor"]) if s.get("anchor") else None), True
    gap = nxt["timeSec"] - prev["timeSec"]
    if gap > seg.get("maxInterpolationGapSec", 1e9) + 1e-9:
        return None, None, False
    u = 0.0 if gap <= 0 else (t - prev["timeSec"]) / gap
    box = {}
    for k in ("x", "y", "width", "height"):
        box[k] = lerp(prev["box"][k], nxt["box"][k], u)
    anc = None
    if prev.get("anchor") and nxt.get("anchor"):
        anc = {"x": lerp(prev["anchor"]["x"], nxt["anchor"]["x"], u),
               "y": lerp(prev["anchor"]["y"], nxt["anchor"]["y"], u)}
    elif prev.get("anchor") and u < 0.5:
        anc = dict(prev["anchor"])
    elif nxt.get("anchor") and u >= 0.5:
        anc = dict(nxt["anchor"])
    return box, anc, True


def poly_at(seg, t):
    ss = seg["samples"]
    if t < seg["interval"]["startSec"] or t >= seg["interval"]["endSec"]:
        return None
    if t < ss[0]["timeSec"] or t > ss[-1]["timeSec"]:
        return None
    prev = ss[0]
    nxt = None
    for s in ss:
        if s["timeSec"] <= t + 1e-9:
            prev = s
        elif nxt is None:
            nxt = s
    if nxt is None:
        return [dict(p) for p in prev["vertices"]]
    gap = nxt["timeSec"] - prev["timeSec"]
    if gap > seg.get("maxInterpolationGapSec", 1e9) + 1e-9:
        return None
    u = 0.0 if gap <= 0 else (t - prev["timeSec"]) / gap
    out = []
    for i, p in enumerate(prev["vertices"]):
        q = nxt["vertices"][i]
        out.append({"x": lerp(p["x"], q["x"], u), "y": lerp(p["y"], q["y"], u)})
    return out


def inside(pt, verts):
    x, y = pt["x"], pt["y"]
    n = len(verts)
    c = False
    j = n - 1
    for i in range(n):
        xi, yi = verts[i]["x"], verts[i]["y"]
        xj, yj = verts[j]["x"], verts[j]["y"]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            c = not c
        j = i
    return c


def report():
    """Re-derive region-entry events from rules + tracks + ROI."""
    lines = []
    tracks = {tr["id"]: tr for tr in A.get("tracks", [])}
    rois = {r["id"]: r for r in A.get("rois", [])}
    for rule in A.get("rules", []):
        roi = rois.get(rule["roiId"])
        if not roi:
            lines.append(f"RULE {rule['id']}: ROI {rule['roiId']} MISSING")
            continue
        t0 = max(rule_min_t(tracks, tid) for tid in rule["trackIds"])
        t1 = roi_max_t(roi)
        dt = 0.01
        cross = None
        inside_since = None
        confirmed = None
        prev_in = False
        t = t0
        while t <= t1:
            state = []
            for tid in rule["trackIds"]:
                tr = tracks[tid]
                for seg in tr["segments"]:
                    box, anc, ok = sample_track(seg, t)
                    if not ok:
                        state.append(None)
                        continue
                    if rule["anchor"] == "box-bottom-center":
                        p = {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"]}
                    else:
                        p = anc
                    if p is None:
                        state.append(None)
                        continue
                    verts = None
                    for rs in roi["segments"]:
                        verts = poly_at(rs, t)
                        if verts:
                            break
                    state.append(inside(p, verts) if verts else None)
            if all(s is True for s in state) and len(state) == len(rule["trackIds"]):
                if inside_since is None:
                    inside_since = t
                if confirmed is None and (t - inside_since) >= rule["minimumInsideSec"] - 1e-9:
                    confirmed = t
            else:
                inside_since = None
            if cross is None and prev_in is False and state and state[0] is True:
                cross = t
            if state and state[0] is not None:
                prev_in = state[0]
            t += dt
        lines.append(f"RULE {rule['id']} ({rule['type']}, roi={rule['roiId']}, "
                     f"minInside={rule['minimumInsideSec']}s)")
        lines.append(f"  crossing={cross if cross is None else round(cross, 2)}  "
                     f"confirmed={confirmed if confirmed is None else round(confirmed, 2)}")
        for ev in A.get("events", []):
            if ev.get("roiId") == rule["roiId"]:
                lines.append(f"  EVENT {ev['id']} timeSec={ev['timeSec']} "
                             f"observed={ev.get('observedCrossingTimeSec')} tracks={ev['trackIds']}")
                if confirmed is not None and abs(ev["timeSec"] - confirmed) > 0.06:
                    lines.append(f"  !! MISMATCH: declared {ev['timeSec']} vs derived {round(confirmed,2)}")
    # gap audit
    for tr in A.get("tracks", []):
        for seg in tr["segments"]:
            ss = seg["samples"]
            gaps = [round(ss[i + 1]["timeSec"] - ss[i]["timeSec"], 3) for i in range(len(ss) - 1)]
            mg = seg.get("maxInterpolationGapSec")
            bad = [g for g in gaps if mg is not None and g > mg + 1e-9]
            lines.append(f"TRACK {tr['id']} seg {seg['id']} [{seg['interval']['startSec']},"
                         f"{seg['interval']['endSec']}) samples={len(ss)} maxGap={max(gaps) if gaps else 0}"
                         f" limit={mg}" + (f" OVER-LIMIT={bad}" if bad else ""))
    for r in A.get("rois", []):
        for seg in r["segments"]:
            ss = seg["samples"]
            gaps = [round(ss[i + 1]["timeSec"] - ss[i]["timeSec"], 3) for i in range(len(ss) - 1)]
            counts = {len(s["vertices"]) for s in ss}
            lines.append(f"ROI {r['id']} [{seg['interval']['startSec']},{seg['interval']['endSec']}) "
                         f"samples={len(ss)} vertices={sorted(counts)} maxGap={max(gaps) if gaps else 0}")
    return "\n".join(lines)


def rule_min_t(tracks, tid):
    tr = tracks[tid]
    return min(s["interval"]["startSec"] for s in tr["segments"])


def roi_max_t(roi):
    return max(s["interval"]["endSec"] for s in roi["segments"])


def render():
    files = sorted(f for f in os.listdir(frames_dir) if f.lower().endswith((".jpg", ".png")))
    ims = []
    for i, f in enumerate(files):
        t = round(t0 + i * dt, 2)
        im = Image.open(os.path.join(frames_dir, f)).convert("RGB")
        W0, H0 = im.width, im.height
        CH = int(round(H0 * cell / W0))
        CH -= CH % 2
        im = im.resize((cell, CH), Image.LANCZOS)
        d = ImageDraw.Draw(im, "RGBA")
        # ROI polygons
        for r in A.get("rois", []):
            for seg in r["segments"]:
                v = poly_at(seg, t)
                if v:
                    pts = [(p["x"] * cell, p["y"] * CH) for p in v]
                    d.polygon(pts, fill=(0, 190, 255, 46), outline=(0, 200, 255, 255), width=3)
                    d.text((pts[0][0] + 4, pts[0][1] + 3), r["label"], fill=(0, 90, 160, 255), font=font)
        # boxes
        for tr in A.get("tracks", []):
            for seg in tr["segments"]:
                box, anc, ok = sample_track(seg, t)
                if not box:
                    continue
                x0 = box["x"] * cell
                y0 = box["y"] * CH
                x1 = (box["x"] + box["width"]) * cell
                y1 = (box["y"] + box["height"]) * CH
                d.rectangle([x0, y0, x1, y1], outline=(255, 40, 40, 255), width=3)
                lab = f"{tr['label']}"
                tw = d.textlength(lab, font=font)
                d.rectangle([x0, max(0, y0 - 20), x0 + tw + 8, y0], fill=(255, 40, 40, 255))
                d.text((x0 + 4, max(0, y0 - 19)), lab, fill=(255, 255, 255, 255), font=font)
                if anc:
                    ax, ay = anc["x"] * cell, anc["y"] * CH
                    d.line([(ax - 7, ay), (ax + 7, ay)], fill=(255, 220, 0, 255), width=3)
                    d.line([(ax, ay - 7), (ax, ay + 7)], fill=(255, 220, 0, 255), width=3)
        # events fired so far
        for ev in A.get("events", []):
            if ev["visible"]["startSec"] <= t < ev["visible"]["endSec"]:
                d.text((6, 6), f"EVENT {ev['title']}", fill=(220, 0, 160, 255), font=font)
        d.rectangle([0, CH - 20, 86, CH], fill=(0, 0, 0, 220))
        d.text((4, CH - 18), f"t={t:.2f}s", fill=(255, 255, 255, 255), font=font)
        ims.append(im)
    CH = ims[0].height
    for s in range(0, len(ims), 4):
        chunk = ims[s:s + 4]
        sheet = Image.new("RGB", (cell * 2, CH * 2), (18, 18, 18))
        for j, im in enumerate(chunk):
            sheet.paste(im, ((j % 2) * cell, (j // 2) * CH))
        p = os.path.join(out_dir, f"verify_{s // 4:02d}_t{t0 + s * dt:.2f}.jpg")
        sheet.save(p, quality=90)
        print(p)


print(report())
render()