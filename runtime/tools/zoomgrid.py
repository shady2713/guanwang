"""Build 2x2 contact sheets of zoomed, gridded crops for coordinate reading.

Usage:
  python zoomgrid.py <framesDir> <outDir> <spec.json> [--cell 620]
spec.json = {"step": 0.01, "scale": 4,
             "items": [{"f": "d001", "cx": 0.83, "cy": 0.72, "hw": 0.06, "hh": 0.06, "tag": "van"}]}
Output: sheet_00.jpg, sheet_01.jpg, ...
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

argv = sys.argv[1:]
cell = 620
if "--cell" in argv:
    i = argv.index("--cell"); cell = int(argv[i + 1]); del argv[i:i + 2]
fd, od, spec_path = argv[0], argv[1], argv[2]
os.makedirs(od, exist_ok=True)
S = json.load(open(spec_path, "r", encoding="utf-8"))
step = S.get("step", 0.01)
scale = S.get("scale", 4)
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 13)
except Exception:
    font = ImageFont.load_default()

tiles = []
for it in S["items"]:
    base = os.path.join(fd, it["f"])
    src = next(p for p in (base + ".png", base + ".jpg") if os.path.exists(p))
    im = Image.open(src).convert("RGB")
    W, H = im.size
    cx, cy, hw, hh = it["cx"], it["cy"], it["hw"], it["hh"]
    x0 = max(0, int(round((cx - hw) * W))); x1 = min(W, int(round((cx + hw) * W)))
    y0 = max(0, int(round((cy - hh) * H))); y1 = min(H, int(round((cy + hh) * H)))
    crop = im.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    step = it.get("step", S.get("step", 0.01))
    z = it.get("scale", S.get("scale", 4))
    big = crop.resize((cw * z, ch * z), Image.LANCZOS)
    d = ImageDraw.Draw(big, "RGBA")
    nx0, nx1, ny0, ny1 = x0 / W, x1 / W, y0 / H, y1 / H
    v = nx0
    while v <= nx1 + 1e-9:
        px = int(round((v - nx0) / (nx1 - nx0) * cw * z))
        d.line([(px, 0), (px, ch * z)], fill=(255, 0, 0, 110), width=1)
        d.text((px + 2, 2), f"{v:.3f}", fill=(255, 0, 0, 255), font=font)
        v += step
    v = ny0
    while v <= ny1 + 1e-9:
        py = int(round((v - ny0) / (ny1 - ny0) * ch * z))
        d.line([(0, py), (cw * z, py)], fill=(0, 60, 255, 110), width=1)
        d.text((2, py + 1), f"{v:.3f}", fill=(0, 60, 255, 255), font=font)
        v += step
    tag = it.get("tag", "")
    d.rectangle([0, ch * z - 22, cw * z, ch * z], fill=(0, 0, 0, 210))
    d.text((4, ch * z - 20), f"{it['f']}  {tag}", fill=(255, 255, 0, 255), font=font)
    tiles.append(big)

TW = max(t.width for t in tiles); TH = max(t.height for t in tiles)
for s in range(0, len(tiles), 4):
    chunk = tiles[s:s + 4]
    rows = (len(chunk) + 1) // 2
    sheet = Image.new("RGB", (TW * 2, TH * rows), (16, 16, 16))
    for j, t in enumerate(chunk):
        sheet.paste(t, ((j % 2) * TW, (j // 2) * TH))
    p = os.path.join(od, f"sheet_{s//4:02d}.jpg")
    sheet.save(p, quality=93)
    print(p, sheet.size)
