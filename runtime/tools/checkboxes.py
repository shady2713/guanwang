"""Draw candidate track/ROI geometry on zoomed crops for precise visual checking.

Usage:
  python checkboxes.py <framesDir> <outDir> <geom.json> [--dt 0.25] [--per 4]
geom.json = {"boxes":[{"track":"vehicle-a","segs":[{"samples":[{"timeSec":0.0,"box":{...}}]}]}],
             "rois":[{"id":"roi-gate","segs":[{"samples":[{"timeSec":..,"vertices":[{x,y},..]}]}]}],
             "focus":[{"hw":0.05,"hh":0.055,"step":0.01,"scale":5}]}
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

argv = sys.argv[1:]
dt = 0.25
per = 4
if "--dt" in argv:
    i = argv.index("--dt"); dt = float(argv[i + 1]); del argv[i:i + 2]
if "--per" in argv:
    i = argv.index("--per"); per = int(argv[i + 1]); del argv[i:i + 2]
fd, od, gp = argv[0], argv[1], argv[2]
os.makedirs(od, exist_ok=True)
G = json.load(open(gp, "r", encoding="utf-8"))
FOCUS = G["focus"]
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 12)
except Exception:
    font = ImageFont.load_default()

times = []
for b in G["boxes"]:
    for s in b["segs"]:
        times += [sm["timeSec"] for sm in s["samples"]]
for r in G.get("rois", []):
    for s in r["segs"]:
        times += [sm["timeSec"] for sm in s["samples"]]
times = sorted(set(round(t, 3) for t in times))


def lerp_at(samples, t):
    if t < samples[0]["timeSec"] or t > samples[-1]["timeSec"]:
        return None
    prev = samples[0]; nxt = None
    for s in samples:
        if s["timeSec"] <= t + 1e-9:
            prev = s
        elif nxt is None:
            nxt = s
    if nxt is None:
        out = {"box": dict(prev["box"]), "anchor": dict(prev["anchor"]) if prev.get("anchor") else None}
        if "vertices" in prev:
            out["vertices"] = [dict(p) for p in prev["vertices"]]
        return out
    g = nxt["timeSec"] - prev["timeSec"]
    u = 0.0 if g <= 0 else (t - prev["timeSec"]) / g
    out = {"box": {}}
    for k in ("x", "y", "width", "height"):
        out["box"][k] = prev["box"][k] + (nxt["box"][k] - prev["box"][k]) * u
    pa, na = prev.get("anchor"), nxt.get("anchor")
    if pa and na:
        out["anchor"] = {"x": pa["x"] + (na["x"] - pa["x"]) * u,
                         "y": pa["y"] + (na["y"] - pa["y"]) * u}
    else:
        out["anchor"] = pa or na
    if "vertices" in prev:
        out["vertices"] = [{"x": prev["vertices"][i]["x"] + (nxt["vertices"][i]["x"] - prev["vertices"][i]["x"]) * u,
                            "y": prev["vertices"][i]["y"] + (nxt["vertices"][i]["y"] - prev["vertices"][i]["y"]) * u}
                           for i in range(len(prev["vertices"]))]
    return out


tiles = []
for t in times:
    idx = int(round(t / dt)) + 1
    im = Image.open(os.path.join(fd, "d%03d.jpg" % idx)).convert("RGB")
    W, H = im.size
    # focus centre = mean of geometry at t
    pts = []
    for b in G["boxes"]:
        for s in b["segs"]:
            v = lerp_at(s["samples"], t)
            if v:
                pts.append((v["box"]["x"] + v["box"]["width"] / 2, v["box"]["y"] + v["box"]["height"] / 2))
    for r in G.get("rois", []):
        for s in r["segs"]:
            if s["samples"][0]["timeSec"] <= t <= s["samples"][-1]["timeSec"]:
                pts += [(p["x"], p["y"]) for p in lerp_at(s["samples"], t)["vertices"]]
    cx = sum(p[0] for p in pts) / len(pts) if pts else 0.5
    cy = sum(p[1] for p in pts) / len(pts) if pts else 0.5
    f = None
    for cand in sorted(FOCUS, key=lambda q: q["hw"] * q["hh"]):
        m = cand.get("m", 0.04)
        if all(abs(p[0] - cx) + m <= cand["hw"] and abs(p[1] - cy) + m <= cand["hh"] for p in pts):
            f = cand
            break
    if f is None:
        f = min(FOCUS, key=lambda q: q["hw"] * q["hh"])
    hw, hh, step, sc = f["hw"], f["hh"], f["step"], f["scale"]
    x0 = max(0, int(round((cx - hw) * W))); x1 = min(W, int(round((cx + hw) * W)))
    y0 = max(0, int(round((cy - hh) * H))); y1 = min(H, int(round((cy + hh) * H)))
    crop = im.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    big = crop.resize((cw * sc, ch * sc), Image.LANCZOS)
    d = ImageDraw.Draw(big, "RGBA")
    nx0, nx1, ny0, ny1 = x0 / W, x1 / W, y0 / H, y1 / H
    g = step
    while g <= 1.0:
        if nx0 <= g <= nx1:
            pxx = int((g - nx0) / (nx1 - nx0) * cw * sc)
            d.line([(pxx, 0), (pxx, ch * sc)], fill=(255, 0, 0, 70), width=1)
            d.text((pxx + 1, 1), f"{g:.3f}", fill=(255, 0, 0, 255), font=font)
        g += step
    g = step
    while g <= 1.0:
        if ny0 <= g <= ny1:
            pyy = int((g - ny0) / (ny1 - ny0) * ch * sc)
            d.line([(0, pyy), (cw * sc, pyy)], fill=(0, 80, 255, 70), width=1)
            d.text((1, pyy + 1), f"{g:.3f}", fill=(0, 80, 255, 255), font=font)
        g += step
    for r in G.get("rois", []):
        for s in r["segs"]:
            v = lerp_at(s["samples"], t)
            if v:
                pts2 = [(p["x"] * W, p["y"] * H) for p in v["vertices"]]
                d.polygon([((p[0] - x0) * sc, (p[1] - y0) * sc) for p in pts2],
                          outline=(0, 220, 255, 255), fill=(0, 190, 255, 40), width=2)
    for b in G["boxes"]:
        for s in b["segs"]:
            v = lerp_at(s["samples"], t)
            if not v:
                continue
            X0 = (v["box"]["x"] * W - x0) * sc; Y0 = (v["box"]["y"] * H - y0) * sc
            X1 = ((v["box"]["x"] + v["box"]["width"]) * W - x0) * sc
            Y1 = ((v["box"]["y"] + v["box"]["height"]) * H - y0) * sc
            d.rectangle([X0, Y0, X1, Y1], outline=(255, 0, 0, 255), width=2)
            if v.get("anchor"):
                ax = (v["anchor"]["x"] * W - x0) * sc; ay = (v["anchor"]["y"] * H - y0) * sc
                d.line([(ax - 9, ay), (ax + 9, ay)], fill=(255, 230, 0, 255), width=2)
                d.line([(ax, ay - 9), (ax, ay + 9)], fill=(255, 230, 0, 255), width=2)
    d.rectangle([0, ch * sc - 20, cw * sc, ch * sc], fill=(0, 0, 0, 215))
    d.text((3, ch * sc - 19), f"t={t:.2f}  crop x[{nx0:.3f},{nx1:.3f}] y[{ny0:.3f},{ny1:.3f}]",
           fill=(255, 255, 0, 255), font=font)
    tiles.append(big)

TW = max(t.width for t in tiles); TH = max(t.height for t in tiles)
for s in range(0, len(tiles), per):
    chunk = tiles[s:s + per]
    rows = (len(chunk) + 1) // 2
    sheet = Image.new("RGB", (TW * 2, TH * rows), (16, 16, 16))
    for j, tt in enumerate(chunk):
        sheet.paste(tt, ((j % 2) * TW, (j // 2) * TH))
    p = os.path.join(od, f"chk_{s//per:02d}.jpg")
    sheet.save(p, quality=93)
    print(p, sheet.size)
