/**
 * Regenerates the three web renditions from the untouched source videos and
 * re-verifies that the presentation timeline is identical to the source.
 *
 *   npm run media            # re-encode into public/media/
 *   npm run media -- --check # verify only, do not write
 *
 * The source videos are never modified. The encoded field of view, the frame
 * count, the frame rate and the duration are preserved, so the normalized
 * annotation coordinates stay valid; only the pixel size changes.
 *
 * `sourceRoot` in MEDIA below points at the delivered originals. Override it
 * with the MEDIA_SOURCE environment variable if the package lives elsewhere.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot =
  process.env.MEDIA_SOURCE ??
  path.resolve(root, '..', 'outputs', 'homepage-implementation-handoff-v1', 'assets', 'video')
const checkOnly = process.argv.includes('--check')

// Same encoder settings the shipped renditions were produced with.
const MEDIA = [
  { mediaId: 'industry-v1', source: 'industry.mp4', out: 'industry.web.mp4', width: 1024 },
  { mediaId: 'language-v1', source: 'language.mp4', out: 'language.web.mp4', width: 1024 },
  { mediaId: 'image-v1', source: 'image-search.mp4', out: 'image-search.web.mp4', width: 1024 },
]

const probe = (abs) => {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=nb_read_frames,width,height,r_frame_rate,start_time',
      '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', abs],
    { encoding: 'utf8' },
  )
  const rate = out.match(/r_frame_rate=(\d+)\/(\d+)/)
  return {
    frames: Number(out.match(/nb_read_frames=(\d+)/)?.[1]),
    width: Number(out.match(/\bwidth=(\d+)/)?.[1]),
    height: Number(out.match(/\bheight=(\d+)/)?.[1]),
    fps: rate ? Number(rate[1]) / Number(rate[2]) : NaN,
    start: Number(out.match(/start_time=([\d.]+)/)?.[1] ?? 0),
    duration: Number(out.match(/^duration=([\d.]+)$/m)?.[1]),
  }
}

const encode = (from, to, width) =>
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', from,
    '-an',
    '-vf', `scale=${width}:-2`,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '27',
    '-pix_fmt', 'yuv420p', '-g', '48', '-movflags', '+faststart', to,
  ])

const sha256 = (abs) => createHash('sha256').update(fs.readFileSync(abs)).digest('hex')

const rows = []
for (const item of MEDIA) {
  const from = path.join(sourceRoot, item.source)
  const to = path.join(root, 'public', 'media', item.out)
  if (!fs.existsSync(from)) {
    console.error(`找不到原片：${from}\n用 MEDIA_SOURCE 环境变量指向 assets/video 目录。`)
    process.exit(1)
  }
  const source = probe(from)
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    encode(from, to, item.width)
  }
  if (!fs.existsSync(to)) {
    console.error(`缺少派生版：${to}`)
    process.exit(1)
  }
  const derived = probe(to)
  const problems = []
  if (derived.frames !== source.frames) problems.push(`帧数 ${source.frames} → ${derived.frames}`)
  if (Math.abs(derived.fps - source.fps) > 1e-6) problems.push(`帧率 ${source.fps} → ${derived.fps}`)
  if (Math.abs(derived.duration - source.duration) > 0.05) problems.push(`时长 ${source.duration}s → ${derived.duration}s`)
  if (Math.abs(derived.start) > 0.04) problems.push(`起始时间 ${source.start}s → ${derived.start}s`)
  // Aspect ratio must be preserved, otherwise the normalized boxes would drift.
  const srcRatio = source.width / source.height
  const outRatio = derived.width / derived.height
  if (Math.abs(srcRatio - outRatio) > 0.005) problems.push(`画幅比 ${srcRatio.toFixed(4)} → ${outRatio.toFixed(4)}`)
  rows.push({
    mediaId: item.mediaId,
    file: item.out,
    size: fs.statSync(to).size,
    sha: sha256(to).slice(0, 16),
    source: `${source.width}x${source.height} ${source.frames}f ${source.duration}s`,
    derived: `${derived.width}x${derived.height} ${derived.frames}f ${derived.duration}s`,
    problems,
  })
}

console.table(rows)
const broken = rows.filter((r) => r.problems.length)
if (broken.length) {
  console.error('\n时间轴或画幅不一致，标注坐标不能直接复用：')
  for (const r of broken) console.error(`  ${r.file}: ${r.problems.join('；')}`)
  process.exit(1)
}
console.log('\n三支派生视频与原片时间轴一致（帧数、帧率、时长、起始时间、画幅比），归一化标注坐标可继续使用。')
console.log('若哈希与 media-manifest.json 不符，请同步更新 manifest 中该 rendition 的 sha256 与 bytes。')
