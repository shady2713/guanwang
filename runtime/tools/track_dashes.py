"""Track the white lane dashes so ground regions can be placed on the road.

The dashes are static in the world, so their image motion *is* the road's image
motion (camera pan plus perspective). Tracking them gives a measured, per-frame
ground transform instead of a guess, which is what the region overlay needs.

Stage 1 (detect): find bright, low-saturation, elongated blobs on the asphalt.
Stage 2 (track): follow each dash with a normalised cross-correlation template
    search inside a window around its previous position.

usage: track_dashes.py <frameDir> <outJson> [first] [last]
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROAD_X_MIN, ROAD_Y_MIN, ROAD_Y_MAX = 0.72, 0.28, 0.86
SEARCH_PX = 16  # per-frame image motion is only a few pixels, so a tight window is fast and safe


def road_mask(array: np.ndarray) -> np.ndarray:
    arr = array.astype(np.float32) / 255.0
    high = arr.max(axis=2)
    low = arr.min(axis=2)
    sat = np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0.0)
    return (high > 0.66) & (sat < 0.16)


def blobs(mask: np.ndarray, min_pixels: int = 24) -> list[dict]:
    height, width = mask.shape
    seen = np.zeros_like(mask)
    out: list[dict] = []
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
        x0, x1, y0, y1 = min(px), max(px), min(py), max(py)
        w, h = x1 - x0 + 1, y1 - y0 + 1
        long_side, short_side = max(w, h), min(w, h)
        if not (2.0 <= long_side / short_side <= 12.0):
            continue
        if not (8 <= long_side <= 90 and 2 <= short_side <= 14):
            continue
        out.append({"x0": x0, "y0": y0, "w": w, "h": h, "pixels": len(pixels), "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2})
    return out


def match_score(patch: np.ndarray, template: np.ndarray) -> tuple[float, int, int]:
    """Best Pearson correlation of template inside patch; returns (score, dy, dx)."""
    th, tw = template.shape
    ph, pw = patch.shape
    if ph < th or pw < tw:
        return -1.0, 0, 0
    t = template - template.mean()
    t = t / (float(np.sqrt(float((t * t).sum()))) or 1.0)  # unit-norm template
    integral = np.zeros((ph + 1, pw + 1))
    integral[1:, 1:] = patch.cumsum(0).cumsum(1)
    integral_sq = np.zeros((ph + 1, pw + 1))
    integral_sq[1:, 1:] = (patch * patch).cumsum(0).cumsum(1)
    area = th * tw
    best, best_y, best_x = -2.0, 0, 0
    for y in range(0, ph - th + 1):
        row_sum = integral[y + th] - integral[y]
        row_sq = integral_sq[y + th] - integral_sq[y]
        for x in range(0, pw - tw + 1):
            mean = (row_sum[x + tw] - row_sum[x]) / area
            sq = (row_sq[x + tw] - row_sq[x]) / area
            var = sq - mean * mean
            if var <= 1e-9:
                continue
            score = float((patch[y : y + th, x : x + tw] * t).sum()) / (np.sqrt(area) * np.sqrt(var))
            if score > best:
                best, best_y, best_x = score, y, x
    return best, best_y, best_x

def main() -> int:
    frame_dir = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    last = int(sys.argv[4]) if len(sys.argv) > 4 else 144
    frames = {}
    for index in range(first, last + 1):
        path = frame_dir / f"f{index:03d}.png"
        if path.exists():
            frames[index] = np.asarray(Image.open(path).convert("L")).astype(np.float64)

    image = Image.open(frame_dir / f"f{first:03d}.png").convert("RGB")
    width, height = image.size
    mask = road_mask(np.asarray(image))
    mask[:, : int(width * ROAD_X_MIN)] = False
    mask[: int(height * ROAD_Y_MIN), :] = False
    mask[int(height * ROAD_Y_MAX) :, :] = False
    candidates = sorted(blobs(mask), key=lambda b: -b["pixels"])
    print(f"seed dashes: {len(candidates)}")
    seeds = candidates[:14]
    for seed in seeds:
        print(f"  ({seed['cx'] / width:.3f},{seed['cy'] / height:.3f}) {seed['w']}x{seed['h']} px={seed['pixels']}")

    tracks: dict[int, list] = {}
    for seed in seeds:
        template = frames[first][seed["y0"] : seed["y0"] + seed["h"], seed["x0"] : seed["x0"] + seed["w"]]
        cx, cy = seed["cx"], seed["cy"]
        path_points = [(first, cx, cy)]
        for index in range(first + 1, last + 1):
            if index not in frames:
                break
            half = SEARCH_PX
            x0 = int(max(0, cx - half - seed["w"]))
            y0 = int(max(0, cy - half - seed["h"]))
            x1 = int(min(width, cx + half))
            y1 = int(min(height, cy + half))
            patch = frames[index][y0:y1, x0:x1]
            score, by, bx = match_score(patch, template)
            if score < 0.55:
                break
            nx, ny = x0 + bx + seed["w"] / 2, y0 + by + seed["h"] / 2
            if abs(nx - cx) > half or abs(ny - cy) > half:
                break
            cx, cy = nx, ny
            path_points.append((index, cx, cy))
        if len(path_points) >= 20:
            tracks[seed["pixels"] * 1000 + seed["x0"]] = path_points
            print(
                f"  track seed({seed['cx'] / width:.3f},{seed['cy'] / height:.3f}) "
                f"len={len(path_points)} end=({cx / width:.3f},{cy / height:.3f})"
            )
    serialised = [
        [{"frame": f, "x": round(x / width, 5), "y": round(y / height, 5)} for f, x, y in points]
        for points in tracks.values()
    ]
    out_path.write_text(json.dumps(serialised, indent=1), encoding="utf-8")
    print(f"wrote {out_path} with {len(serialised)} tracks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
