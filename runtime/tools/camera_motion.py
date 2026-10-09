"""Estimate the camera's image motion between frames of a clip.

The demo overlays are all screen-space, so a ground region can only be drawn
correctly if the camera's own motion is known. This measures it on the static
upper band of the frame (buildings, car park, distant hills) with FFT phase
correlation for the translation and a radial-spectrum ratio for the scale.

usage: camera_motion.py <frameDir> <refFrame> [first] [last]
prints "t=<sec> dx=<px> dy=<px> scale=<f>" relative to the reference frame
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BAND = (0.02, 0.24, 0.56, 0.56)  # left, top, right, bottom in normalized frame coordinates


def band(path: Path) -> np.ndarray:
    image = Image.open(path).convert("L")
    width, height = image.size
    l, t, r, b = BAND
    crop = image.crop((int(width * l), int(height * t), int(width * r), int(height * b)))
    # Strong downsample: correlation only needs the gross motion, not detail.
    return np.asarray(crop.resize((max(8, crop.width // 4), max(8, crop.height // 4)), Image.LANCZOS)).astype(np.float64)


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Shift that maps a onto b, in band pixels (positive x = content moved right)."""
    window = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    fa = np.fft.fft2(a * window)
    fb = np.fft.fft2(b * window)
    cross = fb * np.conj(fa)
    magnitude = np.abs(cross)
    cross /= np.where(magnitude > 1e-9, magnitude, 1.0)
    peak = np.fft.ifft2(cross).real
    index = np.unravel_index(np.argmax(peak), peak.shape)
    shifts = []
    for axis in (0, 1):
        centre_index = index[axis]
        value = centre_index
        if value > peak.shape[axis] // 2:
            value -= peak.shape[axis]
        # Parabolic refinement around the peak.
        centre = peak[index]
        l = peak[(centre_index - 1) % peak.shape[axis], index[1 - axis]] if axis == 0 else peak[index[0], (centre_index - 1) % peak.shape[1]]
        r = peak[(centre_index + 1) % peak.shape[axis], index[1 - axis]] if axis == 0 else peak[index[0], (centre_index + 1) % peak.shape[1]]
        denom = float(l) - 2 * float(centre) + float(r)
        sub = 0.5 * (float(l) - float(r)) / denom if abs(denom) > 1e-12 else 0.0
        shifts.append(value + sub)
    return shifts[1], shifts[0]  # (dx, dy)


def radial_scale(a: np.ndarray, b: np.ndarray) -> float:
    """Ratio a:b in apparent size, from the radial power spectrum."""
    def profile(x: np.ndarray) -> np.ndarray:
        spectrum = np.abs(np.fft.fftshift(np.fft.fft2(x * np.outer(np.hanning(x.shape[0]), np.hanning(x.shape[1])))))
        rows, cols = spectrum.shape
        cy, cx = rows // 2, cols // 2
        yy, xx = np.indices(spectrum.shape)
        radius = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2).astype(int)
        total = np.bincount(radius.ravel(), spectrum.ravel())
        count = np.bincount(radius.ravel())
        return total / np.maximum(count, 1)

    pa, pb = profile(a), profile(b)
    radii = np.arange(6, min(len(pa), len(pb)) // 2)
    ratio = np.sum(pb[radii]) / max(np.sum(pa[radii]), 1e-9)
    return float(ratio) ** 0.5


def main() -> int:
    frame_dir = Path(sys.argv[1])
    ref = int(sys.argv[2])
    first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    last = int(sys.argv[4]) if len(sys.argv) > 4 else 144
    reference = band(frame_dir / f"f{ref:03d}.png")
    scale_ref = radial_scale(reference, reference) or 1.0
    for index in range(first, last + 1):
        if index == ref:
            continue
        if index % 6 and index != last:
            continue
        current = band(frame_dir / f"f{index:03d}.png")
        dx, dy = phase_shift(reference, current)
        ratio = (radial_scale(reference, current) or 1.0) / scale_ref
        print(
            f"t={(index - 1) / 24:5.2f} dx={dx * 4:8.2f} dy={dy * 4:8.2f} "
            f"scale={ratio:.4f} -> px_per_pct: {(ratio - 1) * 100:+.2f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
