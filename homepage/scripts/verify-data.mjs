/**
 * Re-checks the shipped data layer the same way the browser does at runtime,
 * but without a browser. Run it after editing anything under `data/`.
 *
 *   npm run verify:data
 *
 * It verifies:
 *   1. every MediaAsset: the web rendition file exists and its bytes/sha256
 *      match the manifest, and (when ffprobe is available) its frame count,
 *      duration and frame rate still match the declared timeline;
 *   2. every analysis document: schema version, preset/scenario routing, the
 *      media binding (id + sha256 + size + duration + timebase) against the
 *      manifest, sample ordering, interpolation gaps, ROI vertex counts and
 *      every id referenced by events, evidence and cues.
 *
 * Exit code 1 means at least one error. Warnings are printed but do not fail.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'data')
const publicDir = path.join(root, 'public')

const errors = []
const warnings = []
const fail = (m) => errors.push(m)
const warn = (m) => warnings.push(m)

const readJson = (rel) => {
  const abs = path.join(dataDir, rel)
  if (!fs.existsSync(abs)) {
    fail(`缺少数据文件 data/${rel}`)
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch (error) {
    fail(`data/${rel} 不是合法 JSON：${error.message}`)
    return null
  }
}

const sha256 = (abs) => createHash('sha256').update(fs.readFileSync(abs)).digest('hex')

const ANALYSIS_FILES = [
  ['industry', 'vehicle-detection', 'industry-vehicle-detection.json'],
  ['industry', 'region-entry', 'industry-region-entry.json'],
  ['language', 'find-cyclist', 'language-find-cyclist.json'],
  ['image', 'similar-vehicle', 'image-similar-vehicle.json'],
]

const SUPPORTED_SCHEMA = new Set(['1.0'])

// --------------------------------------------------------------------- media

const manifest = readJson('content/media-manifest.json')
const assets = Array.isArray(manifest?.assets) ? manifest.assets : []
if (!assets.length) fail('media-manifest.json 中没有 assets 数组')

const byId = new Map(assets.map((a) => [a.mediaId, a]))
let ffprobe = true
try {
  execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
} catch {
  ffprobe = false
  warn('未找到 ffprobe，跳过编解码层面的时间轴校验（只校验文件与哈希）')
}

for (const asset of assets) {
  for (const rendition of asset.renditions ?? []) {
    const rel = rendition.url.replace(/^\/+/, '')
    const abs = path.join(publicDir, rel)
    if (!fs.existsSync(abs)) {
      fail(`${asset.mediaId}: 网页派生版缺失 public/${rel}`)
      continue
    }
    const bytes = fs.statSync(abs).size
    if (bytes !== rendition.bytes) {
      fail(`${asset.mediaId}: ${rel} 实际 ${bytes} 字节，manifest 记录 ${rendition.bytes}`)
    }
    const digest = sha256(abs)
    if (digest !== rendition.sha256) {
      fail(`${asset.mediaId}: ${rel} 哈希不符，实际 ${digest}`)
    }
    if (ffprobe) {
      try {
        const out = execFileSync(
          'ffprobe',
          ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
            '-show_entries', 'stream=nb_read_frames,width,height,r_frame_rate',
            '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', abs],
          { encoding: 'utf8' },
        )
        const frames = Number(out.match(/nb_read_frames=(\d+)/)?.[1] ?? NaN)
        const width = Number(out.match(/\bwidth=(\d+)/)?.[1] ?? NaN)
        const height = Number(out.match(/\bheight=(\d+)/)?.[1] ?? NaN)
        const rate = out.match(/r_frame_rate=(\d+)\/(\d+)/)
        const duration = Number(out.match(/^duration=([\d.]+)$/m)?.[1] ?? NaN)
        if (width !== rendition.width || height !== rendition.height) {
          fail(`${asset.mediaId}: ${rel} 尺寸 ${width}x${height} 与 manifest ${rendition.width}x${rendition.height} 不符`)
        }
        if (rate) {
          const fps = Number(rate[1]) / Number(rate[2])
          const declared = Number(asset.frameRate.numerator) / Number(asset.frameRate.denominator)
          if (Math.abs(fps - declared) > 1e-6) {
            fail(`${asset.mediaId}: ${rel} 帧率 ${fps} 与 manifest ${declared} 不符`)
          }
        }
        if (Math.abs(duration - rendition.durationSec) > 0.05) {
          fail(`${asset.mediaId}: ${rel} 时长 ${duration}s 与 manifest ${rendition.durationSec}s 不符`)
        }
        console.log(`  媒体 ${asset.mediaId}: ${rel} ${width}x${height} ${frames} 帧 ${duration}s ✓`)
      } catch (error) {
        fail(`${asset.mediaId}: ffprobe 读取 ${rel} 失败：${error.message}`)
      }
    }
  }
  for (const source of asset.sources ?? []) {
    if (!fs.existsSync(path.join(publicDir, source.url.replace(/^\/+/, '')))) {
      fail(`${asset.mediaId}: sources 中的 ${source.url} 不存在`)
    }
  }
  if (asset.posterUrl && !fs.existsSync(path.join(publicDir, asset.posterUrl.replace(/^\/+/, '')))) {
    fail(`${asset.mediaId}: 海报 ${asset.posterUrl} 不存在`)
  }
}

// ------------------------------------------------------------------ analysis

const chains = readJson('content/algorithm-chains.json')?.chains ?? {}

const checkSegment = (segment, kind, where) => {
  const samples = segment.samples ?? []
  if (!samples.length) {
    fail(`${where}: ${kind}段没有样本`)
    return
  }
  const limit = Number(segment.maxInterpolationGapSec)
  if (!Number.isFinite(limit) || limit <= 0) {
    fail(`${where}: ${kind}段缺少可用的 maxInterpolationGapSec`)
    return
  }
  let previous = -Infinity
  for (const sample of samples) {
    const t = sample.timeSec
    if (!Number.isFinite(t)) fail(`${where}: 样本时间不是有限数`)
    if (t <= previous) fail(`${where}: 样本时间必须严格递增（${previous} → ${t}）`)
    previous = t
  }
  const gaps = samples.slice(1).map((s, i) => s.timeSec - samples[i].timeSec)
  const maxGap = Math.max(...gaps)
  if (maxGap > limit) fail(`${where}: 最大样本间隔 ${maxGap}s 超过上限 ${limit}s`)
  else if (maxGap > limit * 0.75) warn(`${where}: 样本间隔 ${maxGap}s 已达上限 ${limit}s 的 ${Math.round((maxGap / limit) * 100)}%`)
}

for (const [scenarioId, presetId, file] of ANALYSIS_FILES) {
  const doc = readJson(path.posix.join('analysis', file))
  if (!doc) continue
  const where = `${file}`

  if (!SUPPORTED_SCHEMA.has(doc.schemaVersion)) fail(`${where}: schemaVersion ${doc.schemaVersion} 不受支持`)
  if (doc.scenarioId !== scenarioId) fail(`${where}: scenarioId 应为 ${scenarioId}，实际 ${doc.scenarioId}`)
  if (doc.presetId !== presetId) fail(`${where}: presetId 应为 ${presetId}，实际 ${doc.presetId}`)
  if (doc.status !== 'ready') {
    warn(`${where}: status 为 ${doc.status}，该预设不会绘制分析图层`)
    continue
  }
  if (!doc.reviewedAt) fail(`${where}: ready 状态必须写明 reviewedAt`)

  const asset = byId.get(doc.media?.mediaId)
  if (!asset) {
    fail(`${where}: 引用了不存在的媒体 ${doc.media?.mediaId}`)
    continue
  }
  const binding = [
    ['sha256', asset.sha256],
    ['encodedWidth', asset.encodedWidth],
    ['encodedHeight', asset.encodedHeight],
    ['durationSec', asset.durationSec],
    ['timebase', asset.timebase],
  ]
  for (const [key, expected] of binding) {
    if (doc.media[key] !== expected) {
      fail(`${where}: media.${key} 为 ${JSON.stringify(doc.media[key])}，与 media-manifest 的 ${JSON.stringify(expected)} 不一致`)
    }
  }

  const chain = doc.chain ?? chains[doc.chainId]
  if (!chain) fail(`${where}: 找不到算法链（chain 或 chainId）`)
  const chainNodeIds = new Set((chain?.nodes ?? []).map((n) => n.id))

  const trackIds = new Set()
  for (const track of doc.tracks ?? []) {
    if (trackIds.has(track.id)) fail(`${where}: 轨道 id 重复 ${track.id}`)
    trackIds.add(track.id)
    if (track.className === 'vehicle' && !track.label) warn(`${where}: 轨道 ${track.id} 没有 label`)
    for (const segment of track.segments ?? []) {
      checkSegment(segment, '轨道', `${where} / ${track.id}`)
      for (const sample of segment.samples ?? []) {
        const b = sample.box
        if (!b) { fail(`${where}: ${track.id} 的样本缺少 box`); continue }
        if (!(b.width > 0) || !(b.height > 0)) fail(`${where}: ${track.id} 的 box 宽高必须为正`)
        if (b.x < 0 || b.y < 0 || b.x + b.width > 1.0001 || b.y + b.height > 1.0001) {
          fail(`${where}: ${track.id} 的 box 超出画幅 [0,1]`)
        }
      }
    }
  }

  const roiIds = new Set()
  for (const roi of doc.rois ?? []) {
    roiIds.add(roi.id)
    if (roi.coordinateSpace !== 'encoded-frame-normalized') fail(`${where}: ROI ${roi.id} 的坐标系应为 encoded-frame-normalized`)
    for (const segment of roi.segments ?? []) {
      checkSegment(segment, '区域', `${where} / ${roi.id}`)
      let vertexCount = null
      for (const sample of segment.samples ?? []) {
        const n = sample.vertices?.length ?? 0
        if (n < 3) fail(`${where}: ROI ${roi.id} 的多边形不足 3 个顶点`)
        if (vertexCount === null) vertexCount = n
        else if (n !== vertexCount) fail(`${where}: ROI ${roi.id} 同段内顶点数不一致（${vertexCount} → ${n}）`)
      }
    }
  }

  for (const rule of doc.rules ?? []) {
    if (rule.type !== 'outside-to-inside') warn(`${where}: 未知规则类型 ${rule.type}`)
    for (const id of rule.trackIds ?? []) if (!trackIds.has(id)) fail(`${where}: 规则引用了不存在的轨道 ${id}`)
    if (rule.roiId && !roiIds.has(rule.roiId)) fail(`${where}: 规则引用了不存在的区域 ${rule.roiId}`)
    if (!(rule.minimumInsideSec > 0)) fail(`${where}: 规则 minimumInsideSec 必须为正`)
  }

  const evidenceIds = new Set((doc.evidence ?? []).map((e) => e.id))
  const eventIds = new Set()
  for (const event of doc.events ?? []) {
    if (eventIds.has(event.id)) fail(`${where}: 事件 id 重复 ${event.id}`)
    eventIds.add(event.id)
    if (event.visible && event.visible.startSec < event.timeSec) {
      fail(`${where}: 事件 ${event.id} 的 visible.startSec 早于确认时间`)
    }
    for (const id of event.trackIds ?? []) if (!trackIds.has(id)) fail(`${where}: 事件 ${event.id} 引用了不存在的轨道 ${id}`)
    if (event.roiId && !roiIds.has(event.roiId)) fail(`${where}: 事件 ${event.id} 引用了不存在的区域 ${event.roiId}`)
    for (const id of event.evidenceIds ?? []) if (!evidenceIds.has(id)) fail(`${where}: 事件 ${event.id} 引用了不存在的证据 ${id}`)
  }
  for (const evidence of doc.evidence ?? []) {
    if (evidence.mediaId !== doc.media.mediaId) fail(`${where}: 证据 ${evidence.id} 的 mediaId 不匹配`)
  }

  const known = new Set([...chainNodeIds, ...trackIds, ...roiIds, ...eventIds])
  for (const cue of doc.cues ?? []) {
    if (cue.targetId && !known.has(cue.targetId)) fail(`${where}: cue 指向了不存在的对象 ${cue.targetId}`)
  }

  const window = doc.playbackWindow
  if (window && (window.startSec < 0 || window.endSec > asset.durationSec || window.startSec >= window.endSec)) {
    fail(`${where}: playbackWindow ${window.startSec}–${window.endSec} 超出 [0, ${asset.durationSec}]`)
  }
  console.log(`  标注 ${file}: ${doc.tracks?.length ?? 0} 条轨道 / ${doc.rois?.length ?? 0} 个区域 / ${doc.events?.length ?? 0} 个事件 ✓`)
}

// -------------------------------------------------------------------- report

for (const w of warnings) console.warn(`警告  ${w}`)
for (const e of errors) console.error(`错误  ${e}`)
if (errors.length) {
  console.error(`\n数据校验未通过：${errors.length} 个错误，${warnings.length} 个警告`)
  process.exit(1)
}
console.log(`\n数据校验通过：${assets.length} 个媒体资产、${ANALYSIS_FILES.length} 份分析标注，${warnings.length} 个警告`)
