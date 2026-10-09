"""Build a labelled montage of downscaled frames for quick object location."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

src, out, first, last, cols, cw = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
ch = int(round(cw * 672 / 1216))
rows = (last - first + cols) // cols
sheet = Image.new("RGB", (cols * cw, rows * (ch + 16)), (20, 20, 20))
d = ImageDraw.Draw(sheet, "RGBA")
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 12)
except Exception:
    font = ImageFont.load_default()
for i, n in enumerate(range(first, last + 1)):
    p = os.path.join(src, "f%03d.jpg" % n)
    im = Image.open(p).convert("RGB").resize((cw, ch), Image.LANCZOS)
    # 10% grid in cell pixels
    for k in range(1, 10):
        d.line([(i % cols * cw + k * cw / 10, i // cols * (ch + 16)),
                (i % cols * cw + k * cw / 10, i // cols * (ch + 16) + ch)], fill=(255, 0, 0, 120))
        d.line([(i % cols * cw, i // cols * (ch + 16) + k * ch / 10),
                (i % cols * cw + cw, i // cols * (ch + 16) + k * ch / 10)], fill=(0, 120, 255, 120))
    sheet.paste(im, (i % cols * cw, i // cols * (ch + 16)))
    d.text((i % cols * cw + 3, i // cols * (ch + 16) + ch + 1), "t=%.2f" % ((n - 1) * 0.25), fill=(255, 255, 0, 255), font=font)
sheet.save(out, quality=92)
print(out, sheet.size)
