"""Zoomed montage of a fixed crop rect across frames, with absolute pixel grid."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

src, out, first, last, cols, z = (sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]),
                                 int(sys.argv[5]), float(sys.argv[6]))
x0, y0, x1, y1 = (int(v) for v in sys.argv[7:11])
step = int(sys.argv[11]) if len(sys.argv) > 11 else 10
cw, ch = int((x1 - x0) * z), int((y1 - y0) * z)
lab = 18
rows = (last - first + 1 + cols - 1) // cols
sheet = Image.new("RGB", (cols * (cw + 4), rows * (ch + lab + 4)), (12, 12, 12))
d = ImageDraw.Draw(sheet, "RGBA")
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 13)
except Exception:
    font = ImageFont.load_default()
for i, n in enumerate(range(first, last + 1)):
    im = Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB").crop((x0, y0, x1, y1))
    im = im.resize((cw, ch), Image.NEAREST)
    ox, oy = (i % cols) * (cw + 4), (i // cols) * (ch + lab + 4)
    sheet.paste(im, (ox, oy))
    for gx in range(x0 - x0 % step + step, x1, step):
        d.line([(ox + (gx - x0) * z, oy), (ox + (gx - x0) * z, oy + ch)], fill=(255, 0, 0, 120))
        d.text((ox + (gx - x0) * z + 1, oy + 1), str(gx), fill=(255, 0, 0, 255), font=font)
    for gy in range(y0 - y0 % step + step, y1, step):
        d.line([(ox, oy + (gy - y0) * z), (ox + cw, oy + (gy - y0) * z)], fill=(0, 140, 255, 120))
        d.text((ox + 1, oy + (gy - y0) * z + 1), str(gy), fill=(0, 110, 255, 255), font=font)
    d.text((ox + 2, oy + ch + 1), "t=%.2f" % ((n - 1) * 0.25), fill=(255, 255, 0, 255), font=font)
sheet.save(out, quality=95)
print(out, sheet.size)
