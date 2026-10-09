"""Extract the reference-vehicle.jpg crop from a real frame of the tracked vehicle."""
import json, os
from PIL import Image

W, H = 1216, 672
SRC = r"C:\Users\64576\Desktop\视界\runtime\calib\_work\image-search\f029.jpg"  # t = 7.00s
OUT = r"C:\Users\64576\Desktop\视界\homepage\public\media\reference-vehicle.jpg"

# hand-calibrated px box for 目标 1 at t = 7.00s, plus 8px / 10px padding
x0, y0, x1, y1 = 698, 451, 809, 547
px0, py0, px1, py1 = x0 - 8, y0 - 10, x1 + 8, y1 + 10
px0 = max(px0, 0); py0 = max(py0, 0)
px1 = min(px1, W); py1 = min(py1, H)

crop_rect = {
    "x": round(px0 / W, 5),
    "y": round(py0 / H, 5),
    "width": round((px1 - px0) / W, 5),
    "height": round((py1 - py0) / H, 5),
}
print("crop px rect:", (px0, py0, px1, py1), "size:", px1 - px0, "x", py1 - py0)
print("normalized crop rect:", json.dumps(crop_rect))

im = Image.open(SRC).convert("RGB")
assert im.size == (W, H), im.size
crop = im.crop((px0, py0, px1, py1))
scale = 320.0 / crop.width
crop = crop.resize((320, round(crop.height * scale)), Image.LANCZOS)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
crop.save(OUT, format="JPEG", quality=90, subsampling=1)
print("saved", OUT, crop.size)

with open(r"C:\Users\64576\Desktop\视界\runtime\calib\_work\crop_rect.json", "w", encoding="utf-8") as f:
    json.dump({"sourceFrame": SRC, "timeSec": 7.0, "normalizedCropRect": crop_rect}, f, indent=2)