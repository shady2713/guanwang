"""Find candidate vehicle blobs in the road corridor of each frame.

Locates saturated blue bodywork (the van's rear box) and prints candidate
bounding boxes in NORMALIZED encoded-frame coords, plus a local crop
showing a bright extended box (vehicle body) around each candidate so a
human/agent can confirm identity.
"""
import os, sys, glob, colorsys
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1]
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 11)
except Exception:
    font = ImageFont.load_default()

files = sorted(glob.glob(os.path.join(d, "t*.jpg")))
for idx, f in enumerate(files, start=1):
    im = Image.open(f).convert("RGB")
    W, H = im.size
    px = im.load()
    # blue mask: hue 0.5..0.68 (cyan-blue), decent saturation, mid value
    pts = []
    for y in range(0, H):
        for x in range(0, W):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.50 <= h <= 0.68 and s >= 0.35 and v >= 0.25:
                pts.append((x, y))
    # cluster
    clusters = []
    used = set()
    pset = set(pts)
    for p in pts:
        if p in used:
            continue
        stack = [p]; comp = []
        used.add(p)
        while stack:
            cx, cy = stack.pop(); comp.append((cx, cy))
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    q = (cx + dx, cy + dy)
                    if q in pset and q not in used:
                        used.add(q); stack.append(q)
        clusters.append(comp)
    clusters.sort(key=len, reverse=True)
    keep = [c for c in clusters if len(c) >= 8][:4]
    info = []
    for c in keep:
        xs = [p[0] for p in c]; ys = [p[1] for p in c]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        info.append((x0, y0, x1, y1, len(c)))
    print(f"t{idx:02d} (t={(idx-1)*0.5:.1f}s) {W}x{H}")
    for (x0, y0, x1, y1, n) in info:
        print(f"   blue blob n={n:4d} px=({x0},{y0})-({x1},{y1})  norm=({x0/W:.4f},{y0/H:.4f},{(x1-x0)/W:.4f},{(y1-y0)/H:.4f})")
    # visual: draw each blob box on a copy
    if info:
        im2 = im.copy(); dr = ImageDraw.Draw(im2)
        for (x0, y0, x1, y1, n) in info:
            dr.rectangle([x0, y0, x1, y1], outline=(255, 0, 255), width=1)
        # magnify around largest
        bx0, by0, bx1, by1, _ = info[0]
        m = 6
        cx0 = max(0, bx0 - m * 10); cx1 = min(W, bx1 + m * 10)
        cy0 = max(0, by0 - m * 10); cy1 = min(H, by1 + m * 10)
        crop = im2.crop((cx0, cy0, cx1, cy1))
        z = 6
        big = crop.resize((crop.width * z, crop.height * z), Image.NEAREST)
        db = ImageDraw.Draw(big)
        step = 0.005
        gx = (cx0 / W)
        while gx <= cx1 / W:
            px_ = int((gx - cx0 / W) * crop.width * z)
            db.line([(px_, 0), (px_, big.height)], fill=(255, 0, 0, 80))
            db.text((px_ + 2, 1), f"{gx:.3f}", fill=(255, 0, 0), font=font)
            gx += step
        gy = (cy0 / H)
        while gy <= cy1 / H:
            py_ = int((gy - cy0 / H) * crop.height * z)
            db.line([(0, py_), (big.width, py_)], fill=(0, 0, 255, 80))
            db.text((2, py_ + 1), f"{gy:.3f}", fill=(0, 0, 255), font=font)
            gy += step
        p = os.path.join(out, f"cand_t{idx:02d}.jpg")
        big.save(p, quality=92)
        print("   ->", p, big.size)
