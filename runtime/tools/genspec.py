"""Emit a zoomgrid spec for van crops over t=0..5.0 at 0.25s steps."""
import json, sys

# (t, center_x, center_y) hand-estimated trajectory of the box van (normalized)
TRACK = [
    (0.00, 0.828, 0.722), (0.25, 0.840, 0.695), (0.50, 0.852, 0.668),
    (0.75, 0.861, 0.648), (1.00, 0.870, 0.628), (1.25, 0.877, 0.610),
    (1.50, 0.883, 0.594), (1.75, 0.889, 0.579), (2.00, 0.894, 0.565),
    (2.25, 0.899, 0.552), (2.50, 0.903, 0.540), (2.75, 0.907, 0.528),
    (3.00, 0.911, 0.517), (3.25, 0.914, 0.507), (3.50, 0.917, 0.497),
    (3.75, 0.920, 0.488), (4.00, 0.922, 0.479), (4.25, 0.924, 0.471),
    (4.50, 0.926, 0.463), (4.75, 0.928, 0.456), (5.00, 0.930, 0.449),
]
items = []
for t, cx, cy in TRACK:
    if t <= 2.0:
        hw, hh = 0.055, 0.060
    else:
        hw, hh = 0.040, 0.045
    items.append({"f": "d%03d" % (int(round(t * 4)) + 1), "cx": cx, "cy": cy,
                  "hw": hw, "hh": hh, "tag": f"t={t:.2f}"})
out = {"step": 0.01, "scale": 4, "items": items}
json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), indent=1)
print("wrote", sys.argv[1], len(items), "items")
