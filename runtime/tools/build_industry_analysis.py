"""Generate the two industry analysis documents from measured data.

Sources
  runtime/calib/_work/van.json   - blue rear-door boxes of the white/blue van
                                  (runtime/tools/findvan2.py), one per frame.
  runtime/calib/_work/dashes.json - lane dash tracks (runtime/tools/track_dashes.py)

The van box is refined from the hand-measured anchors (10 zoom-grid readings,
cross-checked against the automatic door detection), then sampled every 6 frames.

The region is placed with a measured ground transform: the lane dashes are static
in the world, so the homography between the first frame and frame f *is* the
road's image motion. The reference quad is drawn on the van's lane at the
reference second and carried to every sample time through H_f @ inv(H_ref), so the
region stays on the asphalt while the drone pans and flies forward.

usage: build_industry_analysis.py <workDir> <outDir> [vanWindowEndSec]
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

FRAME_RATE = 24.0
ENCODED_W, ENCODED_H = 1264, 640
MEDIA_ID = "industry-v1"
REVIEWED_AT = "2026-05-18"

# Hand-measured whole-vehicle boxes: (timeSec, x0, y0, x1, y1), read on a
# 0.005-normalized zoom grid. The x0 column matches the automatic blue-door
# detection frame for frame, which is what validates these readings.
VAN_ANCHORS = [
    (0.00, 0.788, 0.680, 0.848, 0.790),
    (0.50, 0.820, 0.628, 0.878, 0.725),
    (1.00, 0.845, 0.580, 0.903, 0.680),
    (1.50, 0.862, 0.550, 0.920, 0.645),
    (2.00, 0.877, 0.533, 0.932, 0.607),
    (2.50, 0.888, 0.518, 0.937, 0.587),
    (3.00, 0.897, 0.498, 0.938, 0.558),
    (3.50, 0.903, 0.487, 0.941, 0.543),
    (4.00, 0.908, 0.466, 0.945, 0.522),
    (4.50, 0.911, 0.456, 0.946, 0.509),
]

SAMPLE_STEP_FRAMES = 6
TRACK_END_SEC = 4.51
REFERENCE_SEC = 2.0
REGION_HALF_LEN = 0.030  # along the road, normalized
REGION_HALF_WIDTH = 0.028  # across the lane, normalized
MIN_INSIDE_SEC = 0.4
GRID_STEP_SEC = 0.01


def box_at(time_sec: float) -> dict:
    for i in range(len(VAN_ANCHORS) - 1):
        t0, *b0 = VAN_ANCHORS[i]
        t1, *b1 = VAN_ANCHORS[i + 1]
        if t0 <= time_sec <= t1:
            k = 0.0 if t1 == t0 else (time_sec - t0) / (t1 - t0)
            return [b0[j] + (b1[j] - b0[j]) * k for j in range(4)]
    last = VAN_ANCHORS[-1]
    return list(last[1:])


def contact_px(time_sec: float) -> tuple[float, float]:
    x0, y0, x1, y1 = box_at(time_sec)
    return (x0 + x1) / 2 * ENCODED_W, y1 * ENCODED_H


def unit(ax: float, ay: float) -> tuple[float, float]:
    norm = math.hypot(ax, ay) or 1.0
    return ax / norm, ay / norm


def homographies(dash_tracks: list[list[dict]]) -> dict[int, tuple[np.ndarray, int, float]]:
    """H[f] maps a pixel on the road at frame 1 to the same world point at frame f.

    Returns (matrix, inlierCount, medianReprojectionError) per frame so noisy
    fits can be rejected before the region is fitted.
    """
    frames = sorted({p["frame"] for track in dash_tracks for p in track})
    out: dict[int, tuple[np.ndarray, int, float]] = {}
    for frame in frames:
        src, dst = [], []
        for track in dash_tracks:
            own = {p["frame"]: p for p in track}
            if 1 not in own or frame not in own:
                continue
            a, b = own[1], own[frame]
            src.append([a["x"] * ENCODED_W, a["y"] * ENCODED_H])
            dst.append([b["x"] * ENCODED_W, b["y"] * ENCODED_H])
        if len(src) < 4:
            continue
        matrix, inliers = cv2.findHomography(
            np.array(src, dtype=np.float64), np.array(dst, dtype=np.float64), cv2.RANSAC, 1.2
        )
        if matrix is None:
            continue
        projected = cv2.perspectiveTransform(np.array(src, dtype=np.float64).reshape(-1, 1, 2), matrix)
        errors = np.linalg.norm(projected.reshape(-1, 2) - np.array(dst), axis=1)
        out[frame] = (matrix, int(inliers.sum()), float(np.median(errors)))
    return out


def robust_polyfit(times: list[float], values: list[float], degree: int = 2) -> np.ndarray:
    """Polynomial fit with two rounds of outlier rejection."""
    x = np.array(times)
    y = np.array(values)
    keep = np.ones(len(x), dtype=bool)
    coeffs = np.zeros(degree + 1)
    for _ in range(3):
        coeffs = np.polyfit(x[keep], y[keep], degree)
        residual = np.abs(y - np.polyval(coeffs, x))
        spread = float(np.median(residual[keep])) or 1.0
        new_keep = residual < max(0.004, 3 * spread)
        if new_keep.sum() < degree + 2:
            break
        if (new_keep == keep).all():
            break
        keep = new_keep
    return coeffs


def roi_corners_reference() -> np.ndarray:
    """Quad around the van's ground contact at REFERENCE_SEC, aligned with the road."""
    cx, cy = contact_px(REFERENCE_SEC)
    ahead = contact_px(REFERENCE_SEC + 0.5)
    behind = contact_px(REFERENCE_SEC - 0.5)
    dx, dy = unit(ahead[0] - behind[0], ahead[1] - behind[1])
    px, py = dy, -dx  # perpendicular inside the lane
    half_len = REGION_HALF_LEN * ENCODED_H
    half_wid = REGION_HALF_WIDTH * ENCODED_W
    return np.array(
        [
            [cx + dx * half_len + px * half_wid, cy + dy * half_len + py * half_wid],
            [cx + dx * half_len - px * half_wid, cy + dy * half_len - py * half_wid],
            [cx - dx * half_len - px * half_wid, cy - dy * half_len - py * half_wid],
            [cx - dx * half_len + px * half_wid, cy - dy * half_len + py * half_wid],
        ],
        dtype=np.float64,
    )


def roi_at(frame: int, transform: np.ndarray, reference: np.ndarray, inverse: np.ndarray) -> list[dict]:
    mapped = transform @ (inverse @ np.hstack([reference, np.ones((4, 1))]).T)
    mapped = (mapped[:2] / mapped[2]).T
    return [{"x": round(float(x) / ENCODED_W, 5), "y": round(float(y) / ENCODED_H, 5)} for x, y in mapped]


def point_in_polygon(point, polygon) -> bool:
    x, y = point
    inside = False
    count = len(polygon)
    for i in range(count):
        a, b = polygon[i], polygon[(i + 1) % count]
        x1, y1 = a["x"], a["y"]
        x2, y2 = b["x"], b["y"]
        if (y1 > y) != (y2 > y):
            cross = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < cross:
                inside = not inside
    return inside


def sample_roi(samples, time_sec: float, max_gap: float = 0.26):
    """Mirrors src/domain/sampling.ts: null outside the segment or past the gap limit."""
    if time_sec < samples[0]["timeSec"] or time_sec > samples[-1]["timeSec"]:
        return None
    for i in range(len(samples) - 1):
        a, b = samples[i], samples[i + 1]
        if a["timeSec"] <= time_sec <= b["timeSec"]:
            if b["timeSec"] - a["timeSec"] > max_gap:
                return None
            k = 0.0 if b["timeSec"] == a["timeSec"] else (time_sec - a["timeSec"]) / (b["timeSec"] - a["timeSec"])
            return [
                {"x": a["vertices"][j]["x"] + (b["vertices"][j]["x"] - a["vertices"][j]["x"]) * k,
                 "y": a["vertices"][j]["y"] + (b["vertices"][j]["y"] - a["vertices"][j]["y"]) * k}
                for j in range(len(a["vertices"]))
            ]
    return None


def derive_crossing(roi_samples, window_end: float):
    """Same algorithm as src/domain/region-entry.ts."""
    inside: list[bool] = []
    times: list[float] = []
    step = 0
    while step / 100 <= window_end:
        time_sec = step / 100
        step += 1
        polygon = sample_roi(roi_samples, time_sec)
        if polygon is None:
            times.append(time_sec)
            inside.append(False)
            continue
        x0, y0, x1, y1 = box_at(time_sec)
        anchor = ((x0 + x1) / 2, y1)
        times.append(time_sec)
        inside.append(point_in_polygon(anchor, polygon))
    crossing = None
    for i in range(1, len(inside)):
        if not inside[i - 1] and inside[i]:
            crossing = times[i]
            break
    confirmed = None
    if crossing is not None:
        required = round(MIN_INSIDE_SEC / GRID_STEP_SEC)
        for i in range(int(round(crossing / GRID_STEP_SEC)) + required, len(inside)):
            if inside[i]:
                confirmed = times[i]
                break
    return crossing, confirmed, inside, times


def main() -> int:
    work = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    window_end = float(sys.argv[3]) if len(sys.argv) > 3 else 4.5
    dash_tracks = json.loads((work / "dashes.json").read_text(encoding="utf-8"))
    raw = homographies(dash_tracks)
    transforms = {frame: matrix for frame, (matrix, inliers, error) in raw.items()}
    reliable = {
        frame
        for frame, (_, inliers, error) in raw.items()
        if inliers >= 4 and error < 1.2 and (frame - 1) / FRAME_RATE <= window_end
    }
    print(f"homographies: {len(transforms)} frames, {len(reliable)} reliable within {window_end}s")
    if len(reliable) < 8:
        raise SystemExit("too few reliable homographies to place the region")

    reference_frame = int(round(REFERENCE_SEC * FRAME_RATE)) + 1
    if reference_frame not in transforms:
        raise SystemExit(f"no homography for reference frame {reference_frame}")
    reference = roi_corners_reference()
    inverse = np.linalg.inv(transforms[reference_frame])
    print("reference quad (px @ t=%.2f):" % REFERENCE_SEC)
    for x, y in reference:
        print(f"  ({x:7.1f},{y:6.1f}) = ({x / ENCODED_W:.3f},{y / ENCODED_H:.3f})")

    # Per-frame corners, then a smooth temporal model: individual fits are noisy
    # and the region must not jitter or invert.
    corner_x: list[list[float]] = [[] for _ in range(4)]
    corner_y: list[list[float]] = [[] for _ in range(4)]
    fit_times: list[float] = []
    for frame in sorted(reliable):
        corners = roi_at(frame, transforms[frame], reference, inverse)
        if any(v["x"] < -0.05 or v["x"] > 1.05 or v["y"] < -0.05 or v["y"] > 1.05 for v in corners):
            continue
        fit_times.append((frame - 1) / FRAME_RATE)
        for j, vertex in enumerate(corners):
            corner_x[j].append(vertex["x"])
            corner_y[j].append(vertex["y"])
    coeffs_x = [robust_polyfit(fit_times, series) for series in corner_x]
    coeffs_y = [robust_polyfit(fit_times, series) for series in corner_y]
    print(f"temporal model from {len(fit_times)} frames, t in [{fit_times[0]:.2f},{fit_times[-1]:.2f}]")

    roi_samples = []
    last = int(round(window_end * 100))
    for step in range(0, last + 25, 25):
        time_sec = step / 100
        if time_sec > window_end:
            break
        vertices = [
            {
                "x": round(float(np.polyval(coeffs_x[j], time_sec)), 5),
                "y": round(float(np.polyval(coeffs_y[j], time_sec)), 5),
            }
            for j in range(4)
        ]
        if any(v["x"] < 0 or v["x"] > 1 or v["y"] < 0 or v["y"] > 1 for v in vertices):
            print(f"  ! t={time_sec:.2f} quad left the frame: {vertices}")
            continue
        roi_samples.append({"timeSec": round(time_sec, 3), "vertices": vertices})
    print(f"roi samples: {len(roi_samples)}")

    crossing, confirmed, inside, times = derive_crossing(roi_samples, window_end)
    print(f"crossing={crossing} confirmed={confirmed}")
    for time_sec in [i / 10 for i in range(0, int(window_end * 10) + 1, 2)]:
        index = int(round(time_sec / GRID_STEP_SEC))
        if index < len(inside):
            box = box_at(time_sec)
            polygon = sample_roi(roi_samples, time_sec) or []
            mark = "IN " if inside[index] else "   "
            print(
                f"   t={time_sec:4.1f} {mark} anchor=({(box[0] + box[2]) / 2:.3f},{box[3]:.3f}) "
                f"quad={[(round(v['x'], 3), round(v['y'], 3)) for v in polygon]}"
            )

    media = {
        "mediaId": MEDIA_ID,
        "sha256": "75a14723f494ceffb8613d87930167b852ee53642e0c7b8fc5df9bea5990a0a5",
        "encodedWidth": ENCODED_W,
        "encodedHeight": ENCODED_H,
        "durationSec": 10.0,
        "timebase": "presentation-seconds",
        "frameRate": {"numerator": 24, "denominator": 1},
        "encodedTimeBase": {"numerator": 1, "denominator": 1024},
    }
    provenance = {
        "kind": "authored-demo",
        "displayLabel": "功能演示",
        "annotationMethod": "manual-reviewed",
        "reviewedAt": REVIEWED_AT,
    }
    track = {
        "id": "vehicle-a",
        "label": "车辆 A",
        "className": "vehicle",
        "segments": [
            {
                "id": "vehicle-a-s1",
                "interval": {"startSec": 0.0, "endSec": TRACK_END_SEC},
                "interpolation": "linear",
                "maxInterpolationGapSec": 0.3,
                "samples": [
                    {
                        "timeSec": round((frame - 1) / FRAME_RATE, 3),
                        "box": {
                            "x": round(box_at((frame - 1) / FRAME_RATE)[0], 5),
                            "y": round(box_at((frame - 1) / FRAME_RATE)[1], 5),
                            "width": round(box_at((frame - 1) / FRAME_RATE)[2] - box_at((frame - 1) / FRAME_RATE)[0], 5),
                            "height": round(box_at((frame - 1) / FRAME_RATE)[3] - box_at((frame - 1) / FRAME_RATE)[1], 5),
                        },
                    }
                    for frame in range(1, int(round(TRACK_END_SEC * FRAME_RATE)) + 1, SAMPLE_STEP_FRAMES)
                ],
            }
        ],
    }
    detection_chain = {
        "id": "chain-detection",
        "representation": "conceptual-preset",
        "nodes": [
            {"id": "input", "type": "input", "label": "视频输入", "description": "使用当前预设视频"},
            {"id": "preprocess", "type": "preprocess", "label": "抽帧处理", "description": "按任务组织输入画面"},
            {"id": "detect", "type": "detect", "label": "车辆检测", "description": "定位画面中的车辆"},
            {"id": "output", "type": "output", "label": "结果输出", "description": "展示车辆位置"},
        ],
        "edges": [
            {"from": "input", "to": "preprocess"},
            {"from": "preprocess", "to": "detect"},
            {"from": "detect", "to": "output"},
        ],
    }
    region_chain = {
        "id": "chain-region-entry",
        "representation": "conceptual-preset",
        "nodes": [
            {"id": "input", "type": "input", "label": "视频输入", "description": "使用当前预设视频"},
            {"id": "preprocess", "type": "preprocess", "label": "抽帧处理", "description": "按任务组织输入画面"},
            {"id": "detect", "type": "detect", "label": "车辆检测", "description": "定位画面中的车辆"},
            {"id": "track", "type": "track", "label": "目标跟踪", "description": "持续关联同一演示目标"},
            {"id": "rule", "type": "rule", "label": "条件判断", "description": "判断目标与关注区域的关系变化"},
            {"id": "output", "type": "output", "label": "事件输出", "description": "展示事件与关联画面"},
        ],
        "edges": [
            {"from": "input", "to": "preprocess"},
            {"from": "preprocess", "to": "detect"},
            {"from": "detect", "to": "track"},
            {"from": "track", "to": "rule"},
            {"from": "rule", "to": "output"},
        ],
    }
    cues_detection = [
        {"id": "c-detect-input", "range": {"startSec": 0.0, "endSec": 0.6}, "kind": "node-emphasis", "targetId": "input", "purpose": "explanation"},
        {"id": "c-detect-box", "range": {"startSec": 0.6, "endSec": 4.5}, "kind": "node-emphasis", "targetId": "detect", "purpose": "explanation"},
    ]
    document_detection = {
        "schemaVersion": "1.0.0",
        "status": "ready",
        "presetId": "vehicle-detection",
        "media": media,
        "playbackWindow": {"startSec": 0.0, "endSec": window_end},
        "chain": detection_chain,
        "tracks": [track],
        "rois": [],
        "rules": [],
        "events": [],
        "evidence": [],
        "cues": cues_detection,
        "provenance": provenance,
    }
    if confirmed is None or crossing is None:
        raise SystemExit("no region-entry crossing derived; refusing to write a fabricated event")

    visible_end = window_end
    document_region = {
        "schemaVersion": "1.0.0",
        "status": "ready",
        "presetId": "region-entry",
        "media": media,
        "playbackWindow": {"startSec": 0.0, "endSec": window_end},
        "chain": region_chain,
        "tracks": [track],
        "rois": [
            {
                "id": "roi-lane-a",
                "label": "指定区域",
                "coordinateSpace": "encoded-frame-normalized",
                "role": "ground-region",
                "segments": [
                    {
                        "interval": {"startSec": roi_samples[0]["timeSec"], "endSec": roi_samples[-1]["timeSec"] + 1e-3},
                        "interpolation": "linear",
                        "maxInterpolationGapSec": 0.26,
                        "samples": roi_samples,
                    }
                ],
            }
        ],
        "rules": [
            {
                "id": "rule-region-entry",
                "type": "outside-to-inside",
                "trackIds": ["vehicle-a"],
                "roiId": "roi-lane-a",
                "anchor": "box-bottom-center",
                "boundary": "inside",
                "minimumInsideSec": MIN_INSIDE_SEC,
            }
        ],
        "events": [
            {
                "id": "ev-region-entry",
                "mediaId": MEDIA_ID,
                "kind": "region-entry",
                "timeSec": round(confirmed, 2),
                "observedCrossingTimeSec": round(crossing, 2),
                "visible": {"startSec": round(confirmed, 2), "endSec": visible_end},
                "trackIds": ["vehicle-a"],
                "roiId": "roi-lane-a",
                "title": "车辆进入指定区域",
                "evidenceIds": ["ev-region-entry-shot"],
            }
        ],
        "evidence": [
            {
                "id": "ev-region-entry-shot",
                "mediaId": MEDIA_ID,
                "timeSec": round(crossing, 2),
                "extractedFromMedia": True,
            }
        ],
        "cues": cues_detection
        + [
            {"id": "c-entry-rule", "range": {"startSec": round(crossing, 2), "endSec": round(confirmed, 2) + 0.4}, "kind": "node-emphasis", "targetId": "rule", "purpose": "explanation"},
            {"id": "c-entry-output", "range": {"startSec": round(confirmed, 2), "endSec": visible_end}, "kind": "node-emphasis", "targetId": "output", "purpose": "explanation"},
        ],
        "provenance": provenance,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "industry-vehicle-detection.json").write_text(
        json.dumps(document_detection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "industry-region-entry.json").write_text(
        json.dumps(document_region, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote both documents to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
