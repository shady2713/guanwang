"""Mirror of homepage/src/contracts/validation.ts checks for the analysis JSON."""
import json
import sys

path = sys.argv[1]
D = json.load(open(path, encoding="utf-8"))
errs, warns = [], []


def bad(m):
    errs.append(m)


assert D["schemaVersion"] == "1.0", "schemaVersion"
if D["status"] != "ready":
    bad("status must be ready")
prov = D.get("provenance", {})
if prov.get("kind") == "authored-demo" and not D.get("reviewedAt"):
    bad("authored-demo requires reviewedAt")
if prov.get("kind") not in ("authored-demo", "algorithm-output"):
    bad("provenance.kind unsupported")

m = D["media"]
for k in ("sha256", "encodedWidth", "encodedHeight", "durationSec"):
    if not isinstance(m.get(k), (str, int, float)) or m[k] in (None, ""):
        bad(f"media.{k} missing")
w = D.get("playbackWindow")
if w:
    if w["endSec"] > m["durationSec"] + 1e-6:
        bad("playbackWindow.endSec beyond duration")
    if not (0 <= w["startSec"] < w["endSec"]):
        bad("playbackWindow range invalid")

node_ids = set()
ch = D["chain"]
for n in ch["nodes"]:
    if n["id"] in node_ids:
        bad("duplicate chain node id")
    node_ids.add(n["id"])
    for f in ("type", "label", "description"):
        if not isinstance(n.get(f), str):
            bad(f"chain node {n['id']} missing {f}")
if not ch["nodes"] or not ch["edges"]:
    bad("chain nodes/edges empty")
for e in ch["edges"]:
    if e["from"] not in node_ids or e["to"] not in node_ids:
        bad("edge references missing node")

track_ids = set()
for tr in D["tracks"]:
    if tr["id"] in track_ids:
        bad("duplicate track id")
    track_ids.add(tr["id"])
    if not isinstance(tr.get("label"), str) or not tr["label"]:
        bad(f"{tr['id']} label")
    if not tr.get("segments"):
        bad(f"{tr['id']} no segments")
    for si, s in enumerate(tr["segments"]):
        iv, mg = s["interval"], s["maxInterpolationGapSec"]
        if mg <= 0:
            bad(f"{tr['id']} maxInterpolationGapSec<=0")
        ts = [x["timeSec"] for x in s["samples"]]
        if not ts:
            bad(f"{tr['id']} empty samples")
        if any(ts[i] <= ts[i - 1] for i in range(1, len(ts))):
            bad(f"{tr['id']} timeSec not strictly increasing")
        if ts[0] < iv["startSec"] or ts[-1] >= iv["endSec"]:
            bad(f"{tr['id']} samples outside interval {iv} ({ts[0]}..{ts[-1]})")
        gaps = [round(ts[i] - ts[i - 1], 6) for i in range(1, len(ts))]
        if gaps and max(gaps) > mg + 1e-9:
            bad(f"{tr['id']} gap {max(gaps)} > limit {mg}")
        for x in s["samples"]:
            b = x["box"]
            if not (0 <= b["x"] <= 1 and 0 <= b["y"] <= 1):
                bad(f"{tr['id']} box origin out of unit range")
            if b["width"] <= 0 or b["height"] <= 0:
                bad(f"{tr['id']} box size <= 0")
            if b["x"] + b["width"] > 1.0001 or b["y"] + b["height"] > 1.0001:
                bad(f"{tr['id']} box exceeds frame at t={x['timeSec']}")

roi_ids = {r["id"] for r in D["rois"]}
ev_ids = {e["id"] for e in D["evidence"]}
for ev in D["events"]:
    if not isinstance(ev.get("mediaId"), str):
        bad(f"{ev['id']} mediaId")
    if ev["kind"] not in ("region-entry", "target-found", "similar-target-found"):
        bad(f"{ev['id']} kind")
    if ev["visible"]["startSec"] < ev["timeSec"]:
        bad(f"{ev['id']} visible.startSec < timeSec")
    for t in ev["trackIds"]:
        if t not in track_ids:
            bad(f"{ev['id']} unknown track {t}")
    for e in ev["evidenceIds"]:
        if e not in ev_ids:
            bad(f"{ev['id']} unknown evidence {e}")
    if w and ev["visible"]["endSec"] > w["endSec"] + 1e-9:
        warns.append(f"{ev['id']} visible.endSec beyond window end")

for c in D["cues"]:
    if c["kind"] not in ("node-emphasis", "query-reveal", "reference-reveal"):
        bad(f"{c['id']} kind")
    if (c["targetId"] not in node_ids and not c["targetId"].startswith(("ev-", "roi-", "trk-"))):
        warns.append(f"cue {c['id']} targetId {c['targetId']} is neither a chain node nor a known target")
    r = c["range"]
    if w and (r["startSec"] < w["startSec"] or r["endSec"] > w["endSec"] + 1e-9):
        warns.append(f"cue {c['id']} range outside playbackWindow")

print("ERRORS:" if errs else "ERRORS: none")
for e in errs:
    print("  -", e)
print("WARNINGS:" if warns else "WARNINGS: none")
for x in warns:
    print("  -", x)
print(f"tracks={len(D['tracks'])} segments="
      f"{sum(len(t['segments']) for t in D['tracks'])} samples="
      f"{sum(len(s['samples']) for t in D['tracks'] for s in t['segments'])} "
      f"events={len(D['events'])} cues={len(D['cues'])}")