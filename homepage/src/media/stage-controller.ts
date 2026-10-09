/**
 * The single source of truth for stage time.
 *
 * Everything the visitor sees (boxes, region, chain highlight, results) is
 * derived from `timeupdate`/rAF values of this one <video> element, so pause,
 * seek, replay, rotation and tab switches can never drift apart.
 */
import type { MediaAsset, TimeRange } from '../contracts/domain'

export type StageState =
  | 'poster'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'buffering'
  | 'ended'
  | 'error'

export interface StageControllerOptions {
  video: HTMLVideoElement
  onState: (state: StageState, detail?: string) => void
  onTime: (timeSec: number) => void
  onFirstFrame: (asset: MediaAsset) => void
}

export class StageController {
  private video: HTMLVideoElement
  private options: StageControllerOptions
  private state: StageState = 'poster'
  private window: TimeRange = { startSec: 0, endSec: 0 }
  private asset: MediaAsset | null = null
  private rafId = 0
  private lastEmitted = -1
  private pausedBySystem = false
  private userPaused = false
  private observer: IntersectionObserver | null = null
  private destroyed = false

  constructor(options: StageControllerOptions) {
    this.options = options
    this.video = options.video
    this.video.preload = 'none'
    this.video.muted = true
    this.video.playsInline = true
    this.video.setAttribute('playsinline', '')
    this.video.setAttribute('muted', '')
    this.video.setAttribute('aria-hidden', 'true')
    this.video.addEventListener('loadedmetadata', this.onLoadedMetadata)
    this.video.addEventListener('canplay', this.onCanPlay)
    this.video.addEventListener('play', this.onPlay)
    this.video.addEventListener('pause', this.onPause)
    this.video.addEventListener('ended', this.onEnded)
    this.video.addEventListener('waiting', this.onWaiting)
    this.video.addEventListener('playing', this.onPlaying)
    this.video.addEventListener('seeking', this.onSeeking)
    this.video.addEventListener('seeked', this.onSeeked)
    this.video.addEventListener('error', this.onError)
    this.video.addEventListener('timeupdate', this.onTimeUpdate)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  observeVisibility(target: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.resumeIfAppropriate()
          else this.pauseForSystem()
        }
      },
      { threshold: 0.35 },
    )
    this.observer.observe(target)
  }

  get currentTime(): number {
    return this.video.currentTime
  }

  get currentState(): StageState {
    return this.state
  }

  get mediaAsset(): MediaAsset | null {
    return this.asset
  }

  get playbackWindow(): TimeRange {
    return this.window
  }

  get lastFrameTime(): number {
    const frame = 1 / (this.asset?.frameRate.numerator ?? 24)
    return Math.max(this.window.startSec, this.window.endSec - frame)
  }

  setState(state: StageState, detail?: string): void {
    if (this.state === state && !detail) return
    this.state = state
    this.options.onState(state, detail)
  }

  /** Swaps the media file. Resets time to the window start and pauses. */
  load(asset: MediaAsset, window: TimeRange, sourceUrl: string): void {
    // Loading the same file with the same window again only re-runs resource
    // selection and re-requests the whole byte range. The stage shell loads
    // first and the resolved analysis window can arrive afterwards; when the
    // window turns out identical there is nothing to swap.
    const sameSource = this.asset?.mediaId === asset.mediaId && this.video.getAttribute('src') === sourceUrl
    const sameWindow =
      this.window.startSec === window.startSec && this.window.endSec === window.endSec
    if (sameSource && sameWindow && this.state !== 'error') {
      this.window = window
      this.asset = asset
      return
    }
    this.stopLoop()
    this.asset = asset
    this.window = window
    this.userPaused = false
    this.pausedBySystem = false
    this.lastEmitted = -1
    this.setState('loading')
    // posterUrl is relative to the site root, not to the media file sitting next to it:
    // resolving it against sourceUrl produced /media/media/posters/*.jpg.
    this.video.poster = asset.posterUrl ? new URL(asset.posterUrl, document.baseURI).href : ''
    this.video.src = sourceUrl
    this.video.load()
  }

  private onLoadedMetadata = (): void => {
    if (this.video.duration && Number.isFinite(this.video.duration)) {
      this.window = { startSec: this.window.startSec, endSec: Math.min(this.window.endSec, this.video.duration) }
    }
    this.seekTo(this.window.startSec)
  }

  private onCanPlay = (): void => {
    if (this.asset) this.options.onFirstFrame(this.asset)
    if (this.state === 'loading' || this.state === 'buffering' || this.state === 'poster') this.setState('ready')
    this.emit()
  }

  private onPlay = (): void => {
    this.userPaused = false
    this.pausedBySystem = false
    this.setState('playing')
    this.startLoop()
  }

  private onPause = (): void => {
    this.stopLoop()
    if (this.state !== 'ended' && this.state !== 'error' && this.state !== 'seeking') this.setState('paused')
    this.emit()
  }

  private onEnded = (): void => {
    this.stopLoop()
    this.setState('ended')
    this.emit()
  }

  private onWaiting = (): void => {
    if (this.state === 'playing') this.setState('buffering')
  }

  private onPlaying = (): void => {
    if (this.state === 'buffering' || this.state === 'seeking') this.setState('playing')
  }

  private onSeeking = (): void => {
    this.setState('seeking')
  }

  private onSeeked = (): void => {
    this.setState(this.video.paused ? 'paused' : 'playing')
    this.emit()
  }

  private onError = (): void => {
    const code = this.video.error?.code
    const detail =
      code === 4 || code === 3
        ? '媒体文件缺失或解码失败'
        : code === 2
          ? '网络中断，媒体加载失败'
          : '浏览器拒绝播放该媒体'
    this.stopLoop()
    this.setState('error', detail)
  }

  private onTimeUpdate = (): void => {
    this.emit()
    this.enforceWindow()
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.pauseForSystem()
    else this.resumeIfAppropriate()
  }

  private pauseForSystem(): void {
    if (this.video.paused) return
    this.pausedBySystem = true
    this.video.pause()
  }

  private resumeIfAppropriate(): void {
    if (!this.pausedBySystem || this.userPaused || this.destroyed) return
    if (document.hidden) return
    this.pausedBySystem = false
    void this.video.play().catch(() => {
      this.setState('paused')
    })
  }

  private startLoop(): void {
    this.stopLoop()
    const tick = (): void => {
      if (this.destroyed) return
      this.emit()
      this.enforceWindow()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  private emit(): void {
    const time = this.video.currentTime
    if (Math.abs(time - this.lastEmitted) < 1e-4) return
    this.lastEmitted = time
    this.options.onTime(time)
  }

  private enforceWindow(): void {
    if (this.window.endSec <= 0) return
    if (this.video.currentTime >= this.window.endSec - 1e-3) {
      this.video.pause()
      this.seekTo(this.lastFrameTime)
      this.setState('ended')
    } else if (this.video.currentTime < this.window.startSec - 1e-3) {
      this.seekTo(this.window.startSec)
    }
  }

  async play(): Promise<void> {
    if (this.video.paused) {
      this.userPaused = false
      try {
        await this.video.play()
      } catch {
        this.setState('paused', '浏览器阻止了自动播放，请点击播放')
      }
    }
  }

  pause(): void {
    this.userPaused = true
    this.pausedBySystem = false
    this.video.pause()
  }

  seekTo(timeSec: number): void {
    const clamped = Math.min(Math.max(timeSec, this.window.startSec), this.lastFrameTime)
    this.video.currentTime = clamped
    this.lastEmitted = -1
    this.emit()
  }

  replay(): void {
    this.seekTo(this.window.startSec)
    void this.play()
  }

  retry(): void {
    const asset = this.asset
    if (!asset) return
    const src = this.video.currentSrc
    this.setState('loading')
    // Re-assign first, then load. Calling load() and re-assigning the same src
    // afterwards re-runs resource selection and strands the element at readyState 0
    // with no further request — the stage then shows a loading state forever.
    if (src) this.video.src = src
    this.video.load()
  }

  destroy(): void {
    this.destroyed = true
    this.stopLoop()
    this.observer?.disconnect()
    this.observer = null
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata)
    this.video.removeEventListener('canplay', this.onCanPlay)
    this.video.removeEventListener('play', this.onPlay)
    this.video.removeEventListener('pause', this.onPause)
    this.video.removeEventListener('ended', this.onEnded)
    this.video.removeEventListener('waiting', this.onWaiting)
    this.video.removeEventListener('playing', this.onPlaying)
    this.video.removeEventListener('seeking', this.onSeeking)
    this.video.removeEventListener('seeked', this.onSeeked)
    this.video.removeEventListener('error', this.onError)
    this.video.removeEventListener('timeupdate', this.onTimeUpdate)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.video.removeAttribute('src')
    this.video.load()
  }
}
