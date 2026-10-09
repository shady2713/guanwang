"""Build 2x2 grid-overlay contact sheets from calibration frames.

Usage: python gridsheet.py <videoDir> <outDir> <cellWidth>
Frame files are t01..t20 at 0.5s spacing (t = (n-1)*0.5).
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

src, out, cell = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(out, exist_ok=True)
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 13)
except Exception:
    font = ImageFont.load_default()

files = sorted(f for f in os.listdir(src) if f.lower().endswith((".jpg", ".png")))
CW = cell
CH = None
sheets = []
for i, f in enumerate(files):
    im = Image.open(os.path.join(src, f)).convert("RGB")
    if CH is None:
        CH = int(round(im.height * CW / im.width))
        CH -= CH % 2
    im = im.resize((CW, CH), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for p in range(0, 101, 5):
        x = int(CW * p / 100)
        y = int(CH * p / 100)
        major = (p % 10 == 0)
        col = (255, 0, 0) if major else (255, 170, 0)
        d.line([(x, 0), (x, CH)], fill=col, width=1 if major else 1)
        d.line([(0, y), (CW, y)], fill=col, width=1 if major else 1)
        if major and p < 100:
            d.text((x + 2, 1), f"{p}", fill=(255, 0, 0), font=font)
            d.text((2, y + 1), f"{p}", fill=(0, 90, 255), font=font)
    t = round((i) * 0.5, 2)
    label = f"#{i+1}  t={t:.2f}s"
    d.rectangle([0, CH - 20, 8 + 7 * len(label), CH], fill=(0, 0, 0))
    d.text((4, CH - 18), label, fill=(255, 255, 255), font=font)
    sheets.append(im)

per = 4
for s in range(0, len(sheets), per):
    chunk = sheets[s:s + per]
    W = CW * 2
    H = CH * 2
    sheet = Image.new("RGB", (W, H), (20, 20, 20))
    for j, im in enumerate(chunk):
        sheet.paste(im, ((j % 2) * CW, (j // 2) * CH))
    name = os.path.join(out, f"sheet_{s // per:02d}_t{0.0 if s == 0 else s * 0.5:.2f}.jpg")
    sheet.save(name, quality=88)
    print(name)