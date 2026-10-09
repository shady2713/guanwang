"""Zoom + pixel-grid crop helper for hand-calibrating boxes on full-res frames.

Usage:
  python zoom.py out.jpg f025.jpg x0 y0 x1 y1 [--step 20] [--scale 4]
Coordinates are FULL-RES pixels of the 1216x672 encoded frame.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

a = sys.argv[1:]
out, frame = a[0], a[1]
x0, y0, x1, y1 = (int(v) for v in a[2:6])
step = int(a[a.index("--step") + 1]) if "--step" in a else 20
scale = float(a[a.index("--scale") + 1]) if "--scale" in a else 4.0

W, H = 1216, 672
im = Image.open(frame).convert("RGB")
assert im.size == (W, H), im.size
x0, y0 = max(0, x0), max(0, y0)
x1, y1 = min(W, x1), min(H, y1)
crop = im.crop((x0, y0, x1, y1))
cw, ch = crop.size
big = crop.resize((int(cw * scale), int(ch * scale)), Image.NEAREST)
d = ImageDraw.Draw(big, "RGBA")
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 13)
except Exception:
    font = ImageFont.load_default()
sx = scale
gx = x0 - (x0 % step) + (step if x0 % step else 0)
while gx < x1:
    px = (gx - x0) * sx
    d.line([(px, 0), (px, big.height)], fill=(255, 0, 0, 190), width=1)
    d.text((px + 2, 1), str(gx), fill=(255, 0, 0, 255), font=font)
    gx += step
gy = y0 - (y0 % step) + (step if y0 % step else 0)
while gy < y1:
    py = (gy - y0) * sx
    d.line([(0, py), (big.width, py)], fill=(0, 120, 255, 190), width=1)
    d.text((2, py + 1), str(gy), fill=(0, 90, 255, 255), font=font)
    gy += step
d.rectangle([0, 0, big.width - 1, big.height - 1], outline=(255, 255, 0, 255), width=2)
big.save(out, quality=95)
print(out, big.size, "src rect", (x0, y0, x1, y1))
