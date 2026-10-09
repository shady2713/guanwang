"""2x2 contact sheets of bigzoom tiles WITH box/anchor/polygon overlays.

Usage:
  python ovsheet.py <framesDir> <outDir> <spec.json>
spec.json items: {"f":"d009","cx":..,"cy":..,"hw":..,"hh":..,"tag":"..",
                  "step":0.005,"box":[x,y,w,h], "anchor":[x,y], "roi":[[x,y],...]}
  each roi row in spec is drawn as a separate polygon in the row given by "roiSeries"
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

fd, od, sp = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(od, exist_ok=True)
S = json.load(open(sp, "r", encoding="utf-8"))
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 16)
except Exception:
    font = ImageFont.load_default()
TW, TH = 1500, 1000
tiles = []
for it in S["items"]:
    im = Image.open(os.path.join(fd, it["f"] + ".jpg")).convert("RGB")
    W, H = im.size
    cx, cy, hw, hh = it["cx"], it["cy"], it["hw"], it["hh"]
    x0 = int(round((cx - hw) * W)); x1 = int(round((cx + hw) * W))
    y0 = int(round((cy - hh) * H)); y1 = int(round((cy + hh) * H))
    crop = im.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    sc = int(min(TW / cw, TH / ch))
    big = crop.resize((cw * sc, ch * sc), Image.LANCZOS)
    tile = Image.new("RGB", (TW, TH), (10, 10, 10))
    ox = (TW - cw * sc) // 2; oy = (TH - ch * sc) // 2
    tile.paste(big, (ox, oy))
    d = ImageDraw.Draw(tile, "RGBA")
    nx0, nx1, ny0, ny1 = x0 / W, x1 / W, y0 / H, y1 / H

    def PX(nx):
        return ox + int((nx - nx0) / (nx1 - nx0) * cw * sc)

    def PY(ny):
        return oy + int((ny - ny0) / (ny1 - ny0) * ch * sc)

    step = it.get("step", 0.01)
    g = step
    while g <= 1.0:
        if nx0 <= g <= nx1:
            d.line([(PX(g), 0), (PX(g), TH)], fill=(255, 0, 0, 70), width=1)
            d.text((PX(g) + 2, 2), f"{g:.3f}", fill=(255, 60, 60, 255), font=font)
        g += step
    g = step
    while g <= 1.0:
        if ny0 <= g <= ny1:
            d.line([(0, PY(g)), (TW, PY(g))], fill=(0, 90, 255, 70), width=1)
            d.text((2, PY(g) + 1), f"{g:.3f}", fill=(0, 90, 255, 255), font=font)
        g += step
    for bx in it.get("boxes", []):
        d.rectangle([PX(bx[0]), PY(bx[1]), PX(bx[0] + bx[2]), PY(bx[1] + bx[3])],
                    outline=(255, 0, 0, 255), width=3)
    for poly in it.get("rois", []):
        d.line([(PX(p[0]), PY(p[1])) for p in poly] + [(PX(poly[0][0]), PY(poly[0][1]))],
               fill=(0, 255, 255, 255), width=3)
    a = it.get("anchor")
    if a:
        ax, ay = PX(a[0]), PY(a[1])
        d.line([(ax - 14, ay), (ax + 14, ay)], fill=(255, 230, 0, 255), width=3)
        d.line([(ax, ay - 14), (ax, ay + 14)], fill=(255, 230, 0, 255), width=3)
    d.rectangle([0, TH - 30, TW, TH], fill=(0, 0, 0, 220))
    b = it.get("boxes")
    txt = f"{it['f']} {it.get('tag','')}  crop x[{nx0:.4f},{nx1:.4f}] y[{ny0:.4f},{ny1:.4f}]"
    if b:
        txt += "  box " + " ".join(f"{v:.4f}" for v in b[0])
    d.text((4, TH - 28), txt, fill=(255, 255, 0, 255), font=font)
    tiles.append(tile)
for s in range(0, len(tiles), 4):
    chunk = tiles[s:s + 4]
    rows = (len(chunk) + 1) // 2
    sheet = Image.new("RGB", (TW * 2, TH * rows), (16, 16, 16))
    for j, t in enumerate(chunk):
        sheet.paste(t, ((j % 2) * TW, (j // 2) * TH))
    p = os.path.join(od, f"ovs_{s//4:02d}.jpg")
    sheet.save(p, quality=92)
    print(p, sheet.size)