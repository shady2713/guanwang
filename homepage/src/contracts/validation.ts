/**
 * Runtime validation for data coming from a data provider.
 *
 * Types in `domain.ts` only exist at compile time: the static JSON files, and any
 * future HTTP adapter, are untrusted at runtime. These guards are the gate that
 * decides whether a document may drive the overlay renderer, so a mismatched
 * media build or a hand-edited time sample fails loudly instead of drawing
 * wrong boxes on screen.
 */
import type {
  AlgorithmChain,
  AnalysisEvent,
  AnalysisDocument,
  EvidenceReference,
  MediaAsset,
  ObjectTrack,
  Point01,
  PresentationCue,
  PresetId,
  ProjectedRoi,
  ReadyAnalysis,
  RegionEntryRule,
  TimeRange,
} from './domain'

export class DataContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataContractError'
  }
}

type Json = Record<string, unknown>

const isJson = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function asObject(value: unknown, path: string): Json {
  if (!isJson(value)) throw new DataContractError(`${path} 必须是对象`)
  return value
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new DataContractError(`${path} 必须是数组`)
  return value
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new DataContractError(`${path} 必须是非空字符串`)
  return value
}

function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DataContractError(`${path} 必须是有限数字`)
  return value
}

function asSeconds(value: unknown, path: string): number {
  const n = asFinite(value, path)
  if (n < 0) throw new DataContractError(`${path} 不能为负数`)
  return n
}

function asPoint01(value: unknown, path: string): Point01 {
  const raw = asObject(value, path)
  return { x: asUnit(raw.x, `${path}.x`), y: asUnit(raw.y, `${path}.y`) }
}

function asUnit(value: unknown, path: string): number {
  const n = asFinite(value, path)
  if (n < 0 || n > 1) throw new DataContractError(`${path} 必须归一化到 0..1，收到 ${n}`)
  return n
}

function asRange(value: unknown, path: string): TimeRange {
  const raw = asObject(value, path)
  const startSec = asSeconds(raw.startSec, `${path}.startSec`)
  const endSec = asSeconds(raw.endSec, `${path}.endSec`)
  if (!(startSec < endSec)) throw new DataContractError(`${path} 要求 startSec < endSec`)
  return { startSec, endSec }
}

function maxSampleGap(times: number[]): number {
  let gap = 0
  for (let i = 1; i < times.length; i += 1) gap = Math.max(gap, times[i]! - times[i - 1]!)
  return gap
}

function checkSegmentSamples(
  samples: unknown,
  path: string,
  interval: TimeRange,
  maxInterpolationGapSec: number,
  readPoint: (raw: Json, samplePath: string) => Point01,
  warnings: string[],
): void {
  const list = asArray(samples, path)
  if (list.length === 0) throw new DataContractError(`${path} 至少需要 1 个样本`)
  const times: number[] = []
  for (const [i, item] of list.entries()) {
    const raw = asObject(item, `${path}[${i}]`)
    times.push(asSeconds(raw.timeSec, `${path}[${i}].timeSec`))
    readPoint(raw, `${path}[${i}]`)
  }
  for (let i = 1; i < times.length; i += 1) {
    if (times[i]! <= times[i - 1]!) {
      throw new DataContractError(`${path}[${i}].timeSec 必须严格递增`)
    }
  }
  if (times[0]! < interval.startSec || times[times.length - 1]! >= interval.endSec) {
    throw new DataContractError(`${path} 的样本时间必须落在区间 ${interval.startSec}..${interval.endSec} 内`)
  }
  const gap = maxSampleGap(times)
  if (gap > maxInterpolationGapSec) {
    throw new DataContractError(
      `${path} 的最大样本间隔 ${gap.toFixed(3)}s 超过 maxInterpolationGapSec ${maxInterpolationGapSec}s，不能安全插值`,
    )
  }
  if (gap > maxInterpolationGapSec * 0.75) {
    warnings.push(`${path} 的样本间隔接近插值上限，插值期间位置可能有偏差`)
  }
}

function validateTracks(value: unknown, warnings: string[]): ObjectTrack[] {
  const list = asArray(value, 'analysis.tracks')
  const seen = new Set<string>()
  return list.map((item, index) => {
    const raw = asObject(item, `analysis.tracks[${index}]`)
    const id = asString(raw.id, `analysis.tracks[${index}].id`)
    if (seen.has(id)) throw new DataContractError(`轨迹 id 重复：${id}`)
    seen.add(id)
    const segments = asArray(raw.segments, `tracks.${id}.segments`).map((seg, i) => {
      const s = asObject(seg, `tracks.${id}.segments[${i}]`)
      const interval = asRange(s.interval, `tracks.${id}.segments[${i}].interval`)
      const maxInterpolationGapSec = asFinite(
        s.maxInterpolationGapSec,
        `tracks.${id}.segments[${i}].maxInterpolationGapSec`,
      )
      if (maxInterpolationGapSec <= 0) throw new DataContractError(`tracks.${id}.segments[${i}].maxInterpolationGapSec 必须为正`)
      const samples = asArray(s.samples, `tracks.${id}.segments[${i}].samples`)
      checkSegmentSamples(
        samples,
        `tracks.${id}.segments[${i}].samples`,
        interval,
        maxInterpolationGapSec,
        (raw2, samplePath) => {
          const box = asObject(raw2.box, `${samplePath}.box`)
          asUnit(box.x, `${samplePath}.box.x`)
          asUnit(box.y, `${samplePath}.box.y`)
          const w = asFinite(box.width, `${samplePath}.box.width`)
          const h = asFinite(box.height, `${samplePath}.box.height`)
          if (w <= 0 || h <= 0) throw new DataContractError(`${samplePath}.box 宽高必须为正`)
          if (box.x as number + w > 1.0001 || box.y as number + h > 1.0001) {
            throw new DataContractError(`${samplePath}.box 超出编码画幅范围`)
          }
          if (raw2.anchor !== undefined) asPoint01(raw2.anchor, `${samplePath}.anchor`)
          return { x: box.x as number, y: box.y as number }
        },
        warnings,
      )
      return {
        id: asString(s.id, `tracks.${id}.segments[${i}].id`),
        interval,
        interpolation: s.interpolation === 'step' ? ('step' as const) : ('linear' as const),
        maxInterpolationGapSec,
        samples: samples as TrackSegmentSample[],
      }
    })
    if (segments.length === 0) throw new DataContractError(`tracks.${id} 至少需要一个片段`)
    return {
      id,
      label: asString(raw.label, `tracks.${id}.label`),
      className: (raw.className ?? 'other') as ObjectTrack['className'],
      segments,
    }
  })
}

type TrackSegmentSample = { timeSec: number; box: { x: number; y: number; width: number; height: number }; anchor?: Point01 }

function validateRois(value: unknown, warnings: string[]): ProjectedRoi[] {
  return asArray(value, 'analysis.rois').map((item, index) => {
    const raw = asObject(item, `analysis.rois[${index}]`)
    const id = asString(raw.id, `analysis.rois[${index}].id`)
    if (raw.coordinateSpace !== 'encoded-frame-normalized') {
      throw new DataContractError(`rois.${id}.coordinateSpace 必须是 encoded-frame-normalized`)
    }
    const segments = asArray(raw.segments, `rois.${id}.segments`).map((seg, i) => {
      const s = asObject(seg, `rois.${id}.segments[${i}]`)
      const interval = asRange(s.interval, `rois.${id}.segments[${i}].interval`)
      const maxInterpolationGapSec = asFinite(s.maxInterpolationGapSec, `rois.${id}.segments[${i}].maxInterpolationGapSec`)
      const samples = asArray(s.samples, `rois.${id}.segments[${i}].samples`)
      let vertexCount = 0
      checkSegmentSamples(
        samples,
        `rois.${id}.segments[${i}].samples`,
        interval,
        maxInterpolationGapSec,
        (raw2, samplePath) => {
          const vertices = asArray(raw2.vertices, `${samplePath}.vertices`).map((v, k) =>
            asPoint01(v, `${samplePath}.vertices[${k}]`),
          )
          if (vertices.length < 3) throw new DataContractError(`${samplePath}.vertices 至少需要 3 个点`)
          if (vertexCount === 0) vertexCount = vertices.length
          else if (vertices.length !== vertexCount) {
            throw new DataContractError(`${samplePath}.vertices 数量与同一片段其它样本不一致，插值不安全`)
          }
          return vertices[0]!
        },
        warnings,
      )
      return {
        interval,
        interpolation: s.interpolation === 'step' ? ('step' as const) : ('linear' as const),
        maxInterpolationGapSec,
        samples: samples as { timeSec: number; vertices: Point01[] }[],
      }
    })
    if (segments.length === 0) throw new DataContractError(`rois.${id} 至少需要一个片段`)
    return {
      id,
      label: asString(raw.label, `rois.${id}.label`),
      coordinateSpace: 'encoded-frame-normalized' as const,
      role: (raw.role ?? 'ground-region') as ProjectedRoi['role'],
      segments,
    }
  })
}

function validateChain(value: unknown): AlgorithmChain {
  const raw = asObject(value, 'analysis.chain')
  const nodes = asArray(raw.nodes, 'chain.nodes').map((n, i) => {
    const node = asObject(n, `chain.nodes[${i}]`)
    return {
      id: asString(node.id, `chain.nodes[${i}].id`),
      type: node.type as AlgorithmChain['nodes'][number]['type'],
      label: asString(node.label, `chain.nodes[${i}].label`),
      description: asString(node.description, `chain.nodes[${i}].description`),
    }
  })
  const ids = new Set(nodes.map((n) => n.id))
  if (ids.size !== nodes.length) throw new DataContractError('chain.nodes.id 存在重复')
  const edges = asArray(raw.edges, 'chain.edges').map((e, i) => {
    const edge = asObject(e, `chain.edges[${i}]`)
    const from = asString(edge.from, `chain.edges[${i}].from`)
    const to = asString(edge.to, `chain.edges[${i}].to`)
    if (!ids.has(from) || !ids.has(to)) throw new DataContractError(`chain.edges[${i}] 指向不存在的节点`)
    return { from, to }
  })
  if (nodes.length === 0) throw new DataContractError('chain.nodes 不能为空')
  if (edges.length === 0) throw new DataContractError('chain.edges 不能为空')
  return { id: asString(raw.id, 'chain.id'), representation: 'conceptual-preset', nodes, edges }
}

function validateRules(value: unknown, trackIds: Set<string>, roiIds: Set<string>): RegionEntryRule[] {
  return asArray(value, 'analysis.rules').map((item, index) => {
    const raw = asObject(item, `analysis.rules[${index}]`)
    const id = asString(raw.id, `analysis.rules[${index}].id`)
    if (raw.type !== 'outside-to-inside') throw new DataContractError(`rules.${id}.type 仅支持 outside-to-inside`)
    const ids = asArray(raw.trackIds, `rules.${id}.trackIds`).map((t, k) => asString(t, `rules.${id}.trackIds[${k}]`))
    for (const t of ids) {
      if (!trackIds.has(t)) throw new DataContractError(`rules.${id} 引用了不存在的轨迹 ${t}`)
    }
    const roiId = asString(raw.roiId, `rules.${id}.roiId`)
    if (!roiIds.has(roiId)) throw new DataContractError(`rules.${id} 引用了不存在的区域 ${roiId}`)
    const minimumInsideSec = asSeconds(raw.minimumInsideSec, `rules.${id}.minimumInsideSec`)
    if (minimumInsideSec <= 0) throw new DataContractError(`rules.${id}.minimumInsideSec 必须为正`)
    return {
      id,
      type: 'outside-to-inside',
      trackIds: ids,
      roiId,
      anchor: (raw.anchor ?? 'box-bottom-center') as RegionEntryRule['anchor'],
      boundary: (raw.boundary ?? 'inside') as RegionEntryRule['boundary'],
      minimumInsideSec,
    }
  })
}

function validateEvents(
  value: unknown,
  trackIds: Set<string>,
  roiIds: Set<string>,
  evidenceIds: Set<string>,
  warnings: string[],
): AnalysisEvent[] {
  const seen = new Set<string>()
  return asArray(value, 'analysis.events').map((item, index) => {
    const raw = asObject(item, `analysis.events[${index}]`)
    const id = asString(raw.id, `analysis.events[${index}].id`)
    if (seen.has(id)) throw new DataContractError(`事件 id 重复：${id}`)
    seen.add(id)
    const timeSec = asSeconds(raw.timeSec, `events.${id}.timeSec`)
    const visible = asRange(raw.visible, `events.${id}.visible`)
    if (visible.startSec < timeSec) {
      throw new DataContractError(`events.${id}.visible.startSec 必须不早于事件确认时刻 timeSec`)
    }
    const ids = asArray(raw.trackIds, `events.${id}.trackIds`).map((t, k) => asString(t, `events.${id}.trackIds[${k}]`))
    for (const t of ids) {
      if (!trackIds.has(t)) throw new DataContractError(`events.${id} 引用了不存在的轨迹 ${t}`)
    }
    if (raw.roiId !== undefined) {
      const roiId = asString(raw.roiId, `events.${id}.roiId`)
      if (!roiIds.has(roiId)) throw new DataContractError(`events.${id} 引用了不存在的区域 ${roiId}`)
    }
    const evidence = asArray(raw.evidenceIds, `events.${id}.evidenceIds`).map((e, k) =>
      asString(e, `events.${id}.evidenceIds[${k}]`),
    )
    for (const e of evidence) {
      if (!evidenceIds.has(e)) throw new DataContractError(`events.${id} 引用了不存在的证据 ${e}`)
    }
    if (raw.observedCrossingTimeSec !== undefined) {
      const crossing = asSeconds(raw.observedCrossingTimeSec, `events.${id}.observedCrossingTimeSec`)
      if (crossing > timeSec) {
        warnings.push(`events.${id} 的 observedCrossingTimeSec 晚于确认时刻，请复核标注`)
      }
    }
    return {
      id,
      mediaId: asString(raw.mediaId, `events.${id}.mediaId`),
      kind: raw.kind as AnalysisEvent['kind'],
      timeSec,
      observedCrossingTimeSec: raw.observedCrossingTimeSec as number | undefined,
      visible,
      trackIds: ids,
      roiId: raw.roiId as string | undefined,
      title: asString(raw.title, `events.${id}.title`),
      evidenceIds: evidence,
    }
  })
}

function validateEvidence(value: unknown): EvidenceReference[] {
  const seen = new Set<string>()
  return asArray(value, 'analysis.evidence').map((item, index) => {
    const raw = asObject(item, `analysis.evidence[${index}]`)
    const id = asString(raw.id, `analysis.evidence[${index}].id`)
    if (seen.has(id)) throw new DataContractError(`证据 id 重复：${id}`)
    seen.add(id)
    return {
      id,
      mediaId: asString(raw.mediaId, `analysis.evidence[${index}].mediaId`),
      timeSec: asSeconds(raw.timeSec, `analysis.evidence[${index}].timeSec`),
      imageUrl: raw.imageUrl as string | undefined,
      extractedFromMedia: raw.extractedFromMedia === true,
    }
  })
}

function validateCues(value: unknown, knownIds: Set<string>): PresentationCue[] {
  return asArray(value, 'analysis.cues').map((item, index) => {
    const raw = asObject(item, `analysis.cues[${index}]`)
    const targetId = asString(raw.targetId, `analysis.cues[${index}].targetId`)
    if (!knownIds.has(targetId)) {
      warningsOnce(`analysis.cues[${index}].targetId ${targetId} 既不是链节点也不是已知目标，已忽略该提示`)
    }
    return {
      id: asString(raw.id, `analysis.cues[${index}].id`),
      range: asRange(raw.range, `analysis.cues[${index}].range`),
      kind: raw.kind as PresentationCue['kind'],
      targetId,
      purpose: 'explanation' as const,
    }
  })
}

const warned = new Set<string>()
function warningsOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  validationWarnings.push(message)
}

/** Soft findings collected during the last validation pass. */
export const validationWarnings: string[] = []

export interface ValidatedAnalysis {
  document: AnalysisDocument
  warnings: string[]
}

/**
 * Full gate: the document is only renderable when it is bound to the exact media
 * build that will be played.
 */
export function validateAnalysisDocument(
  raw: unknown,
  media: MediaAsset,
  expectedPresetId: PresetId,
  expectedMediaId: string,
  resolveChain?: (chainId: string) => AlgorithmChain | undefined,
): ValidatedAnalysis {
  validationWarnings.length = 0
  const warnings: string[] = validationWarnings
  const doc = asObject(raw, 'analysis')
  if (doc.schemaVersion !== '1.0') throw new DataContractError(`analysis.schemaVersion 不受支持：${String(doc.schemaVersion)}`)

  const binding = asObject(doc.media, 'analysis.media')
  if (binding.mediaId !== expectedMediaId) {
    throw new DataContractError(`分析数据绑定的是 ${String(binding.mediaId)}，与当前媒体 ${expectedMediaId} 不一致`)
  }
  for (const [key, actual] of [
    ['sha256', media.sha256],
    ['encodedWidth', media.encodedWidth],
    ['encodedHeight', media.encodedHeight],
    ['durationSec', media.durationSec],
  ] as const) {
    if (binding[key] !== actual) {
      throw new DataContractError(
        `分析数据与媒体构建不一致：${key} = ${String(binding[key])}，实际媒体为 ${String(actual)}。旧标注不能套用到新版本媒体。`,
      )
    }
  }
  if (binding.timebase !== media.timebase) throw new DataContractError('分析数据的 timebase 与媒体不一致')

  if (doc.status !== 'ready' && doc.status !== 'annotation-required') {
    throw new DataContractError(`analysis.status 不受支持：${String(doc.status)}`)
  }
  if (doc.presetId !== expectedPresetId) {
    throw new DataContractError(`分析数据属于预设 ${String(doc.presetId)}，当前选择的是 ${expectedPresetId}`)
  }

  if (doc.playbackWindow !== undefined) {
    const window = asRange(doc.playbackWindow, 'analysis.playbackWindow')
    if (window.endSec > media.durationSec + 1e-6) {
      throw new DataContractError(`playbackWindow.endSec ${window.endSec} 超出媒体时长 ${media.durationSec}`)
    }
  }

  const chainSource = doc.chain ?? (typeof doc.chainId === 'string' ? resolveChain?.(doc.chainId) : undefined)
  if (!chainSource) {
    throw new DataContractError(
      typeof doc.chainId === 'string' ? `分析数据引用了未知的算法链 ${doc.chainId}` : 'analysis.chain 缺失',
    )
  }
  const chain = validateChain(chainSource)
  const tracks = validateTracks(doc.tracks, warnings)
  const rois = validateRois(doc.rois, warnings)
  const trackIds = new Set(tracks.map((t) => t.id))
  const roiIds = new Set(rois.map((r) => r.id))
  const evidence = validateEvidence(doc.evidence)
  const evidenceIds = new Set(evidence.map((e) => e.id))
  const rules = validateRules(doc.rules, trackIds, roiIds)
  const events = validateEvents(doc.events, trackIds, roiIds, evidenceIds, warnings)
  const cues = validateCues(doc.cues, new Set([
    ...chain.nodes.map((n) => n.id),
    ...trackIds,
    ...roiIds,
    ...events.map((e) => e.id),
  ]))

  const base = {
    schemaVersion: '1.0' as const,
    analysisId: typeof doc.analysisId === 'string' ? doc.analysisId : `${expectedPresetId}-${expectedMediaId}`,
    scenarioId: media.scenarioId,
    presetId: expectedPresetId,
    media: {
      mediaId: media.mediaId,
      sha256: media.sha256,
      encodedWidth: media.encodedWidth,
      encodedHeight: media.encodedHeight,
      durationSec: media.durationSec,
      timebase: media.timebase,
      frameRate: media.frameRate,
      encodedTimeBase: media.encodedTimeBase,
    },
    playbackWindow: doc.playbackWindow as TimeRange | undefined,
    chain,
  }

  if (doc.status === 'annotation-required') {
    return {
      document: { ...base, status: 'annotation-required', reason: String(doc.reason ?? '标注待完成'), tracks: [], rois: [], rules: [], events: [], evidence: [], cues: [] },
      warnings,
    }
  }

  const provenance = asObject(doc.provenance, 'analysis.provenance')
  if (provenance.kind === 'authored-demo') {
    if (typeof doc.reviewedAt !== 'string' || doc.reviewedAt.length === 0) {
      throw new DataContractError('authored-demo 的分析数据必须填写 reviewedAt')
    }
  } else if (provenance.kind !== 'algorithm-output') {
    throw new DataContractError('analysis.provenance.kind 不受支持')
  }

  const document = {
    ...base,
    status: 'ready' as const,
    provenance: provenance as ReadyAnalysis['provenance'],
    reviewedAt: doc.reviewedAt as string | undefined,
    runId: doc.runId as string | undefined,
    modelVersion: doc.modelVersion as string | undefined,
    conditionsId: doc.conditionsId as string | undefined,
    tracks,
    rois,
    rules,
    events,
    evidence,
    cues,
  }
  return { document: document as AnalysisDocument, warnings }
}
