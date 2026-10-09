"""Build image-similar-vehicle.json from hand-calibrated pixel boxes."""
import json, os

W, H = 1216, 672

chains_path = r"C:\Users\64576\Desktop\视界\outputs\homepage-implementation-handoff-v1\content\algorithm-chains.json"
with open(chains_path, encoding="utf-8") as f:
    chains = json.load(f)
chain = next(c for c in chains if c["id"] == "chain-image")

# hand-calibrated px boxes: time string -> (x0, y0, x1, y1)
T1 = {
    "6.00": (734, 496, 865, 613),
    "6.25": (726, 484, 852, 594),
    "6.50": (718, 473, 838, 578),
    "6.75": (708, 463, 824, 562),
    "7.00": (698, 451, 809, 547),
    "7.25": (691, 441, 797, 530),
    "7.50": (685, 430, 788, 515),
    "7.75": (680, 422, 781, 502),
    "8.00": (672, 415, 766, 492),
    "8.25": (668, 408, 757, 481),
    "8.50": (661, 402, 749, 472),
    "8.75": (658, 394, 743, 463),
    "9.00": (656, 389, 742, 453),
    "9.25": (654, 383, 739, 444),
    "9.50": (656, 372, 736, 436),
    "9.75": (655, 373, 733, 429),
}
T2 = {
    "6.00": (601, 248, 639, 271),
    "6.25": (602, 246, 640, 268),
    "6.50": (604, 244, 641, 266),
    "6.75": (605, 243, 642, 265),
    "7.00": (606, 240, 642, 263),
    "7.25": (606, 240, 644, 262),
    "7.50": (607, 238, 644, 261),
    "7.75": (608, 237, 648, 259),
    "8.00": (609, 238, 651, 260),
    "8.25": (610, 237, 651, 258),
    "8.50": (610, 237, 647, 257),
    "8.75": (612, 237, 648, 257),
    "9.00": (613, 236, 648, 256),
    "9.25": (615, 236, 651, 255),
    "9.50": (616, 235, 652, 254),
    "9.75": (617, 234, 653, 255),
}


def samples(table):
    out = []
    for k in sorted(table, key=float):
        x0, y0, x1, y1 = table[k]
        out.append({
            "timeSec": float(k),
            "box": {
                "x": round(x0 / W, 5),
                "y": round(y0 / H, 5),
                "width": round((x1 - x0) / W, 5),
                "height": round((y1 - y0) / H, 5),
            },
        })
    return out


def track(tid, label, table):
    ss = samples(table)
    return {
        "id": tid,
        "label": label,
        "className": "vehicle",
        "segments": [{
            "id": tid + "-s1",
            "interval": {"startSec": ss[0]["timeSec"], "endSec": round(ss[-1]["timeSec"] + 0.01, 2)},
            "interpolation": "linear",
            "maxInterpolationGapSec": 0.3,
            "samples": ss,
        }],
    }


tracks = [
    track("vehicle-candidate-1", "目标 1", T1),
    track("vehicle-candidate-2", "目标 2", T2),
]

node_ranges = [
    ("input", 6.00, 6.60),
    ("preprocess", 6.65, 7.25),
    ("detect", 7.30, 7.90),
    ("features", 7.95, 8.55),
    ("match", 8.60, 9.20),
    ("output", 9.25, 9.75),
]
cues = [{
    "id": "c-ref",
    "range": {"startSec": 6.0, "endSec": 6.4},
    "kind": "reference-reveal",
    "targetId": "vehicle-candidate-1",
    "purpose": "explanation",
}]
for nid, a, b in node_ranges:
    cues.append({
        "id": "c-" + nid,
        "range": {"startSec": a, "endSec": b},
        "kind": "node-emphasis",
        "targetId": nid,
        "purpose": "explanation",
    })

doc = {
    "schemaVersion": "1.0",
    "analysisId": "image-similar-vehicle-v1",
    "scenarioId": "image",
    "presetId": "similar-vehicle",
    "status": "ready",
    "provenance": {
        "kind": "authored-demo",
        "displayLabel": "功能演示",
        "annotationMethod": "manual-reviewed",
    },
    "reviewedAt": "2026-10-09T00:00:00+08:00",
    "media": {
        "mediaId": "image-v1",
        "sha256": "7c129e01036aacb92cee66922b4ec6c55920b7262e0d39d313aba30df549dcaa",
        "encodedWidth": W,
        "encodedHeight": H,
        "durationSec": 10,
        "timebase": "presentation-seconds",
        "frameRate": {"numerator": 24, "denominator": 1},
    },
    "playbackWindow": {"startSec": 6.0, "endSec": 9.75},
    "chain": chain,
    "tracks": tracks,
    "rois": [],
    "rules": [],
    "events": [{
        "id": "ev-similar-1",
        "mediaId": "image-v1",
        "kind": "similar-target-found",
        "timeSec": 7.0,
        "visible": {"startSec": 7.0, "endSec": 9.75},
        "trackIds": ["vehicle-candidate-1"],
        "title": "找到外观相似目标",
        "evidenceIds": ["ev-similar-1-shot"],
    }],
    "evidence": [{
        "id": "ev-similar-1-shot",
        "mediaId": "image-v1",
        "timeSec": 7.0,
        "imageUrl": "media/reference-vehicle.jpg",
        "extractedFromMedia": True,
    }],
    "cues": cues,
}

out = r"C:\Users\64576\Desktop\视界\homepage\data\analysis\image-similar-vehicle.json"
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("wrote", out)
print("chain node ids:", [n["id"] for n in chain["nodes"]])
print("track1 samples:", len(tracks[0]["segments"][0]["samples"]),
      "interval:", tracks[0]["segments"][0]["interval"])
print("track2 samples:", len(tracks[1]["segments"][0]["samples"]),
      "interval:", tracks[1]["segments"][0]["interval"])