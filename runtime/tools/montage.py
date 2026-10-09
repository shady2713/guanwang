"""Tile cropped regions from several frames into one labeled, gridded sheet.

Usage:
  python montage.py <out.png> <cols> <nx0> <ny0> <nx1> <ny1> <scale> f1 f2 ...

Frames are named dNNN.jpg from an fps=8 extraction of the source clip, so
each cell is labeled with t=(NNN-1)/8 seconds. Red lines + yellow numbers are
the 0.01 normalized grid (minor cyan lines every 0.005).
"""
import sys
import os
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
cols = int(sys.argv[2])
nx0, ny0, nx1, ny1 = (float(v) for v in sys.argv[3:7])
scale = float(sys.argv[7])
frames = sys.argv[8:]

try:
    font = ImageFont.truetype("arial.ttf", 13)
    fontb = ImageFont.truetype("arialbd.ttf", 22)
except Exception:
    font = fontb = ImageFont.load_default()

cells = []
for f in frames:
    im = Image.open(f).convert("RGB")
    W, H = im.size
    c = im.crop((int(nx0 * W), int(ny0 * H), int(nx1 * W), int(ny1 * H)))
    c = c.resize((int(c.size[0] * scale), int(c.size[1] * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(c)

    def to_px(nx, ny):
        return ((nx - nx0) * W * scale, (ny - ny0) * H * scale)

    k = int(nx0 / 0.005)
    while k * 0.005 <= nx1 + 1e-9:
        x, _ = to_px(k * 0.005, 0)
        d.line([(x, 0), (x, c.size[1])], fill=(0, 220, 255), width=1)
        k += 1
    k = int(ny0 / 0.005)
    while k * 0.005 <= ny1 + 1e-9:
        _, y = to_px(0, k * 0.005)
        d.line([(0, y), (c.size[0], y)], fill=(0, 220, 255), width=1)
        k += 1
    for i in range(int(nx0 / 0.01), int(nx1 / 0.01) + 2):
        x, _ = to_px(i * 0.01, 0)
        d.line([(x, 0), (x, c.size[1])], fill=(255, 0, 0), width=1)
        d.text((x + 2, 2), f"{i * 0.01:.2f}", fill=(255, 255, 0), font=font)
    for i in range(int(ny0 / 0.01), int(ny1 / 0.01) + 2):
        _, y = to_px(0, i * 0.01)
        d.line([(0, y), (c.size[0], y)], fill=(255, 0, 0), width=1)
        d.text((2, y + 1), f"{i * 0.01:.2f}", fill=(255, 255, 0), font=font)
    d.rectangle([0, c.size[1] - 28, c.size[0], c.size[1]], fill=(0, 0, 0))
    try:
        d.text((6, c.size[1] - 25),
               f"t={(int(os.path.basename(f)[1:4]) - 1) / 8:.3f}s",
               fill=(255, 255, 0), font=fontb)
    except Exception:
        d.text((6, c.size[1] - 25), os.path.basename(f), fill=(255, 255, 0), font=fontb)
    cells.append(c)

rows = (len(cells) + cols - 1) // cols
cw = max(c.size[0] for c in cells)
ch = max(c.size[1] for c in cells)
sheet = Image.new("RGB", (cols * cw, rows * ch), (0, 0, 0))
for i, c in enumerate(cells):
    sheet.paste(c, ((i % cols) * cw, (i // cols) * ch))
sheet.save(out)
print(f"{out} {sheet.size} cells={len(cells)}")
