"""Zoom into a normalized region of a frame with a fine labeled grid.

Usage:
  python zoom.py <frame.jpg> <nx0> <ny0> <nx1> <ny1> <out.png> [--scale N]

nx* are normalized 0..1 coords of the ENCODED frame (x right, y down).
The output has a grid every 0.005 normalized (minor) with labels every
0.01 normalized (major), so boxes can be read straight off the image.
"""
import sys
from PIL import Image, ImageDraw, ImageFont


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    scale = 6
    for a in sys.argv[1:]:
        if a.startswith("--scale"):
            scale = int(sys.argv[sys.argv.index(a) + 1])
    frame, nx0, ny0, nx1, ny1, out = args[:6]
    nx0, ny0, nx1, ny1 = (float(v) for v in (nx0, ny0, nx1, ny1))
    im = Image.open(frame).convert("RGB")
    W, H = im.size
    px0, py0 = int(round(nx0 * W)), int(round(ny0 * H))
    px1, py1 = int(round(nx1 * W)), int(round(ny1 * H))
    crop = im.crop((px0, py0, px1, py1))
    cw, ch = crop.size
    z = crop.resize((cw * scale, ch * scale), Image.LANCZOS)
    d = ImageDraw.Draw(z)
    try:
        font = ImageFont.truetype("arial.ttf", 11)
    except Exception:
        font = ImageFont.load_default()

    def to_px(nx, ny):
        return ((nx - nx0) * W * scale, (ny - ny0) * H * scale)

    minor = 0.005
    k = int(nx0 / minor)
    while k * minor <= nx1 + 1e-9:
        nx = k * minor
        x, _ = to_px(nx, 0)
        d.line([(x, 0), (x, z.size[1])], fill=(0, 200, 255), width=1)
        k += 1
    k = int(ny0 / minor)
    while k * minor <= ny1 + 1e-9:
        ny = k * minor
        _, y = to_px(0, ny)
        d.line([(0, y), (z.size[0], y)], fill=(0, 200, 255), width=1)
        k += 1
    major = 0.01
    for i in range(int(nx0 / major), int(nx1 / major) + 2):
        nx = i * major
        x, _ = to_px(nx, 0)
        d.line([(x, 0), (x, z.size[1])], fill=(255, 0, 0), width=1)
        d.text((x + 2, 2), f"{nx:.2f}", fill=(255, 255, 0), font=font)
    for i in range(int(ny0 / major), int(ny1 / major) + 2):
        ny = i * major
        _, y = to_px(0, ny)
        d.line([(0, y), (z.size[0], y)], fill=(255, 0, 0), width=1)
        d.text((2, y + 1), f"{ny:.2f}", fill=(255, 255, 0), font=font)
    z.save(out)
    print(f"{frame} size={W}x{H} crop_px=({px0},{py0})-({px1},{py1}) -> {out} {z.size}")


if __name__ == "__main__":
    main()
