/**
 * Derives everything the stage needs to draw at one media time.
 *
 * Nothing here is scripted per second: given a time, the same objects, the same
 * region phase and the same results always come back, which is what makes
 * pause / seek / replay / rotation consistent.
 */
import type {
  AnalysisEvent,
  ObjectTrack,
  Point01,
  ProjectedRoi,
  ReadyAnalysis,
  TimeRange,
} from '../contracts/domain'
import { type RegionEntryDerivation, regionPhaseAt } from './region-entry'
import { sampleRoiAt, sampleTrackAt, trackTrailAt } from './sampling'

export interface ResolvedScenario {
  document: ReadyAnalysis
  window: TimeRange
  regionEntry: RegionEntryDerivation | null
  tracks: ObjectTrack[]
  rois: ProjectedRoi[]
  firstTargetSec: number | null
  lastTargetSec: number | null
  firstEventSec: number | null
}

export function resolveScenario(document: ReadyAnalysis, regionEntry: RegionEntryDerivation | null): ResolvedScenario {
  const window = document.playbackWindow ?? { startSec: 0, endSec: document.media.durationSec }
  let firstTargetSec: number | null = null
  let lastTargetSec: number | null = null
  for (const track of document.tracks) {
    for (const segment of track.segments) {
      const first = segment.samples[0]
      const last = segment.samples[segment.samples.length - 1]
      if (!first || !last) continue
      if (firstTargetSec === null || first.timeSec < firstTargetSec) firstTargetSec = first.timeSec
      if (lastTargetSec === null || last.timeSec > lastTargetSec) lastTargetSec = last.timeSec
    }
  }
  const firstEventSec = document.events.reduce<number | null>(
    (acc, event) => (acc === null || event.timeSec < acc ? event.timeSec : acc),
    null,
  )
  return {
    document,
    window,
    regionEntry,
    tracks: document.tracks,
    rois: document.rois,
    firstTargetSec,
    lastTargetSec,
    firstEventSec,
  }
}

export interface TargetView {
  trackId: string
  label: string
  className: ObjectTrack['className']
  box: { x: number; y: number; width: number; height: number }
  anchor: Point01 | null
}

export interface RegionView {
  roiId: string
  label: string
  vertices: Point01[]
  phase: 'unknown' | 'outside' | 'inside'
}

export interface StageFrame {
  timeSec: number
  targets: TargetView[]
  trails: Map<string, Point01[]>
  regions: RegionView[]
  /** Events whose visible range contains this time. */
  activeEvents: AnalysisEvent[]
  /** Events that became visible within the last 240 ms of media time. */
  freshEvents: AnalysisEvent[]
  phase: 'waiting' | 'observing' | 'deciding' | 'result'
}

const FRESH_EVENT_SEC = 0.24

export function deriveFrame(scenario: ResolvedScenario, timeSec: number, trailSec = 0.9): StageFrame {
  const targets: TargetView[] = []
  const trails = new Map<string, Point01[]>()
  for (const track of scenario.tracks) {
    const sample = sampleTrackAt(track, timeSec)
    if (!sample) continue
    targets.push({
      trackId: track.id,
      label: track.label,
      className: track.className,
      box: sample.box,
      anchor: sample.anchor,
    })
    trails.set(track.id, trackTrailAt(track, timeSec, trailSec))
  }

  const regions: RegionView[] = scenario.rois.map((roi) => {
    const vertices = sampleRoiAt(roi, timeSec) ?? []
    const derivation = scenario.regionEntry
    return {
      roiId: roi.id,
      label: roi.label,
      vertices,
      phase: derivation && derivation.roiId === roi.id ? regionPhaseAt(derivation, timeSec) : 'unknown',
    }
  })

  const activeEvents = scenario.document.events.filter(
    (event) => event.visible.startSec <= timeSec && timeSec < event.visible.endSec,
  )
  const freshEvents = activeEvents.filter((event) => timeSec - event.visible.startSec < FRESH_EVENT_SEC)

  let phase: StageFrame['phase'] = 'waiting'
  const eventTime = scenario.firstEventSec
  const targetTime = scenario.firstTargetSec
  if (eventTime !== null && timeSec >= eventTime) phase = 'result'
  else if (scenario.regionEntry?.crossingTimeSec != null && timeSec >= scenario.regionEntry.crossingTimeSec) phase = 'deciding'
  else if (targetTime !== null && timeSec >= targetTime) phase = 'observing'

  return { timeSec, targets, trails, regions, activeEvents, freshEvents, phase }
}

export interface ChainState {
  activeNodeIds: string[]
  doneNodeIds: string[]
  /** Index in chain.nodes of the node the "signal" is currently on, or null. */
  currentNodeId: string | null
}

const TYPE_ORDER: Record<string, number> = {
  input: 0,
  preprocess: 1,
  detect: 2,
  track: 3,
  semantic_match: 3,
  feature_extract: 3,
  rule: 4,
  image_match: 4,
  output: 5,
}

/** Which chain nodes are working right now, derived from the observed state. */
export function chainStateAt(scenario: ResolvedScenario, frame: StageFrame): ChainState {
  const nodes = scenario.document.chain.nodes
  const eventTime = scenario.firstEventSec
  const crossing = scenario.regionEntry?.crossingTimeSec ?? null
  const hasTargets = frame.targets.length > 0
  const firstTarget = scenario.firstTargetSec

  const active: string[] = []
  for (const node of nodes) {
    const order = TYPE_ORDER[node.type] ?? 2
    let on = false
    switch (node.type) {
      case 'input':
      case 'preprocess':
        on = frame.timeSec >= scenario.window.startSec
        break
      case 'detect':
        on = hasTargets || (firstTarget !== null && frame.timeSec < firstTarget + 0.6)
        break
      case 'track':
      case 'feature-extract':
        on = hasTargets
        break
      case 'semantic-match':
        on = hasTargets
        break
      case 'rule':
        on = crossing !== null ? frame.timeSec >= crossing : frame.timeSec >= (firstTarget ?? Infinity)
        break
      case 'image-match':
        on = hasTargets
        break
      case 'output':
        on = eventTime !== null && frame.timeSec >= eventTime
        break
      default:
        on = false
    }
    if (on) active.push(node.id)
    void order
  }

  const activeSet = new Set(active)
  const done = nodes.filter((node) => !activeSet.has(node.id)).map((node) => node.id)
  const currentNodeId = active.length > 0 ? active[active.length - 1]! : null
  return { activeNodeIds: active, doneNodeIds: done, currentNodeId }
}
