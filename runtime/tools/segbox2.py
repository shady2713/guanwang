"""Tight van-box extraction: seed from blue rear-box core, grow into white bodywork.

Rejects grass (green), road (mid-grey), and thin/non-compact components (kerb,
lane markings). Emits tight bbox in normalized coords + a magnified overlay.

Usage:
  python segbox2.py <framesDir> <outDir> <spec.json>
spec.json = {"step":..,"items":[{"f":"d001","cx":..,"cy":..,"hw":..,"hh":..,"tag":"t=0.00"}]}
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

fd, od, sp = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(od, exist_ok=True)
S = json.load(open(sp, "r", encoding="utf-8"))
BRIGHT = S.get("bright", 0.63)
BLUE_D = S.get("blueD", 22)
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 12)
except Exception:
    font = ImageFont.load_default()

RES = {}
for it in S["items"]:
    im = Image.open(os.path.join(fd, it["f"] + ".jpg")).convert("RGB")
    W, H = im.size
    cx, cy, hw, hh = it["cx"], it["cy"], it["hw"], it["hh"]
    x0 = max(0, int(round((cx - hw) * W))); x1 = min(W, int(round((cx + hw) * W)))
    y0 = max(0, int(round((cy - hh) * H))); y1 = min(H, int(round((cy + hh) * H)))
    px = im.load()
    white, blue = set(), set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if g > b + 8:                       # grass
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            sat = (mx - mn) / (mx + 1e-6)
            if b - r >= BLUE_D and b >= 85:
                blue.add((x, y))
            elif mx / 255.0 >= BRIGHT and sat < 0.20:
                white.add((x, y))
    if not blue:
        print(f"{it['f']} t={it.get('tag','')}: no blue core")
        continue
    # component of the blue set (radius 1) with most pixels
    seen = set(); best = []
    for p in blue:
        if p in seen:
            continue
        st = [p]; seen.add(p); comp = []
        while st:
            a, c = st.pop(); comp.append((a, c))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (a + dx, c + dy)
                    if q in blue and q not in seen:
                        seen.add(q); st.append(q)
        if len(comp) > len(best):
            best = comp
    core = set(best)
    if len(core) < 12:
        core = set(sorted(blue, key=lambda p: -((px[p[0], p[1]][2] - px[p[0], p[1]][0])))[:20])
    # grow into white with radius 1, only compact additions
    full = set(core)
    frontier = set()
    for (a, c) in core:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (a + dx, c + dy)
                if q in white and q not in full:
                    frontier.add(q)
    while frontier:
        nxt = set()
        for q in sorted(frontier, key=lambda p: (p[0], p[1])):
            a, c = q
            newpix = False
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    z = (a + dx, c + dy)
                    if z in white and z not in full:
                        full.add(z); nxt.add(z); newpix = True
            # a white pixel is accepted only if it keeps the shape compact:
            if not newpix:
                full.discard(q)
        frontier = nxt
    xs = [p[0] for p in full]; ys = [p[1] for p in full]
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
    fill = len(full) / max(1, (bx1 - bx0 + 1) * (by1 - by0 + 1))
    bx0 = max(x0, bx0 - 1); by0 = max(y0, by0 - 1)
    bx1 = min(x1 - 1, bx1 + 1); by1 = min(y1 - 1, by1 + 1)
    RES[it["f"]] = (bx0 / W, by0 / H, (bx1 - bx0) / W, (by1 - by0) / H)
    print(f"{it['f']} t={it.get('tag','')}: n={len(full)} fill={fill:.2f} "
          f"norm=({bx0/W:.4f},{by0/H:.4f},{(bx1-bx0)/W:.4f},{(by1-by0)/H:.4f})")
    im2 = im.copy(); d = ImageDraw.Draw(im2, "RGBA")
    d.rectangle([bx0, by0, bx1, by1], outline=(255, 0, 255), width=2)
    for (a, c) in core:
        d.point((a, c), fill=(255, 255, 0, 255))
    crop = im2.crop((x0, y0, x1, y1))
    sc = S.get("scale", 7)
    big = crop.resize((crop.width * sc, crop.height * sc), Image.LANCZOS)
    db = ImageDraw.Draw(big, "RGBA")
    step = S.get("step", 0.005)
    gx = x0 / W
    while gx <= x1 / W:
        pxx = int((gx - x0 / W) * crop.width * sc)
        db.line([(pxx, 0), (pxx, big.height)], fill=(255, 0, 0, 80))
        db.text((pxx + 1, 1), f"{gx:.3f}", fill=(255, 0, 0, 255), font=font)
        gx += step
    gy = y0 / H
    while gy <= y1 / H:
        pyy = int((gy - y0 / H) * crop.height * sc)
        db.line([(0, pyy), (big.width, pyy)], fill=(0, 80, 255, 80))
        db.text((1, pyy + 1), f"{gy:.3f}", fill=(0, 80, 255, 255), font=font)
        gy += step
    big.save(os.path.join(od, f"sg_{it['f']}.jpg"), quality=93)
json.dump(RES, open(os.path.join(od, "_result.json"), "w", encoding="utf-8"), indent=1)
