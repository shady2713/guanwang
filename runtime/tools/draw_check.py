"""Draw candidate boxes/regions on calibrated frames so they can be checked by eye.

usage: draw_check.py <frameDir> <specJson> <outPng> [--cols 1]
spec.json: {"items":[{"f":"f049","box":[x0,y0,x1,y1],"quad":[[x,y],...],"tag":"t=2.00"}]}
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> int:
    frame_dir = Path(sys.argv[1])
    spec = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    out = Path(sys.argv[3])
    tiles = []
    for item in spec["items"]:
        src = next(p for p in (frame_dir / f"{item['f']}.png", frame_dir / f"{item['f']}.jpg") if p.exists())
        image = Image.open(src).convert("RGB")
        width, height = image.size
        draw = ImageDraw.Draw(image)
        if item.get("box"):
            x0, y0, x1, y1 = item["box"]
            draw.rectangle([x0 * width, y0 * height, x1 * width, y1 * height], outline=(255, 0, 0), width=3)
        if item.get("quad"):
            quad = [(x * width, y * height) for x, y in item["quad"]]
            draw.line(quad + [quad[0]], fill=(0, 220, 255), width=3)
        draw.text((12, 12), item.get("tag", item["f"]), fill=(255, 0, 0))
        tiles.append(image)
    total = Image.new("RGB", (tiles[0].width, tiles[0].height * len(tiles)))
    for i, tile in enumerate(tiles):
        total.paste(tile, (0, i * tile.height))
    total.save(out, quality=92)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
