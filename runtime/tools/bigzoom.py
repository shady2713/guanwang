"""Big single-frame zoom with a fine grid for precise edge reading.

Usage:
  python bigzoom.py <framesDir> <outDir> <spec.json>
spec.json items: {"f":"d009","cx":..,"cy":..,"hw":..,"hh":..,"tag":"..","step":0.01,"scale":10}
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
    step = it.get("step", 0.01)
    g = step
    while g <= 1.0:
        if nx0 <= g <= nx1:
            p = ox + int((g - nx0) / (nx1 - nx0) * cw * sc)
            major = abs((g / (step * 2)) - round(g / (step * 2))) < 1e-6
            d.line([(p, 0), (p, TH)], fill=(255, 0, 0, 120 if major else 60), width=1)
            d.text((p + 2, 2), f"{g:.3f}", fill=(255, 60, 60, 255), font=font)
        g += step
    g = step
    while g <= 1.0:
        if ny0 <= g <= ny1:
            p = oy + int((g - ny0) / (ny1 - ny0) * ch * sc)
            major = abs((g / (step * 2)) - round(g / (step * 2))) < 1e-6
            d.line([(0, p), (TW, p)], fill=(0, 90, 255, 120 if major else 60), width=1)
            d.text((2, p + 1), f"{g:.3f}", fill=(0, 90, 255, 255), font=font)
        g += step
    for bx in it.get("boxes", []):
        X0 = ox + int((bx["x"] - nx0) / (nx1 - nx0) * cw * sc)
        Y0 = oy + int((bx["y"] - ny0) / (ny1 - ny0) * ch * sc)
        X1 = ox + int((bx["x"] + bx["width"] - nx0) / (nx1 - nx0) * cw * sc)
        Y1 = oy + int((bx["y"] + bx["height"] - ny0) / (ny1 - ny0) * ch * sc)
        d.rectangle([X0, Y0, X1, Y1], outline=(255, 0, 0, 255), width=2)
    d.rectangle([0, TH - 30, TW, TH], fill=(0, 0, 0, 220))
    d.text((4, TH - 28), f"{it['f']} {it.get('tag','')}  crop x[{nx0:.4f},{nx1:.4f}] y[{ny0:.4f},{ny1:.4f}]",
           fill=(255, 255, 0, 255), font=font)
    p = os.path.join(od, f"bz_{it['f']}.jpg")
    tile.save(p, quality=95)
    print(p)
