"""Cross-validate the road homography: fit on some dash tracks, test on the rest.

The region overlay depends on the ground transform being right, so this measures
the error directly instead of trusting the fit.

usage: check_homography.py <dashes.json> [frame]
"""
import json
import sys

import cv2
import numpy as np

W, H = 1264, 640


def main() -> int:
    tracks = json.loads(open(sys.argv[1], encoding="utf-8").read())
    frame = int(sys.argv[2]) if len(sys.argv) > 2 else 49
    usable = [t for t in tracks if any(p["frame"] == frame for p in t)]
    print(f"tracks covering frame {frame}: {len(usable)}")
    for hold_out in range(len(usable)):
        train = [t for i, t in enumerate(usable) if i != hold_out]
        test = usable[hold_out]
        src, dst = [], []
        for track in train:
            own = {p["frame"]: p for p in track}
            if 1 not in own or frame not in own:
                continue
            src.append([own[1]["x"] * W, own[1]["y"] * H])
            dst.append([own[frame]["x"] * W, own[frame]["y"] * H])
        if len(src) < 4:
            print(f"  hold-out {hold_out}: not enough training points")
            continue
        matrix, _ = cv2.findHomography(np.array(src), np.array(dst), cv2.RANSAC, 1.2)
        own = {p["frame"]: p for p in test}
        if 1 not in own or frame not in own:
            continue
        a = np.array([[[own[1]["x"] * W, own[1]["y"] * H]]], dtype=np.float64)
        b = np.array([[[own[frame]["x"] * W, own[frame]["y"] * H]]], dtype=np.float64)
        predicted = cv2.perspectiveTransform(a, matrix)[0][0]
        error = float(np.linalg.norm(predicted - b[0][0]))
        # error at the region location, far from the training points
        far = np.array([[[1143.0, 388.0]]], dtype=np.float64)
        far_pred = cv2.perspectiveTransform(far, matrix)[0][0]
        print(
            f"  hold-out {hold_out}: train={len(src)} err@dash={error:6.1f}px  "
            f"roi-mapped to ({far_pred[0]:7.1f},{far_pred[1]:6.1f})"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
