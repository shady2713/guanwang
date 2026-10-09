"""Local vehicle segmentation in a search window -> tight axis-aligned box.

Isolates bright low-saturation bodywork (white van cab) and saturated blue
bodywork (van rear box), takes the largest connected component, and reports a
tight bbox in normalized encoded-frame coords. Draws the result for visual
confirmation.

Usage:
  python segbox.py <framesDir> <spec.json> <outDir>
spec.json = {"items":[{"f":"d001","cx":..,"cy":..,"hw":..,"hh":..,"tag":".."}]}
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

fd, spec_path, od = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(od, exist_ok=True)
S = json.load(open(spec_path, "r", encoding="utf-8"))
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 12)
except Exception:
    font = ImageFont.load_default()

BRIGHT = S.get("bright", 0.66)
BLUE_D = S.get("blueD", 26)

for it in S["items"]:
    im = Image.open(os.path.join(fd, it["f"] + ".jpg")).convert("RGB")
    W, H = im.size
    cx, cy, hw, hh = it["cx"], it["cy"], it["hw"], it["hh"]
    x0 = max(0, int(round((cx - hw) * W))); x1 = min(W, int(round((cx + hw) * W)))
    y0 = max(0, int(round((cy - hh) * H))); y1 = min(H, int(round((cy + hh) * H)))
    px = im.load()
    mask = set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            sat = (mx - mn) / (mx + 1e-6)
            if g > b + 10:              # grass / foliage
                continue
            if mx / 255 >= BRIGHT and sat < 0.22:
                mask.add((x, y))          # white bodywork
            elif b - r >= BLUE_D and b >= 90:
                mask.add((x, y))          # blue bodywork
    # connected components; score by blue-pixel count (the van's rear box is blue)
    seen = set(); best = []; best_blue = -1
    for p in mask:
        if p in seen:
            continue
        stack = [p]; seen.add(p); comp = []
        while stack:
            a, c = stack.pop(); comp.append((a, c))
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    q = (a + dx, c + dy)
                    if q in mask and q not in seen:
                        seen.add(q); stack.append(q)
        nb = 0
        for (a, c) in comp:
            rr, gg, bb = px[a, c]
            if bb - rr >= BLUE_D:
                nb += 1
        if nb > best_blue:
            best_blue = nb; best = comp
    if not best:
        print(f"{it['f']} {it.get('tag','')}: NO MASK")
        continue
    xs = [p[0] for p in best]; ys = [p[1] for p in best]
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
    print(f"{it['f']} t={it.get('tag','')}: n={len(best)} box_px=({bx0},{by0})-({bx1},{by1}) "
          f"norm=({bx0/W:.4f},{by0/H:.4f},{(bx1-bx0)/W:.4f},{(by1-by0)/H:.4f})")
    # overlay
    im2 = im.copy()
    d = ImageDraw.Draw(im2, "RGBA")
    d.rectangle([bx0, by0, bx1, by1], outline=(255, 0, 255), width=2)
    crop = im2.crop((x0, y0, x1, y1))
    z = 4
    big = crop.resize((crop.width * z, crop.height * z), Image.LANCZOS)
    db = ImageDraw.Draw(big, "RGBA")
    step = 0.005
    gx = x0 / W
    while gx <= x1 / W:
        px_ = int((gx - x0 / W) * crop.width * z)
        db.line([(px_, 0), (px_, big.height)], fill=(255, 0, 0, 90))
        db.text((px_ + 1, 1), f"{gx:.3f}", fill=(255, 0, 0, 255), font=font)
        gx += step
    gy = y0 / H
    while gy <= y1 / H:
        py_ = int((gy - y0 / H) * crop.height * z)
        db.line([(0, py_), (big.width, py_)], fill=(0, 60, 255, 90))
        db.text((1, py_ + 1), f"{gy:.3f}", fill=(0, 60, 255, 255), font=font)
        gy += step
    p = os.path.join(od, f"seg_{it['f']}.jpg")
    big.save(p, quality=93)
