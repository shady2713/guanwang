"""Iteratively tighten a predicted box onto the van silhouette.

Each round: crop a window = current box + margin, mask bright-low-sat bodywork
and saturated blue bodywork (grass excluded), keep the component nearest the box
centre, emit its tight bbox. The shrinking window prevents leaking into road.

Usage:
  python refine.py <framesDir> <outDir> <start.json> [rounds] [margin]
start.json = {"d001": [x,y,w,h], ...}
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

fd, od, sp = sys.argv[1], sys.argv[2], sys.argv[3]
rounds = int(sys.argv[4]) if len(sys.argv) > 4 else 3
MARGIN = float(sys.argv[5]) if len(sys.argv) > 5 else 0.006
os.makedirs(od, exist_ok=True)
START = json.load(open(sp, "r", encoding="utf-8"))
BRIGHT, BLUE_D, SAT = 0.63, 22, 0.20
try:
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 12)
except Exception:
    font = ImageFont.load_default()

for fname in sorted(START):
    x, y, w, h = START[fname]
    im = Image.open(os.path.join(fd, fname + ".jpg")).convert("RGB")
    W, H = im.size
    px = im.load()
    hist = []
    for rd in range(rounds):
        x0 = max(0, int(round((x - MARGIN) * W))); x1 = min(W, int(round((x + w + MARGIN) * W)))
        y0 = max(0, int(round((y - MARGIN) * H))); y1 = min(H, int(round((y + h + MARGIN) * H)))
        cand = set()
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                r, g, b = px[xx, yy]
                if g > b + 8:
                    continue
                mx, mn = max(r, g, b), min(r, g, b)
                if (b - r >= BLUE_D and b >= 85) or (mx / 255.0 >= BRIGHT and (mx - mn) / (mx + 1e-6) < SAT):
                    cand.add((xx, yy))
        if len(cand) < 25:
            hist.append("r%d:TOO_FEW(%d)" % (rd, len(cand))); break
        seen = set(); best = None; bestscore = None
        ccx, ccy = (x + w / 2) * W, (y + h / 2) * H
        for p in cand:
            if p in seen:
                continue
            st = [p]; seen.add(p); comp = []
            while st:
                a, c = st.pop(); comp.append((a, c))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        q = (a + dx, c + dy)
                        if q in cand and q not in seen:
                            seen.add(q); st.append(q)
            xs = [p[0] for p in comp]; ys = [p[1] for p in comp]
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            if len(comp) < 0.25 * bw * bh:
                continue                      # thin -> road marking / kerb
            mxp = sum(xs) / len(xs); myp = sum(ys) / len(ys)
            d = ((mxp - ccx) ** 2 + (myp - ccy) ** 2) ** 0.5
            score = len(comp) - 1.2 * d
            if bestscore is None or score > bestscore:
                bestscore = score; best = comp
        if best is None:
            hist.append("r%d:NO_COMP" % rd); break
        xs = [p[0] for p in best]; ys = [p[1] for p in best]
        nx0, ny0 = min(xs) / W, min(ys) / H
        nx1, ny1 = (max(xs) + 1) / W, (max(ys) + 1) / H
        hist.append("r%d:n=%d" % (rd, len(best)))
        x, y, w, h = nx0, ny0, nx1 - nx0, ny1 - ny0
    print(f"{fname}: ({x:.4f},{y:.4f},{w:.4f},{h:.4f})  " + " ".join(hist))
    im2 = im.copy(); d2 = ImageDraw.Draw(im2, "RGBA")
    d2.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline=(255, 0, 255), width=2)
    m = 0.012
    cx0 = max(0, int((x - m) * W)); cx1 = min(W, int((x + w + m) * W))
    cy0 = max(0, int((y - m) * H)); cy1 = min(H, int((y + h + m) * H))
    crop = im2.crop((cx0, cy0, cx1, cy1))
    sc = 8
    big = crop.resize((crop.width * sc, crop.height * sc), Image.LANCZOS)
    db = ImageDraw.Draw(big, "RGBA")
    g = 0.005
    while g <= 1.0:
        if cx0 / W <= g <= cx1 / W:
            pxx = int((g - cx0 / W) * crop.width * sc)
            db.line([(pxx, 0), (pxx, big.height)], fill=(255, 0, 0, 80))
            db.text((pxx + 1, 1), f"{g:.3f}", fill=(255, 0, 0, 255), font=font)
        g += 0.005
    g = 0.005
    while g <= 1.0:
        if cy0 / H <= g <= cy1 / H:
            pyy = int((g - cy0 / H) * crop.height * sc)
            db.line([(0, pyy), (big.width, pyy)], fill=(0, 80, 255, 80))
            db.text((1, pyy + 1), f"{g:.3f}", fill=(0, 80, 255, 255), font=font)
        g += 0.005
    big.save(os.path.join(od, "rf_%s.jpg" % fname), quality=93)
