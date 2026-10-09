"""Measure the full box van (white body + blue rear doors) in the industry clip.

The blue rear doors are a reliable anchor: HSV colour segmentation finds them in
every frame. The rest of the van is white bodywork, so the full box is the
connected component of "van paint" (saturated blue, or bright neutral white)
that contains the anchor, grown inside a window around it. Road, lane markings
and sidewalk are darker or less saturated and drop out.

usage: vanbox.py <frameDir> <outJson> [first] [last]
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def masks(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    arr = rgb.astype(np.float32) / 255.0
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    high = np.max(arr, axis=2)
    low = np.min(arr, axis=2)
    sat = np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0.0)
    blue = (b - r > 0.15) & (b - g > 0.05) & (b > 0.28)
    white = (high > 0.72) & (sat < 0.18)
    return blue, white


def component_within(mask: np.ndarray, ax: int, ay: int, window: int) -> tuple[int, int, int, int] | None:
    height, width = mask.shape
    x0, x1 = max(0, ax - window), min(width, ax + window + 1)
    y0, y1 = max(0, ay - window), min(height, ay + window + 1)
    if not (x0 <= ax < x1 and y0 <= ay < y1) or not mask[ay, ax]:
        return None
    seen = np.zeros_like(mask)
    queue = deque([(ax, ay)])
    seen[ay, ax] = True
    bx0, by0, bx1, by1 = ax, ay, ax, ay
    while queue:
        x, y = queue.popleft()
        bx0, by0, bx1, by1 = min(bx0, x), min(by0, y), max(bx1, x), max(by1, y)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if x0 <= nx < x1 and y0 <= ny < y1 and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((nx, ny))
    return bx0, by0, bx1, by1


def main() -> int:
    frame_dir = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    last = int(sys.argv[4]) if len(sys.argv) > 4 else 144
    results = []
    for index in range(first, last + 1):
        path = frame_dir / f"f{index:03d}.png"
        if not path.exists():
            continue
        image = Image.open(path).convert("RGB")
        width, height = image.size
        blue, white = masks(np.asarray(image))
        # Sky and building glass are blue and bright too. The van is never above
        # 0.35 of the frame height nor left of 0.45 of its width.
        blue[: int(height * 0.35), :] = False
        blue[:, : int(width * 0.45)] = False
        # Sky and building glass are also bright; the van never rises above 0.4.
        white[: int(height * 0.4), :] = False
        ys, xs = np.nonzero(blue)
        entry: dict = {"frame": index, "timeSec": round((index - 1) / 24, 4)}
        if len(xs) == 0:
            results.append(entry)
            continue
        # Anchor: the median of the blue pixels, robust against stray specks.
        ax, ay = int(np.median(xs)), int(np.median(ys))
        blue_box = component_within(blue, ax, ay, 60)
        if blue_box is None:
            results.append(entry)
            continue
        cx, cy = (blue_box[0] + blue_box[2]) // 2, (blue_box[1] + blue_box[3]) // 2
        van_mask = blue | white
        full = component_within(van_mask, cx, cy, 70)
        entry["anchor"] = [round(ax / width, 5), round(ay / height, 5)]
        if full:
            entry["box"] = [
                round(full[0] / width, 5),
                round(full[1] / height, 5),
                round((full[2] + 1) / width, 5),
                round((full[3] + 1) / height, 5),
            ]
            entry["size"] = [full[2] - full[0] + 1, full[3] - full[1] + 1]
        results.append(entry)
    out_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
    for entry in results:
        if "box" in entry:
            x0, y0, x1, y1 = entry["box"]
            print(
                f"f{entry['frame']:03d} t={entry['timeSec']:.2f} "
                f"box={x0:.3f},{y0:.3f}->{x1:.3f},{y1:.3f} px={entry['size'][0]}x{entry['size'][1]}"
            )
        else:
            print(f"f{entry['frame']:03d} t={entry['timeSec']:.2f} none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
