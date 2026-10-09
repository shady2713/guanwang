"""Measure the left edge of the carriageway per row, to keep the region on the road.

The van drives in the leftmost lane, next to a grass strip. The boundary between
the grass and the asphalt is a strong green->grey transition, so scanning a row
from the right and taking the last green pixel gives the road edge. The region is
then pinned to that edge, which is exactly the constraint the homography fit could
not guarantee on its own.

usage: road_edge.py <frameDir> [first] [last]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def road_edge(array: np.ndarray, y: int, x_from: int, x_to: int, run: int = 24) -> int | None:
    """First green->asphalt transition on the row: that is the left edge of the road."""
    row = array[y]
    green = (row[:, 1].astype(int) - row[:, 0] > 10) & (row[:, 1].astype(int) - row[:, 2] > 10)
    green &= row[:, 1] > 60
    for x in range(x_from, x_to - run):
        if not green[x]:
            continue
        if not green[x + 1 : x + 1 + run].any():
            return x
    return None


def main() -> int:
    frame_dir = Path(sys.argv[1])
    first = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    last = int(sys.argv[3]) if len(sys.argv) > 3 else 61
    for index in range(first, last + 1, 3):
        path = frame_dir / f"f{index:03d}.png"
        if not path.exists():
            continue
        array = np.asarray(Image.open(path).convert("RGB"))
        height, width = array.shape[:2]
        rows = []
        for y_norm in (0.50, 0.55, 0.60, 0.65, 0.70, 0.75):
            y = int(y_norm * height)
            edge = road_edge(array, y, int(0.60 * width), int(0.99 * width))
            rows.append(f"y={y_norm:.2f}:{'-' if edge is None else round(edge / width, 3)}")
        print(f"f{index:03d} t={(index - 1) / 24:.2f} " + " ".join(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
