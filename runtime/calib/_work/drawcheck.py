"""Draw candidate px boxes on frames and montage zoomed crops for visual check."""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src, out, boxes_json, first, last, cols, pad = (sys.argv[1], sys.argv[2], sys.argv[3],
                                               int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7]))
boxes = json.load(open(boxes_json, encoding="utf-8"))  # {str(timeSec): [x0,y0,x1,y1]}
Z = float(sys.argv[8]) if len(sys.argv) > 8 else 2.5
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 15)
except Exception:
    font = ImageFont.load_default()
tiles = []
for n in range(first, last + 1):
    t = round((n - 1) * 0.25, 2)
    key = None
    for k in boxes:
        if abs(float(k) - t) < 1e-6:
            key = k
    im = Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB")
    d = ImageDraw.Draw(im, "RGBA")
    if key is not None:
        x0, y0, x1, y1 = boxes[key]
        d.rectangle([x0, y0, x1, y1], outline=(255, 0, 0, 255), width=3)
        d.line([(x0 - 8, y0), (x0 + 8, y0)], fill=(0, 255, 255, 255), width=2)
        d.line([(x0, y0 - 8), (x0, y0 + 8)], fill=(0, 255, 255, 255), width=2)
    for gx in range(0, 1217, 50):
        d.line([(gx, 0), (gx, 672)], fill=(255, 255, 0, 70))
    cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
    cx1, cy1 = min(1216, x1 + pad), min(672, y1 + pad)
    crop = im.crop((cx0, cy0, cx1, cy1))
    crop = crop.resize((int(crop.width * Z), int(crop.height * Z)), Image.LANCZOS)
    dd = ImageDraw.Draw(crop, "RGBA")
    for gx in range(cx0 - cx0 % 50 + 50, cx1, 50):
        px = (gx - cx0) * Z
        dd.line([(px, 0), (px, crop.height)], fill=(255, 0, 0, 120))
        dd.text((px + 2, 1), str(gx), fill=(255, 0, 0, 255), font=font)
    for gy in range(cy0 - cy0 % 50 + 50, cy1, 50):
        py = (gy - cy0) * Z
        dd.line([(0, py), (crop.width, py)], fill=(0, 140, 255, 120))
        dd.text((2, py + 1), str(gy), fill=(0, 110, 255, 255), font=font)
    dd.text((4, crop.height - 20), "t=%.2f" % t, fill=(255, 255, 0, 255), font=font)
    tiles.append(crop)
tw = max(t.width for t in tiles)
th = max(t.height for t in tiles)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (tw + 6), rows * (th + 6)), (10, 10, 10))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * (tw + 6), (i // cols) * (th + 6)))
sheet.save(out, quality=94)
print(out, sheet.size)
