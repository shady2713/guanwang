"""Chain-detect the road dashes frame by frame with a tight motion gate.

Template matching on 8px-tall dashes proved unreliable, but the per-frame image
motion is only a few pixels while dashes sit tens of pixels apart, so a gated
nearest-neighbour chain is enough and cannot drift onto a neighbour.

usage: chain_dashes.py <frameDir> <outJson> [first] [last]
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

GATE_PX = 9
MIN_LINK = 12


def road_mask(array: np.ndarray) -> np.ndarray:
    arr = array.astype(np.float32) / 255.0
    high = arr.max(axis=2)
    low = arr.min(axis=2)
    sat = np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0.0)
    return (high > 0.62) & (sat < 0.18)


def blobs(mask: np.ndarray, min_pixels: int = 20) -> list[tuple[float, float, float, float]]:
    height, width = mask.shape
    seen = np.zeros_like(mask)
    out: list[tuple[float, float, float, float]] = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if seen[sy, sx]:
            continue
        queue = deque([(sx, sy)])
        seen[sy, sx] = True
        pixels = []
        while queue:
            x, y = queue.popleft()
            pixels.append((x, y))
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((nx, ny))
        if len(pixels) < min_pixels:
            continue
        px = [p[0] for p in pixels]
        py = [p[1] for p in pixels]
        w = max(px) - min(px) + 1
        h = max(py) - min(py) + 1
        if not (2.0 <= max(w, h) / min(w, h) <= 14.0):
            continue
        if not (6 <= max(w, h) <= 100 and 2 <= min(w, h) <= 16):
            continue
        out.append((sum(px) / len(px), sum(py) / len(py), float(w), float(h)))
    return out


def main() -> int:
    frame_dir = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    last = int(sys.argv[4]) if len(sys.argv) > 4 else 132

    per_frame: dict[int, list] = {}
    width = height = 0
    for index in range(first, last + 1):
        path = frame_dir / f"f{index:03d}.png"
        if not path.exists():
            continue
        image = Image.open(path).convert("RGB")
        width, height = image.size
        mask = road_mask(np.asarray(image))
        mask[:, : int(width * 0.62)] = False
        mask[: int(height * 0.30), :] = False
        found = blobs(mask)
        per_frame[index] = found
        print(f"f{index:03d}: {len(found)} blobs")

    tracks: list[list] = []
    used: dict[int, set[int]] = {i: set() for i in per_frame}
    for index in sorted(per_frame):
        for slot, (cx, cy, w, h) in enumerate(per_frame[index]):
            if slot in used[index]:
                continue
            path_points = [(index, cx, cy, w, h)]
            px, py = cx, cy
            for nxt in sorted(per_frame):
                if nxt <= index:
                    continue
                best, best_d = None, 1e9
                for slot2, (qx, qy, qw, qh) in enumerate(per_frame[nxt]):
                    if slot2 in used[nxt]:
                        continue
                    d = (qx - px) ** 2 + (qy - py) ** 2
                    if d < best_d:
                        best, best_d = slot2, d
                if best is None or best_d > GATE_PX * GATE_PX:
                    break
                used[nxt].add(best)
                qx, qy, qw, qh = per_frame[nxt][best]
                path_points.append((nxt, qx, qy, qw, qh))
                px, py = qx, qy
            if len(path_points) >= MIN_LINK:
                for frame, _, _, _, _ in path_points:
                    pass
                tracks.append(path_points)
    tracks.sort(key=len, reverse=True)
    print(f"tracks: {len(tracks)}  longest: {len(tracks[0]) if tracks else 0}")
    serialised = [
        [
            {"frame": f, "x": round(x / width, 5), "y": round(y / height, 5), "w": round(w, 2), "h": round(h, 2)}
            for f, x, y, w, h in points
        ]
        for points in tracks
    ]
    Path(out_path).write_text(json.dumps(serialised, indent=1), encoding="utf-8")
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
