"""Crop a region from a frame and upscale with a pixel grid + normalized labels.

Usage:
  python zoomcrop.py <frame.jpg> <out.jpg> <cx> <cy> <halfW> <halfH> [--scale 4]
cx, cy = centre in NORMALIZED 0..1 encoded coords; halfW/halfH in normalized units too.
Draws a grid every 0.01 normalized (or a chosen step) plus corner readouts.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

argv = sys.argv[1:]
scale = 4
if "--scale" in argv:
    i = argv.index("--scale")
    scale = int(argv[i + 1])
    del argv[i:i + 2]
step = 0.01
if "--step" in argv:
    i = argv.index("--step")
    step = float(argv[i + 1])
    del argv[i:i + 2]

src, out = argv[0], argv[1]
cx, cy, hw, hh = [float(v) for v in argv[2:6]]

im = Image.open(src).convert("RGB")
W, H = im.size
x0 = int(round((cx - hw) * W))
x1 = int(round((cx + hw) * W))
y0 = int(round((cy - hh) * H))
y1 = int(round((cy + hh) * H))
x0 = max(0, x0); y0 = max(0, y0); x1 = min(W, x1); y1 = min(H, y1)
crop = im.crop((x0, y0, x1, y1))
cw, ch = crop.size
z = max(1, int(round(scale * min(cw / (hw * 2 * W), 1.0))))
z = scale
os.makedirs(os.path.dirname(out), exist_ok=True)
big = crop.resize((cw * z, ch * z), Image.LANCZOS)
d = ImageDraw.Draw(big, "RGBA")
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", max(9, 10 * z // 2))
except Exception:
    font = ImageFont.load_default()

nx0, nx1 = x0 / W, x1 / W
ny0, ny1 = y0 / H, y1 / H
v = nx0
while v <= nx1 + 1e-9:
    px = int(round((v - nx0) / (nx1 - nx0) * (cw * z)))
    d.line([(px, 0), (px, ch * z)], fill=(255, 0, 0, 90), width=1)
    d.text((px + 2, 2), f"{v:.3f}", fill=(255, 0, 0, 255), font=font)
    v += step
v = ny0
while v <= ny1 + 1e-9:
    py = int(round((v - ny0) / (ny1 - ny0) * (ch * z)))
    d.line([(0, py), (cw * z, py)], fill=(0, 0, 255, 90), width=1)
    d.text((2, py + 1), f"{v:.3f}", fill=(0, 0, 255, 255), font=font)
    v += step
big.save(out, quality=95)
print(f"{out}  crop_px=({x0},{y0})-({x1},{y1}) of {W}x{H}  scale={z}")
