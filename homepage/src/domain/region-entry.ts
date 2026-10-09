/**
 * Region-entry rule evaluation.
 *
 * The document declares a crossing and a confirmation time. This module derives
 * both from the annotated geometry with a fixed 10 ms grid so the UI, the
 * verification report and the rendered overlay can never disagree, and so any
 * state (including after a seek) can be rebuilt from a media time alone.
 */
import type { ObjectTrack, ProjectedRoi, RegionEntryRule, TimeRange } from '../contracts/domain'
import { pointInPolygon, sampleRoiAt, sampleTrackAt } from './sampling'

const GRID_STEP_SEC = 0.01

export interface RegionEntryDerivation {
  ruleId: string
  trackId: string
  roiId: string
  window: TimeRange
  gridStartSec: number
  /** inside[i] corresponds to gridStartSec + i * GRID_STEP_SEC. */
  inside: Array<boolean | null>
  crossingTimeSec: number | null
  confirmedTimeSec: number | null
}

export function evaluateRegionEntry(
  track: ObjectTrack,
  roi: ProjectedRoi,
  rule: RegionEntryRule,
  window: TimeRange,
): RegionEntryDerivation {
  const gridStartSec = window.startSec
  const count = Math.max(1, Math.round((window.endSec - gridStartSec) / GRID_STEP_SEC) + 1)
  const inside: Array<boolean | null> = new Array(count).fill(null)

  for (let i = 0; i < count; i += 1) {
    const t = gridStartSec + i * GRID_STEP_SEC
    const sample = sampleTrackAt(track, t)
    if (!sample) continue
    const vertices = sampleRoiAt(roi, t)
    if (!vertices) continue
    const anchor =
      rule.anchor === 'box-bottom-center'
        ? { x: sample.box.x + sample.box.width / 2, y: sample.box.y + sample.box.height }
        : sample.anchor
    if (!anchor) continue
    inside[i] = pointInPolygon(anchor, vertices)
  }

  let crossingIndex: number | null = null
  for (let i = 1; i < count; i += 1) {
    const was = inside[i - 1]
    const now = inside[i]
    if (was === false && now === true) {
      crossingIndex = i
      break
    }
  }

  let confirmedIndex: number | null = null
  if (crossingIndex !== null) {
    const required = Math.round(rule.minimumInsideSec / GRID_STEP_SEC)
    for (let i = crossingIndex + required; i < count; i += 1) {
      if (inside[i] === true) {
        confirmedIndex = i
        break
      }
    }
    if (confirmedIndex === null) confirmedIndex = null
  }

  return {
    ruleId: rule.id,
    trackId: rule.trackIds[0] ?? track.id,
    roiId: rule.roiId,
    window,
    gridStartSec,
    inside,
    crossingTimeSec: crossingIndex === null ? null : gridStartSec + crossingIndex * GRID_STEP_SEC,
    confirmedTimeSec: confirmedIndex === null ? null : gridStartSec + confirmedIndex * GRID_STEP_SEC,
  }
}

export type RegionPhase = 'unknown' | 'outside' | 'inside'

export function regionPhaseAt(derivation: RegionEntryDerivation, timeSec: number): RegionPhase {
  const index = Math.round((timeSec - derivation.gridStartSec) / GRID_STEP_SEC)
  if (index < 0 || index >= derivation.inside.length) return 'unknown'
  const value = derivation.inside[index]
  return value === null ? 'unknown' : value ? 'inside' : 'outside'
}
