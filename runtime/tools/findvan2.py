"""Locate the blue box van in the industry clip by colour, frame by frame.

The van is the only strongly blue vehicle in the shot, so an HSV threshold plus
connected-component clustering gives a trackable candidate that can then be
checked by eye. Output is JSON on stdout: one entry per frame with the box in
normalized encoded-frame coordinates.

usage: findvan.py <frameDir> <outJson> [firstFrame] [lastFrame]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def blue_mask(array: np.ndarray) -> np.ndarray:
    """Pixels whose blue channel dominates and is saturated enough to be paint."""
    r = array[:, :, 0].astype(np.int16)
    g = array[:, :, 1].astype(np.int16)
    b = array[:, :, 2].astype(np.int16)
    return (b - r > 38) & (b - g > 12) & (b > 70)


def components(mask: np.ndarray, min_pixels: int = 25, min_x: float = 0.0) -> list[dict]:
    """4-connected components as bounding boxes, largest first (union-find scan)."""
    height, width = mask.shape
    # The sky fills the top band of the frame; road-level objects are what we track.
    mask = mask.copy()
    mask[: int(height * 0.35), :] = False
    if min_x > 0:
        mask[:, : int(width * min_x)] = False
    labels = np.zeros((height, width), dtype=np.int32)
    parent: list[int] = [0]

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    next_label = 1
    for y in range(height):
        row = mask[y]
        for x in range(width):
            if not row[x]:
                continue
            left = labels[y, x - 1] if x > 0 else 0
            up = labels[y - 1, x] if y > 0 else 0
            if left and up:
                labels[y, x] = min(left, up)
                union(left, up)
            elif left or up:
                labels[y, x] = left or up
            else:
                labels[y, x] = next_label
                parent.append(next_label)
                next_label += 1
    roots = np.array([find(i) for i in range(next_label)])
    flat = roots[labels.ravel()]
    boxes: dict[int, list[int]] = {}
    ys, xs = np.nonzero(labels)
    for y, x in zip(ys.tolist(), xs.tolist()):
        key = int(flat[y * width + x])
        if key == 0:
            continue
        box = boxes.setdefault(key, [x, y, x, y, 0])
        box[0], box[1] = min(box[0], x), min(box[1], y)
        box[2], box[3] = max(box[2], x), max(box[3], y)
        box[4] += 1
    found = [b for b in boxes.values() if b[4] >= min_pixels]
    # A vehicle-sized blob: not a wide band (trees, shadows) and not a speck.
    found = [b for b in found if 0.0004 <= ((b[2] - b[0] + 1) * (b[3] - b[1] + 1)) / (width * height) <= 0.02]
    found.sort(key=lambda b: -b[4])
    return [
        {"x0": b[0], "y0": b[1], "x1": b[2], "y1": b[3], "pixels": b[4]} for b in found
    ]


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
        array = np.asarray(image)
        boxes = components(blue_mask(array), min_x=0.45)
        width, height = image.size
        results.append(
            {
                "frame": index,
                "timeSec": round((index - 1) / 24, 4),
                "candidates": [
                    {
                        "pixels": b["pixels"],
                        "x0": round(b["x0"] / width, 5),
                        "y0": round(b["y0"] / height, 5),
                        "x1": round((b["x1"] + 1) / width, 5),
                        "y1": round((b["y1"] + 1) / height, 5),
                    }
                    for b in boxes[:3]
                ],
            }
        )
    out_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
    for entry in results:
        if entry["candidates"]:
            best = entry["candidates"][0]
            print(
                f"f{entry['frame']:03d} t={entry['timeSec']:.2f} "
                f"n={len(entry['candidates'])} best={best['x0']:.3f},{best['y0']:.3f}"
                f"->{best['x1']:.3f},{best['y1']:.3f} px={best['pixels']}"
            )
        else:
            print(f"f{entry['frame']:03d} t={entry['timeSec']:.2f} none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
