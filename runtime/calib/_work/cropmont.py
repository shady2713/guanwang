"""Montage of a fixed native-resolution crop rect across frames (identity check)."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

src, out, first, last, cols, x0, y0, x1, y1 = (sys.argv[1], sys.argv[2], int(sys.argv[3]),
                                               int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]),
                                               int(sys.argv[7]), int(sys.argv[8]), int(sys.argv[9]))
cw, ch = x1 - x0, y1 - y0
rows = (last - first + 1 + cols - 1) // cols
lab = 18
sheet = Image.new("RGB", (cols * cw, rows * (ch + lab)), (15, 15, 15))
d = ImageDraw.Draw(sheet, "RGBA")
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 14)
except Exception:
    font = ImageFont.load_default()
for i, n in enumerate(range(first, last + 1)):
    im = Image.open(os.path.join(src, "f%03d.jpg" % n)).convert("RGB").crop((x0, y0, x1, y1))
    ox, oy = (i % cols) * cw, (i // cols) * (ch + lab)
    sheet.paste(im, (ox, oy))
    for k in range(0, cw + 1, 50):
        d.line([(ox + k, oy), (ox + k, oy + ch)], fill=(255, 0, 0, 110))
        d.text((ox + k + 1, oy + 1), str(x0 + k), fill=(255, 0, 0, 255), font=font)
    for k in range(0, ch + 1, 50):
        d.line([(ox, oy + k), (ox + cw, oy + k)], fill=(0, 140, 255, 110))
        d.text((ox + 1, oy + k + 1), str(y0 + k), fill=(0, 110, 255, 255), font=font)
    d.text((ox + 2, oy + ch + 1), "t=%.2f" % ((n - 1) * 0.25), fill=(255, 255, 0, 255), font=font)
sheet.save(out, quality=94)
print(out, sheet.size)
