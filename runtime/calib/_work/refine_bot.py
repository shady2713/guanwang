import json
import numpy as np
from PIL import Image

boxes = json.load(open("boxes_final.json"))
for t in ["6.00", "6.25", "6.50", "6.75", "7.00", "7.25", "7.50", "7.75",
          "8.00", "8.25", "8.50", "8.75", "9.00", "9.25", "9.50", "9.75"]:
    n = int(round(float(t) / 0.25)) + 1
    a = np.asarray(Image.open("image-search/f%03d.jpg" % n).convert("RGB")).astype(int)
    r, g, bl = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    lum = (r * 299 + g * 587 + bl * 114) // 1000
    sat = np.maximum(np.maximum(r, g), bl) - np.minimum(np.minimum(r, g), bl)
    soft = (lum >= 92) & (sat <= 80)
    L, T, R, B = boxes[t]
    iL, iR = L + 8, R - 7
    need = 0.55 * (iR - iL)
    bot, prof = B, []
    for y in range(B, min(672, B + 30)):
        c = int(soft[y, iL:iR + 1].sum())
        prof.append((y, c))
        if c >= need:
            bot = y
    print(t, "corebot", B, "-> bot", bot, "| prof", prof[:18])
