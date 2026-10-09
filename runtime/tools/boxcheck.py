"""Draw the calibrated boxes from an analysis JSON onto zoomed frame crops.

Usage:
  python boxcheck.py <analysis.json> <trackId> <cols> <halfW> <halfH> <scale> <out.png> <t0> <t1> ...

halfW/halfH are the crop half-size in normalized units around each box centre.
Frames come from the fps=8 extraction in runtime\\calib\\_full (dNNN.jpg).
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ana = json.load(open(sys.argv[1], encoding="utf-8"))
tid = sys.argv[2]
cols = int(sys.argv[3])
hw, hh = float(sys.argv[4]), float(sys.argv[5])
scale = float(sys.argv[6])
out = sys.argv[7]
times = [float(v) for v in sys.argv[8:]]

samples = []
for tr in ana["tracks"]:
    if tr["id"] != tid:
        continue
    for seg in tr["segments"]:
        samples += seg["samples"]
samples.sort(key=lambda s: s["timeSec"])

try:
    font = ImageFont.truetype("arial.ttf", 12)
    fontb = ImageFont.truetype("arialbd.ttf", 20)
except Exception:
    font = fontb = ImageFont.load_default()

D = Path(r"C:\Users\64576\Desktop\视界\runtime\calib\_full")
cells = []
for t in times:
    s = min(samples, key=lambda q: abs(q["timeSec"] - t))
    b = s["box"]
    cx, cy = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    nx0, ny0 = max(0.0, cx - hw), max(0.0, cy - hh)
    nx1, ny1 = min(1.0, cx + hw), min(1.0, cy + hh)
    fi = int(round(s["timeSec"] * 8)) + 1
    im = Image.open(D / f"d{fi:03d}.jpg").convert("RGB")
    W, H = im.size
    c = im.crop((int(nx0 * W), int(ny0 * H), int(nx1 * W), int(ny1 * H)))
    c = c.resize((int(c.size[0] * scale), int(c.size[1] * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    for k in range(int(nx0 / 0.005), int(nx1 / 0.005) + 2):
        x = (k * 0.005 - nx0) * W * scale
        d.line([(x, 0), (x, c.size[1])], fill=(0, 220, 255), width=1)
    for k in range(int(ny0 / 0.005), int(ny1 / 0.005) + 2):
        y = (k * 0.005 - ny0) * H * scale
        d.line([(0, y), (c.size[0], y)], fill=(0, 220, 255), width=1)
    for k in range(int(nx0 / 0.01), int(nx1 / 0.01) + 2):
        x = (k * 0.01 - nx0) * W * scale
        d.line([(x, 0), (x, c.size[1])], fill=(255, 0, 0), width=1)
        d.text((x + 2, 2), f"{k * 0.01:.2f}", fill=(255, 255, 0), font=font)
    for k in range(int(ny0 / 0.01), int(ny1 / 0.01) + 2):
        y = (k * 0.01 - ny0) * H * scale
        d.line([(0, y), (c.size[0], y)], fill=(255, 0, 0), width=1)
        d.text((2, y + 1), f"{k * 0.01:.2f}", fill=(255, 255, 0), font=font)
    x0 = (b["x"] - nx0) * W * scale
    y0 = (b["y"] - ny0) * H * scale
    x1 = (b["x"] + b["width"] - nx0) * W * scale
    y1 = (b["y"] + b["height"] - ny0) * H * scale
    d.rectangle([x0, y0, x1, y1], outline=(255, 0, 0), width=3)
    d.rectangle([0, c.size[1] - 26, c.size[0], c.size[1]], fill=(0, 0, 0))
    d.text((6, c.size[1] - 24), f"t={s['timeSec']:.2f}s  "
           f"w={b['width'] * W:.0f}px h={b['height'] * H:.0f}px",
           fill=(255, 255, 0), font=fontb)
    cells.append(c)

rows = (len(cells) + cols - 1) // cols
cw = max(c.size[0] for c in cells)
ch = max(c.size[1] for c in cells)
sheet = Image.new("RGB", (cols * cw, rows * ch), (0, 0, 0))
for i, c in enumerate(cells):
    sheet.paste(c, ((i % cols) * cw, (i // cols) * ch))
sheet.save(out)
print(f"{out} {sheet.size} cells={len(cells)}")
