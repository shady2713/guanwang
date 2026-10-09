"""Rebuild the reference image used by the "以图搜图" preset.

The reference is a real crop of the delivered clip, not a stock photo: the
white sedan at 7.00 s in image-search.mp4 (track vehicle-candidate-2). Keeping
the derivation scripted means the asset can be re-verified against the source
hash instead of trusted as an opaque file.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(r"C:\Users\64576\Desktop\视界")
SOURCE = ROOT / "outputs/homepage-implementation-handoff-v1/assets/video/image-search.mp4"
OUT = ROOT / "homepage/public/media/reference-vehicle.jpg"
ENCODED = (1216, 672)
TIME_SEC = 7.0
# vehicle-candidate-2 box at 7.00 s, padded so the vehicle is not cropped tight.
BOX = (0.49836, 0.35714, 0.02961, 0.03423)
PAD = (10, 10, 8, 8)  # left, right, top, bottom in encoded pixels
SCALE = 4


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    w, h = ENCODED
    x0 = int(round(BOX[0] * w)) - PAD[0]
    y0 = int(round(BOX[1] * h)) - PAD[2]
    x1 = int(round((BOX[0] + BOX[2]) * w)) + PAD[1]
    y1 = int(round((BOX[1] + BOX[3]) * h)) + PAD[3]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    cw, ch = x1 - x0, y1 - y0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-ss", f"{TIME_SEC}", "-i", str(SOURCE),
        "-frames:v", "1",
        "-vf", f"crop={cw}:{ch}:{x0}:{y0},scale={cw * SCALE}:{ch * SCALE}:flags=lanczos",
        "-q:v", "3", str(OUT),
    ]
    subprocess.run(cmd, check=True)
    crop = {
        "x": round(x0 / w, 5),
        "y": round(y0 / h, 5),
        "width": round(cw / w, 5),
        "height": round(ch / h, 5),
    }
    result = {
        "referenceImage": "media/reference-vehicle.jpg",
        "sourceMedia": SOURCE.name,
        "sourceSha256": sha256(SOURCE),
        "timeSec": TIME_SEC,
        "encodedSize": {"width": w, "height": h},
        "sourceTrackId": "vehicle-candidate-2",
        "pixelRect": {"x": x0, "y": y0, "width": cw, "height": y1 - y0},
        "crop": crop,
        "output": {"path": str(OUT), "bytes": OUT.stat().st_size, "sha256": sha256(OUT)},
        "disclosure": "参考图取自本演示片段同一时间点的画面，用于说明以图搜图流程。",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
