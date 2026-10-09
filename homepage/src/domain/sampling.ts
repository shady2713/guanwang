/**
 * Sampling of annotated tracks and ground regions at an exact media time.
 *
 * Interpolation is only allowed inside one continuous visible segment and only
 * between samples that the validator already proved to be close enough. Anything
 * else returns null so the renderer hides the object instead of extrapolating.
 */
import type { Box01, ObjectTrack, Point01, ProjectedRoi } from '../contracts/domain'

export interface BoxSample {
  box: Box01
  anchor: Point01 | null
}

interface Timed {
  timeSec: number
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k
}

function lerpPoint(a: Point01, b: Point01, k: number): Point01 {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
}

function boxAnchor(box: Box01): Point01 {
  return { x: box.x + box.width / 2, y: box.y + box.height }
}

/**
 * Finds the sample pair surrounding `timeSec` plus the interpolation factor.
 * Returns null when the time is outside the observed range.
 */
function bracket<T extends Timed>(samples: readonly T[], timeSec: number): { a: T; b: T; k: number } | null {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return null
  if (timeSec < first.timeSec || timeSec > last.timeSec) return null
  if (samples.length === 1 || timeSec <= first.timeSec) return { a: first, b: first, k: 0 }

  let lo = 0
  let hi = samples.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    const sample = samples[mid]
    if (sample && sample.timeSec <= timeSec) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  if (!a || !b) return null
  const gap = b.timeSec - a.timeSec
  if (gap <= 0) return { a, b, k: 0 }
  return { a, b, k: (timeSec - a.timeSec) / gap }
}

export function sampleTrackAt(track: ObjectTrack, timeSec: number): BoxSample | null {
  for (const segment of track.segments) {
    if (timeSec < segment.interval.startSec || timeSec >= segment.interval.endSec) continue
    const found = bracket(segment.samples, timeSec)
    if (!found) continue
    const { a, b, k } = found
    const gap = b.timeSec - a.timeSec
    if (gap > segment.maxInterpolationGapSec + 1e-9) continue
    if (segment.interpolation === 'step' || gap === 0) {
      return { box: a.box, anchor: a.anchor ?? null }
    }
    return {
      box: {
        x: lerp(a.box.x, b.box.x, k),
        y: lerp(a.box.y, b.box.y, k),
        width: lerp(a.box.width, b.box.width, k),
        height: lerp(a.box.height, b.box.height, k),
      },
      anchor:
        a.anchor && b.anchor
          ? lerpPoint(a.anchor, b.anchor, k)
          : (a.anchor ?? b.anchor ?? null),
    }
  }
  return null
}

/** Short tail of already-observed positions, oldest first. Never extrapolated. */
export function trackTrailAt(track: ObjectTrack, timeSec: number, tailSec: number): Point01[] {
  const points: Point01[] = []
  for (const segment of track.segments) {
    if (segment.interval.startSec > timeSec) continue
    if (segment.interval.endSec <= timeSec - tailSec) continue
    for (const sample of segment.samples) {
      if (sample.timeSec > timeSec || sample.timeSec < timeSec - tailSec) continue
      points.push(sample.anchor ?? boxAnchor(sample.box))
    }
  }
  const current = sampleTrackAt(track, timeSec)
  if (current) {
    const point = current.anchor ?? boxAnchor(current.box)
    const last = points[points.length - 1]
    if (!last || Math.abs(last.x - point.x) > 1e-6 || Math.abs(last.y - point.y) > 1e-6) points.push(point)
  }
  return points
}

export function sampleRoiAt(roi: ProjectedRoi, timeSec: number): Point01[] | null {
  for (const segment of roi.segments) {
    if (timeSec < segment.interval.startSec || timeSec >= segment.interval.endSec) continue
    const found = bracket(segment.samples, timeSec)
    if (!found) continue
    const { a, b, k } = found
    const gap = b.timeSec - a.timeSec
    if (gap > segment.maxInterpolationGapSec + 1e-9) continue
    if (segment.interpolation === 'step' || gap === 0) return a.vertices
    return a.vertices.map((point, index) => lerpPoint(point, b.vertices[index] ?? point, k))
  }
  return null
}

/** Ray casting on a projected ground polygon, in encoded-frame coordinates. */
export function pointInPolygon(point: Point01, polygon: Point01[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    const intersects = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}
