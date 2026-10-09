"""Render a box/ROI geometry file as standardized zoom tiles + 2x2 sheets.

Usage:
  python overlay.py <framesDir> <geom.json> <outDir> [--dt 0.25] [--per 4]
Each tile is a fixed-size zoom centred on the geometry, with a 0.005 grid
(lines) / 0.02 grid (labels) and the current numbers printed.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

argv = sys.argv[1:]
dt, per = 0.25, 4
if "--dt" in argv:
    i = argv.index("--dt"); dt = float(argv[i + 1]); del argv[i:i + 2]
if "--per" in argv:
    i = argv.index("--per"); per = int(argv[i + 1]); del argv[i:i + 2]
fd, gp, od = argv[0], argv[1], argv[2]
os.makedirs(od, exist_ok=True)
G = json.load(open(gp, "r", encoding="utf-8"))
FOCUS = G["focus"]
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 13)
except Exception:
    font = ImageFont.load_default()

times = []
for b in G["boxes"]:
    for s in b["segs"]:
        times += [sm["timeSec"] for sm in s["samples"]]
times = sorted(set(round(t, 3) for t in times))


def lerp_at(sm, t):
    if t < sm[0]["timeSec"] or t > sm[-1]["timeSec"]:
        return None
    prev, nxt = sm[0], None
    for s in sm:
        if s["timeSec"] <= t + 1e-9:
            prev = s
        elif nxt is None:
            nxt = s
    if nxt is None:
        return {"box": dict(prev["box"]), "anchor": dict(prev["anchor"]) if prev.get("anchor") else None}
    g = nxt["timeSec"] - prev["timeSec"]
    u = 0.0 if g <= 0 else (t - prev["timeSec"]) / g
    return {"box": {k: prev["box"][k] + (nxt["box"][k] - prev["box"][k]) * u for k in ("x", "y", "width", "height")},
            "anchor": ({"x": prev["anchor"]["x"] + (nxt["anchor"]["x"] - prev["anchor"]["x"]) * u,
                        "y": prev["anchor"]["y"] + (nxt["anchor"]["y"] - prev["anchor"]["y"]) * u}
                       if prev.get("anchor") and nxt.get("anchor") else prev.get("anchor"))}


TILE_W, TILE_H = 760, 700
tiles = []
for t in times:
    idx = int(round(t / dt)) + 1
    im = Image.open(os.path.join(fd, "d%03d.jpg" % idx)).convert("RGB")
    W, H = im.size
    pts = []
    info = []
    for b in G["boxes"]:
        for s in b["segs"]:
            v = lerp_at(s["samples"], t)
            if v:
                bx = v["box"]
                pts += [(bx["x"], bx["y"]), (bx["x"] + bx["width"], bx["y"] + bx["height"])]
                info.append((b["track"], v))
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    f = min(FOCUS, key=lambda q: q["hw"] * q["hh"])
    hw, hh, sc = f["hw"], f["hh"], f["scale"]
    x0 = int(round((cx - hw) * W)); x1 = int(round((cx + hw) * W))
    y0 = int(round((cy - hh) * H)); y1 = int(round((cy + hh) * H))
    cw, ch = x1 - x0, y1 - y0
    sc = min(TILE_W / cw, TILE_H / ch)
    sc = int(sc)
    crop = im.crop((x0, y0, x1, y1))
    big = crop.resize((cw * sc, ch * sc), Image.LANCZOS)
    tile = Image.new("RGB", (TILE_W, TILE_H), (12, 12, 12))
    tile.paste(big, ((TILE_W - cw * sc) // 2, (TILE_H - ch * sc) // 2))
    d = ImageDraw.Draw(tile, "RGBA")
    ox = (TILE_W - cw * sc) // 2; oy = (TILE_H - ch * sc) // 2
    nx0, nx1, ny0, ny1 = x0 / W, x1 / W, y0 / H, y1 / H
    g = 0.005
    while g <= 1.0:
        if nx0 <= g <= nx1:
            pxx = ox + int((g - nx0) / (nx1 - nx0) * cw * sc)
            d.line([(pxx, 0), (pxx, TILE_H)], fill=(255, 0, 0, 70), width=1)
            if abs((g / 0.02) - round(g / 0.02)) < 1e-6:
                d.text((pxx + 2, 2), f"{g:.3f}", fill=(255, 40, 40, 255), font=font)
        g += 0.005
    g = 0.005
    while g <= 1.0:
        if ny0 <= g <= ny1:
            pyy = oy + int((g - ny0) / (ny1 - ny0) * ch * sc)
            d.line([(0, pyy), (TILE_W, pyy)], fill=(0, 90, 255, 70), width=1)
            if abs((g / 0.02) - round(g / 0.02)) < 1e-6:
                d.text((2, pyy + 1), f"{g:.3f}", fill=(0, 90, 255, 255), font=font)
        g += 0.005
    for name, v in info:
        bx = v["box"]
        X0 = ox + int((bx["x"] - nx0) / (nx1 - nx0) * cw * sc)
        Y0 = oy + int((bx["y"] - ny0) / (ny1 - ny0) * ch * sc)
        X1 = ox + int((bx["x"] + bx["width"] - nx0) / (nx1 - nx0) * cw * sc)
        Y1 = oy + int((bx["y"] + bx["height"] - ny0) / (ny1 - ny0) * ch * sc)
        d.rectangle([X0, Y0, X1, Y1], outline=(255, 0, 0, 255), width=2)
        if v.get("anchor"):
            ax = ox + int((v["anchor"]["x"] - nx0) / (nx1 - nx0) * cw * sc)
            ay = oy + int((v["anchor"]["y"] - ny0) / (ny1 - ny0) * ch * sc)
            d.line([(ax - 10, ay), (ax + 10, ay)], fill=(255, 235, 0, 255), width=2)
            d.line([(ax, ay - 10), (ax, ay + 10)], fill=(255, 235, 0, 255), width=2)
    d.rectangle([0, TILE_H - 40, TILE_W, TILE_H], fill=(0, 0, 0, 225))
    txt = f"t={t:.2f}  " + " | ".join(
        f"{n}: x={v['box']['x']:.4f} y={v['box']['y']:.4f} w={v['box']['width']:.4f} h={v['box']['height']:.4f}"
        for n, v in info)
    d.text((4, TILE_H - 38), txt, fill=(255, 255, 0, 255), font=font)
    tiles.append(tile)

for s in range(0, len(tiles), per):
    ch_ = tiles[s:s + per]
    rows = (len(ch_) + 1) // 2
    sheet = Image.new("RGB", (TILE_W * 2, TILE_H * rows), (24, 24, 24))
    for j, tt in enumerate(ch_):
        sheet.paste(tt, ((j % 2) * TILE_W, (j // 2) * TILE_H))
    p = os.path.join(od, f"ov_{s//per:02d}.jpg")
    sheet.save(p, quality=94)
    print(p, sheet.size)
