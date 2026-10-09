/**
 * The AIMasterflow stage: one video, one analysis layer, three task presets.
 *
 * Switching task really swaps the media file and the analysis document; nothing
 * from the previous scenario (playback, results, selected node, compare split)
 * is allowed to survive the switch.
 */
import type {
  AnalysisDocument,
  AnalysisEvent,
  MediaAsset,
  PageContent,
  PresetId,
  PresetPresentation,
  PresetReferenceImage,
  Providers,
  PublicAppConfig,
  RequestContext,
  ScenarioId,
} from '../contracts/domain'
import { DataContractError } from '../contracts/validation'
import { type ResolvedScenario, chainStateAt, deriveFrame, resolveScenario } from '../domain/analysis-state'
import { evaluateRegionEntry } from '../domain/region-entry'
import { StageController, type StageState } from '../media/stage-controller'
import { StageOverlay } from '../render/stage-overlay'
import type { StaticBundle } from '../providers/static-providers'

export type DisplayMode = 'analysis' | 'raw' | 'compare'

interface TaskTab {
  scenarioId: ScenarioId
  label: string
  description: string
}

const INDUSTRY_PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'region-entry', label: '区域进入' },
  { id: 'vehicle-detection', label: '车辆检测' },
]

/** Narrowing helpers: the union hides the scenario-specific fields. */
function queryTextOf(presentation: PresetPresentation): string | null {
  const query = (presentation as { query?: { text: string } }).query
  return query?.text ?? null
}

function referenceOf(presentation: PresetPresentation): PresetReferenceImage | null {
  const reference = (presentation as { reference?: PresetReferenceImage }).reference
  return reference ?? null
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface CapabilityStageDeps {
  config: PublicAppConfig
  providers: Providers
  bundle: StaticBundle
  page: PageContent
}

export class CapabilityStage {
  private root: HTMLElement
  private deps: CapabilityStageDeps

  private video!: HTMLVideoElement
  private stageHost!: HTMLDivElement
  private overlay!: StageOverlay
  private controller!: StageController

  private tablist!: HTMLDivElement
  private panel!: HTMLDivElement
  private toolbar!: HTMLDivElement
  private controls!: HTMLDivElement
  private playButton!: HTMLButtonElement
  private replayButton!: HTMLButtonElement
  private scrubber!: HTMLInputElement
  private timeLabel!: HTMLSpanElement
  private modeGroup!: HTMLDivElement
  private divider!: HTMLDivElement
  private statusLine!: HTMLParagraphElement
  private chainHost!: HTMLDivElement
  private chainList!: HTMLOListElement
  private chainDetail!: HTMLParagraphElement
  private chainToggle!: HTMLButtonElement
  private summaryHost!: HTMLDivElement
  private resultBar!: HTMLDivElement
  private liveRegion!: HTMLParagraphElement

  private tabs: TaskTab[] = []
  private scenarioId: ScenarioId = 'industry'
  private presetId: PresetId = 'region-entry'
  private presentation: PresetPresentation | null = null
  private mediaAsset: MediaAsset | null = null
  private document_: AnalysisDocument | null = null
  private scenario: ResolvedScenario | null = null
  private displayMode: DisplayMode = 'analysis'
  private hasPlayed = false
  private analysisNote: string | null = null
  private compareRatio = 0.5
  private selectedNodeId: string | null = null
  private resultExpanded = false
  private chainExpanded = false
  private requestId = 0
  private abort: AbortController | null = null
  private resizeObserver: ResizeObserver | null = null
  private reducedMotion = false
  private shownEventIds = new Set<string>()

  constructor(root: HTMLElement, deps: CapabilityStageDeps) {
    this.root = root
    this.deps = deps
  }

  async start(): Promise<void> {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.buildSkeleton()
    this.controller = new StageController({
      video: this.video,
      onState: (state, detail) => this.onStageState(state, detail),
      onTime: (timeSec) => this.onTime(timeSec),
      onFirstFrame: () => {
        this.coverButton.hidden = true
        this.overlay.syncLayout()
      },
    })
    this.controller.observeVisibility(this.stageHost)
    if (typeof ResizeObserver !== 'undefined') {
      let queued = false
      this.resizeObserver = new ResizeObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          this.overlay.syncLayout()
        })
      })
      this.resizeObserver.observe(this.stageHost)
    }
    this.tabs = this.deps.page.tasks.map((task) => ({
      scenarioId: task.id,
      label: task.label,
      description: task.summary,
    }))
    this.renderTabs()
    this.bindGlobalKeys()
    await this.selectTask('industry', 'region-entry', { autoPlay: false })
  }

  private onStageState(state: StageState, detail?: string): void {
    this.playButton.textContent = state === 'playing' ? '暂停' : '播放'
    // The cover is a poster plus a play affordance: once playback started it would
    // sit on top of a frame the visitor is already watching.
    this.coverButton.hidden = !(
      state === 'poster' ||
      state === 'loading' ||
      state === 'ready' ||
      state === 'error' ||
      (state === 'ended' && !this.hasPlayed)
    )
    // The same control is the retry affordance while the media is broken.
    const coverText = this.coverButton.querySelector('.stage__cover-text')
    if (coverText) coverText.textContent = state === 'error' ? '重试加载演示画面' : '播放演示画面'
    const copy: Partial<Record<StageState, string>> = {
      loading: '正在准备演示画面…',
      buffering: '画面缓冲中…',
      error: detail ?? '媒体播放失败',
      ended: '演示片段已结束，可重播或查看片段。',
    }
    const message = copy[state]
    if (message) this.setStatus(message, state)
    else if (state === 'ready' || state === 'playing' || state === 'paused') this.setStatus('', state)
    if (state === 'ended') this.onEnded()
  }

  private onEnded(): void {
    const events = this.currentEvents()
    if (this.scenarioId === 'industry' && events.length > 0) {
      this.summaryHost.textContent = ''
      this.summaryHost.append(h('span', 'stage-summary__hint', '区域进入已确认'))
      const next: PresetId = this.presetId === 'region-entry' ? 'vehicle-detection' : 'region-entry'
      const button = h('button', 'btn btn--primary', next === 'vehicle-detection' ? '切换为车辆检测' : '切换为区域进入')
      button.type = 'button'
      button.addEventListener('click', () => {
        void this.selectTask('industry', next)
      })
      this.summaryHost.append(button)
    }
  }

  // ---------------------------------------------------------------- skeleton

  private buildSkeleton(): void {
    const labels = this.deps.bundle.labels
    const section = h('section', 'section section--capabilities')
    section.id = 'capabilities'

    const head = h('div', 'section__head')
    head.append(h('p', 'eyebrow', labels.capabilities.eyebrow))
    head.append(h('h2', 'section__title', labels.capabilities.title))
    const notice = h('p', 'stage-notice')
    notice.append(h('span', 'tag', '功能演示'))
    notice.append(h('span', 'stage-notice__text', '画面为 AI 生成场景，标注与结果用于说明分析流程'))
    head.append(notice)
    section.append(head)

    this.tablist = h('div', 'task-tabs')
    this.tablist.setAttribute('role', 'tablist')
    this.tablist.setAttribute('aria-label', '演示任务')
    section.append(this.tablist)

    this.panel = h('div', 'task-panel')
    this.panel.id = 'task-panel'
    this.panel.setAttribute('role', 'tabpanel')
    this.panel.tabIndex = 0
    section.append(this.panel)

    this.toolbar = h('div', 'stage-toolbar')
    this.panel.append(this.toolbar)

    this.stageHost = h('div', 'stage')
    this.stageHost.setAttribute('role', 'group')
    this.stageHost.setAttribute('aria-label', '演示画面')
    this.video = h('video', 'stage__video')
    this.video.preload = 'none'
    this.video.muted = true
    this.video.playsInline = true
    this.stageHost.append(this.video)

    const cover = h('button', 'stage__cover')
    cover.type = 'button'
    cover.innerHTML = '<span class="stage__cover-icon" aria-hidden="true"></span><span class="stage__cover-text">播放演示画面</span>'
    cover.addEventListener('click', () => {
      // A failed source can only come back through a reload, never through play().
      if (this.controller.currentState === 'error') {
        this.controller.retry()
        return
      }
      this.hasPlayed = true; void this.controller.play()
    })
    this.stageHost.append(cover)
    this.coverButton = cover

    this.overlay = new StageOverlay(this.stageHost, 1024, 576)
    this.stageHost.addEventListener('click', (event) => {
      const trackId = this.overlay.handleOverlayClick(event)
      if (trackId) this.focusResult(trackId)
    })

    this.divider = h('div', 'stage__divider')
    this.divider.setAttribute('role', 'slider')
    this.divider.tabIndex = 0
    this.divider.hidden = true
    this.divider.setAttribute('aria-label', '原始画面与分析效果分界')
    this.divider.setAttribute('aria-valuemin', '0')
    this.divider.setAttribute('aria-valuemax', '100')
    this.divider.setAttribute('aria-valuenow', '50')
    this.stageHost.append(this.divider)
    this.bindDivider()

    this.statusLine = h('p', 'stage__status')
    this.statusLine.setAttribute('role', 'status')
    this.stageHost.append(this.statusLine)

    this.panel.append(this.stageHost)

    this.controls = h('div', 'stage-controls')
    this.playButton = h('button', 'btn btn--icon', '播放')
    this.playButton.type = 'button'
    this.playButton.dataset.control = 'play'
    this.playButton.setAttribute('aria-label', '播放或暂停演示')
    this.playButton.addEventListener('click', () => this.togglePlay())
    this.replayButton = h('button', 'btn', '重播演示')
    this.replayButton.type = 'button'
    this.replayButton.dataset.control = 'replay'
    this.replayButton.addEventListener('click', () => this.controller.replay())
    this.scrubber = h('input', 'scrubber')
    this.scrubber.type = 'range'
    this.scrubber.min = '0'
    this.scrubber.max = '1000'
    this.scrubber.value = '0'
    this.scrubber.step = '1'
    this.scrubber.setAttribute('aria-label', '演示进度')
    this.scrubber.addEventListener('input', () => this.onScrub())
    this.timeLabel = h('span', 'stage-controls__time', '00:00.00')
    this.modeGroup = h('div', 'segmented')
    this.modeGroup.setAttribute('role', 'group')
    this.modeGroup.setAttribute('aria-label', '观看方式')
    this.controls.append(this.playButton, this.replayButton, this.scrubber, this.timeLabel, this.modeGroup)
    this.panel.append(this.controls)

    this.summaryHost = h('div', 'stage-summary')
    this.summaryHost.hidden = true
    this.panel.append(this.summaryHost)

    this.resultBar = h('div', 'result-bar')
    this.panel.append(this.resultBar)

    this.chainHost = h('div', 'chain')
    this.chainToggle = h('button', 'btn btn--ghost chain__toggle', '展开算法链')
    this.chainToggle.type = 'button'
    this.chainToggle.setAttribute('aria-expanded', 'false')
    this.chainToggle.addEventListener('click', () => {
      this.chainExpanded = !this.chainExpanded
      this.chainToggle.setAttribute('aria-expanded', String(this.chainExpanded))
      this.chainToggle.textContent = this.chainExpanded ? '收起算法链' : '展开算法链'
      this.chainHost.classList.toggle('chain--expanded', this.chainExpanded)
      this.chainList.hidden = !this.chainExpanded
    })
    this.chainList = h('ol', 'chain__list')
    // The full chain is only collapsed on narrow screens; wide screens always show it.
    this.chainExpanded = !window.matchMedia('(max-width: 1023px)').matches
    this.chainList.hidden = !this.chainExpanded
    this.chainToggle.hidden = this.chainExpanded
    this.chainDetail = h('p', 'chain__detail')
    this.chainDetail.setAttribute('aria-live', 'polite')
    this.chainHost.append(this.chainToggle, this.chainList, this.chainDetail)
    this.panel.append(this.chainHost)
    window.addEventListener('resize', () => {
      const wide = !window.matchMedia('(max-width: 1023px)').matches
      if (wide) {
        this.chainExpanded = true
        this.chainList.hidden = false
        this.chainToggle.hidden = true
        this.chainHost.classList.add('chain--expanded')
      } else if (!this.chainExpanded) {
        this.chainList.hidden = true
        this.chainToggle.hidden = false
        this.chainHost.classList.remove('chain--expanded')
      }
    })

    this.liveRegion = h('p', 'visually-hidden')
    this.liveRegion.setAttribute('aria-live', 'polite')
    this.panel.append(this.liveRegion)

    const benefits = h('p', 'section__benefits')
    benefits.textContent = this.deps.bundle.labels.capabilities.benefits.join(' · ')
    section.append(benefits)

    this.root.append(section)
  }

  private coverButton!: HTMLButtonElement

  // -------------------------------------------------------------------- tabs

  private renderTabs(): void {
    this.tablist.textContent = ''
    this.tabs.forEach((tab, index) => {
      const button = h('button', 'task-tab')
      button.type = 'button'
      button.id = `task-tab-${tab.scenarioId}`
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', String(this.scenarioId === tab.scenarioId))
      button.tabIndex = this.scenarioId === tab.scenarioId ? 0 : -1
      button.setAttribute('aria-controls', 'task-panel')
      button.dataset.scenario = tab.scenarioId
      const label = h('span', 'task-tab__label', tab.label)
      const desc = h('span', 'task-tab__desc', tab.description)
      button.append(label, desc)
      button.addEventListener('click', () => {
        void this.selectTask(tab.scenarioId, this.defaultPresetFor(tab.scenarioId))
      })
      button.addEventListener('keydown', (event) => this.onTabKeydown(event, index))
      this.tablist.append(button)
    })
  }

  private onTabKeydown(event: KeyboardEvent, index: number): void {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % this.tabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + this.tabs.length) % this.tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = this.tabs.length - 1
    const tab = this.tabs[next]
    if (!tab) return
    // Focus moves first; only activation loads a video.
    this.tablist.querySelectorAll<HTMLButtonElement>('.task-tab').forEach((node, i) => {
      node.tabIndex = i === next ? 0 : -1
    })
    ;(this.tablist.children[next] as HTMLElement | undefined)?.focus()
    void this.selectTask(tab.scenarioId, this.defaultPresetFor(tab.scenarioId))
  }

  private defaultPresetFor(scenarioId: ScenarioId): PresetId {
    if (scenarioId === 'industry') {
      // `this.presetId` is overwritten by the scenario the visitor just left, so a
      // foreign id here made the industry tab fall through to "演示数据尚未提供"
      // and keep the previous scenario's toolbar and video.
      return INDUSTRY_PRESETS.some((preset) => preset.id === this.presetId) ? this.presetId : 'region-entry'
    }
    return scenarioId === 'language' ? 'find-cyclist' : 'similar-vehicle'
  }

  // ------------------------------------------------------------------ loading

  private async selectTask(scenarioId: ScenarioId, presetId: PresetId, options: { autoPlay?: boolean } = {}): Promise<void> {
    this.abort?.abort()
    this.requestId += 1
    const requestId = this.requestId
    const abort = new AbortController()
    this.abort = abort
    const context: RequestContext = { requestId: String(requestId), signal: abort.signal }

    this.scenarioId = scenarioId
    this.presetId = presetId
    this.clearScenarioState()
    this.analysisNote = null
    this.renderTabs()
    this.setStatus('正在准备演示画面…', 'loading')

    const presets = this.deps.bundle.presets
    const presentation = presets.find(
      (item) => item.selection.scenarioId === scenarioId && item.selection.presetId === presetId,
    )
    if (!presentation) {
      this.analysisNote = '该任务的演示数据尚未提供。'
      this.setStatus(this.analysisNote, 'error')
      this.renderResultBar()
      return
    }

    try {
      const assetPromise = this.deps.providers.media.getMedia(presentation.mediaId, context)
      const analysisPromise = this.deps.providers.analysis.getPreset(presentation.selection, context)
      const asset = await assetPromise
      if (requestId !== this.requestId) return
      this.mediaAsset = asset
      this.presentation = presentation

      // The scenario shell (media, preset switcher, display modes) does not depend on
      // the analysis document, so it appears even when the analysis is unavailable.
      this.mountMedia(asset, presentation)
      this.renderToolbar(presentation)
      this.renderModes()
      this.controller.load(
        asset,
        presentation.playbackWindow ?? { startSec: 0, endSec: asset.durationSec },
        this.mediaUrl(asset),
      )

      const document_ = await analysisPromise
      if (requestId !== this.requestId) return
      this.document_ = document_

      const window = this.resolveWindow(document_, presentation)
      this.controller.load(asset, window, this.mediaUrl(asset))
      this.scrubber.min = '0'
      this.scrubber.max = String(Math.round((window.endSec - window.startSec) * 1000))
      this.scrubber.value = '0'
      this.applyDocument(document_, window)
      this.renderChain()
      this.renderResultBar()
      // The overlay is a pure function of media time, so a document that arrives while
      // the stage is paused still has to paint its current frame.
      this.onTime(this.controller.currentTime)

      if (options.autoPlay && !this.reducedMotion) {
        this.hasPlayed = true
        void this.controller.play()
      }
    } catch (error) {
      if (abort.signal.aborted || requestId !== this.requestId) return
      const message = error instanceof DataContractError ? error.message : '演示数据加载失败'
      this.analysisNote = `${message}。画面仍可观看，不显示分析标记。`
      this.setStatus(this.analysisNote, 'error')
      this.renderChain()
      this.renderResultBar()
      if (this.mediaAsset) {
        this.controller.load(
          this.mediaAsset,
          this.scenario?.window ?? { startSec: 0, endSec: this.mediaAsset.durationSec },
          this.mediaUrl(this.mediaAsset),
        )
      }
    }
  }

  private mediaUrl(asset: MediaAsset): string {
    const source = asset.sources[0]?.url ?? ''
    return new URL(source, this.deps.config.basePath).href
  }

  private resolveWindow(document_: AnalysisDocument, presentation: PresetPresentation): { startSec: number; endSec: number } {
    const fromPresentation = presentation.playbackWindow
    const fromAnalysis = document_.playbackWindow
    if (fromPresentation && fromAnalysis) {
      const same = Math.abs(fromPresentation.startSec - fromAnalysis.startSec) < 1e-6 &&
        Math.abs(fromPresentation.endSec - fromAnalysis.endSec) < 1e-6
      if (!same) {
        throw new DataContractError('预设与分析数据的播放窗口不一致，已停用分析叠加层')
      }
    }
    const chosen = fromAnalysis ?? fromPresentation
    if (chosen) return { ...chosen }
    const duration = this.mediaAsset?.durationSec ?? document_.media.durationSec
    return { startSec: 0, endSec: duration }
  }

  private mountMedia(asset: MediaAsset, presentation: PresetPresentation): void {
    void presentation
    const rendition = asset.renditions?.[0]
    this.overlay.setEncodedSize(rendition?.width ?? asset.encodedWidth, rendition?.height ?? asset.encodedHeight)
    this.stageHost.style.setProperty('--stage-aspect', `${rendition?.width ?? asset.encodedWidth} / ${rendition?.height ?? asset.encodedHeight}`)
    if (asset.posterUrl) {
      this.video.poster = new URL(asset.posterUrl, this.deps.config.basePath).href
    }
  }

  private applyDocument(document_: AnalysisDocument, window: { startSec: number; endSec: number }): void {
    this.scenario = null
    if (document_.status === 'annotation-required') {
      this.scenario = null
      this.setStatus(`分析标记待配置：${document_.reason}`, 'pending')
      this.renderChain()
      return
    }
    const rule = document_.rules[0]
    let derivation = null
    if (rule && rule.type === 'outside-to-inside') {
      const track = document_.tracks.find((item) => item.id === rule.trackIds[0])
      const roi = document_.rois.find((item) => item.id === rule.roiId)
      if (track && roi) {
        derivation = evaluateRegionEntry(track, roi, rule, {
          startSec: window.startSec,
          endSec: window.endSec,
        })
        const event = document_.events[0]
        if (event) {
          const derived = derivation.confirmedTimeSec
          if (derived !== null && Math.abs(derived - event.timeSec) > 0.02) {
            console.warn(
              `[analysis] ${document_.analysisId} 声明的确认时间 ${event.timeSec} 与几何推导 ${derived.toFixed(2)} 不一致`,
            )
          }
        }
      }
    }
    this.scenario = resolveScenario(document_, derivation)
    this.setStatus('', 'ready')
  }

  private clearScenarioState(): void {
    this.scenario = null
    this.document_ = null
    this.shownEventIds.clear()
    this.resultExpanded = false
    this.selectedNodeId = null
    this.displayMode = 'analysis'
    this.compareRatio = 0.5
    this.overlay.clearToast()
    this.overlay.setCompare(null)
    this.resultBar.textContent = ''
    this.chainList.textContent = ''
    this.chainDetail.textContent = ''
    this.summaryHost.textContent = ''
    this.summaryHost.hidden = true
  }

  // ------------------------------------------------------------------ toolbar

  private renderToolbar(presentation: PresetPresentation): void {
    this.toolbar.textContent = ''
    if (this.scenarioId === 'industry') {
      const group = h('div', 'segmented segmented--presets')
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', '行业任务预设')
      for (const preset of INDUSTRY_PRESETS) {
        const button = h('button', 'segmented__item', preset.label)
        button.type = 'button'
        button.setAttribute('aria-pressed', String(preset.id === this.presetId))
        button.addEventListener('click', () => {
          if (preset.id === this.presetId) return
          void this.selectTask('industry', preset.id)
        })
        group.append(button)
      }
      this.toolbar.append(group)
      this.toolbar.append(
        h('p', 'stage-toolbar__hint', this.presetId === 'region-entry' ? '跟踪同一辆车，判断它与关注区域的关系变化' : '在画面中定位车辆，输出目标位置'),
      )
      return
    }

    if (this.scenarioId === 'language') {
      const text = queryTextOf(presentation) ?? '查找骑行人员'
      this.toolbar.append(h('span', 'chip chip--query', `示例：${text}`))
      const run = h('button', 'btn btn--primary', '演示查找')
      run.type = 'button'
      run.addEventListener('click', () => this.controller.replay())
      const clip = h('button', 'btn', '查看匹配片段')
      clip.type = 'button'
      clip.addEventListener('click', () => this.jumpToEvent())
      this.toolbar.append(run, clip)
      this.toolbar.append(h('p', 'stage-toolbar__hint', `当前演示支持：${text}。切换到其它文字不会产生新的分析结果。`))
      return
    }

    const reference = referenceOf(presentation)
    if (reference) {
      const thumb = h('img', 'reference-thumb')
      thumb.src = new URL(reference.url, this.deps.config.basePath).href
      thumb.alt = '示例参考图'
      thumb.width = 88
      thumb.height = 56
      thumb.loading = 'lazy'
      this.toolbar.append(thumb)
      this.toolbar.append(h('span', 'chip', '示例参考图 · 来自本段演示画面'))
    }
    const find = h('button', 'btn btn--primary', '查找相似目标')
    find.type = 'button'
    find.addEventListener('click', () => this.controller.replay())
    const clip = h('button', 'btn', '查看匹配片段')
    clip.type = 'button'
    clip.addEventListener('click', () => this.jumpToEvent())
    this.toolbar.append(find, clip)
    this.toolbar.append(h('p', 'stage-toolbar__hint', '按外观查找相似目标，不据此确认车辆身份。'))
  }

  private renderModes(): void {
    this.modeGroup.textContent = ''
    const declared = this.deps.bundle.labels.capabilities.displayModes
    const modes: Array<{ id: DisplayMode; label: string }> = (declared ?? []).map((mode) => ({
      id: mode.id as DisplayMode,
      label: mode.label,
    }))
    for (const mode of modes) {
      const button = h('button', 'segmented__item', mode.label)
      button.type = 'button'
      button.dataset.mode = mode.id
      button.setAttribute('aria-pressed', String(this.displayMode === mode.id))
      button.addEventListener('click', () => this.setDisplayMode(mode.id))
      this.modeGroup.append(button)
    }
  }

  private setDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode
    this.modeGroup.querySelectorAll<HTMLButtonElement>('.segmented__item').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.dataset.mode === mode))
    })
    this.divider.hidden = mode !== 'compare'
    this.overlay.setCompare(mode === 'compare' ? this.compareRatio : null)
    this.stageHost.dataset.mode = mode
  }

  // ------------------------------------------------------------------ results

  private currentEvents(): AnalysisEvent[] {
    return this.document_?.status === 'ready' ? this.document_.events : []
  }

  /** Honest empty state: says why there is no result yet instead of a blank bar. */
  private emptyResultNote(): string {
    if (this.analysisNote) return this.analysisNote
    const document_ = this.document_
    if (document_ && document_.status === 'annotation-required') {
      return '该任务的演示标注尚未完成，画面按原样播放，不显示分析标记。'
    }
    if (this.scenario) {
      const event = this.scenario.document.events[0]
      if (!event) return '当前片段没有产生结果，可拖动进度或重播演示。'
      return '结果将在条件成立时出现，可拖动进度查看事件前后。'
    }
    return '演示数据加载中…'
  }

  private renderResultBar(): void {
    this.resultBar.textContent = ''
    const events = this.currentEvents()
    if (events.length === 0) {
      this.resultBar.append(h('p', 'result-bar__empty', this.emptyResultNote()))
      return
    }
    const event = events[0]!
    const document_ = this.document_
    if (document_?.status !== 'ready') return
    const evidence = document_.evidence.filter((item) => event.evidenceIds.includes(item.id))
    const trackIds = new Set(event.trackIds)

    const head = h('div', 'result-bar__head')
    head.append(h('span', 'result-bar__title', event.title))
    const toggle = h('button', 'btn btn--ghost', '查看详情')
    toggle.type = 'button'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.addEventListener('click', () => {
      this.resultExpanded = !this.resultExpanded
      toggle.setAttribute('aria-expanded', String(this.resultExpanded))
      this.renderResultBar()
    })
    const clip = h('button', 'btn', '查看片段')
    clip.type = 'button'
    clip.addEventListener('click', () => {
      const first = evidence[0]
      const target = first?.timeSec ?? event.timeSec
      this.controller.seekTo(target)
      this.hasPlayed = true; void this.controller.play()
    })
    head.append(clip, toggle)
    this.resultBar.append(head)

    const evidenceRow = h('ul', 'result-bar__evidence')
    const rows: Array<[string, string]> = [
      ['目标', document_.tracks.filter((t) => trackIds.has(t.id)).map((t) => t.label).join('、') || '演示目标'],
      ['判断条件', this.conditionText(event)],
      ['事件时间', formatTime(event.timeSec)],
      ['关联片段', evidence.length > 0 ? `${evidence[0]!.mediaId} · ${formatTime(evidence[0]!.timeSec)}` : '—'],
    ]
    for (const [name, value] of rows) {
      const item = h('li', 'result-bar__item')
      item.append(h('span', 'result-bar__key', name), h('span', 'result-bar__value', value))
      evidenceRow.append(item)
    }
    this.resultBar.append(evidenceRow)

    if (this.resultExpanded) {
      const detail = h('div', 'result-bar__detail')
      const cross = event.observedCrossingTimeSec
      if (cross !== undefined) {
        detail.append(h('p', '', `实际越界时刻 ${formatTime(cross)}，确认后 ${Math.max(0, event.timeSec - cross).toFixed(2)} 秒给出结果`))
      }
      detail.append(
        h('p', '', '结果用于说明分析流程：目标被确认、条件生效、节点工作、结果出现。画面与标注均为演示数据。'),
      )
      this.resultBar.append(detail)
    }
  }

  private conditionText(event: AnalysisEvent): string {
    const document_ = this.document_
    if (document_?.status !== 'ready') return '—'
    const rule = document_.rules[0]
    if (rule) {
      const roi = document_.rois.find((item) => item.id === rule.roiId)
      return `${roi?.label ?? '关注区域'}：目标由区域外进入并持续 ${rule.minimumInsideSec} 秒`
    }
    if (event.kind === 'target-found') {
      const query = this.presentation ? queryTextOf(this.presentation) : null
      return query ? `文字条件：${query}` : '文字条件：预设关注目标'
    }
    return '外观相似：与示例参考图外观接近'
  }

  private jumpToEvent(): void {
    const events = this.currentEvents()
    const event = events[0]
    if (!event) return
    const start = Math.max(this.controller.playbackWindow.startSec, event.timeSec - 0.5)
    this.controller.seekTo(start)
    void this.controller.play()
  }

  private focusResult(_trackId: string): void {
    this.controller.pause()
    this.renderResultBar()
  }

  // -------------------------------------------------------------------- chain

  private renderChain(): void {
    this.chainList.textContent = ''
    const document_ = this.document_
    const nodes = document_?.chain.nodes ?? []
    // With no analysis data there is no chain to show; an empty bar would look broken.
    this.chainHost.hidden = nodes.length === 0
    if (nodes.length === 0) return
    nodes.forEach((node, index) => {
      const item = h('li', 'chain__node')
      item.dataset.nodeId = node.id
      const button = h('button', 'chain__button')
      button.type = 'button'
      button.setAttribute('aria-pressed', String(this.selectedNodeId === node.id))
      button.append(h('span', 'chain__index', String(index + 1)), h('span', 'chain__label', node.label))
      button.addEventListener('click', () => {
        this.selectedNodeId = this.selectedNodeId === node.id ? null : node.id
        this.renderChain()
      })
      item.append(button)
      if (index < nodes.length - 1) item.append(h('span', 'chain__arrow', '→'))
      this.chainList.append(item)
    })
    const selected = nodes.find((node) => node.id === this.selectedNodeId)
    this.chainDetail.textContent = selected
      ? `${selected.label}：${selected.description}`
      : '选择节点可查看它在流程中的作用。'
  }

  private updateChain(frame: ReturnType<typeof deriveFrame>): void {
    if (!this.scenario) return
    const state = chainStateAt(this.scenario, frame)
    this.chainList.querySelectorAll<HTMLLIElement>('.chain__node').forEach((node) => {
      const id = node.dataset.nodeId ?? ''
      node.classList.toggle('chain__node--active', state.activeNodeIds.includes(id))
      node.classList.toggle('chain__node--done', state.doneNodeIds.includes(id))
    })
  }

  // ----------------------------------------------------------------- controls

  private togglePlay(): void {
    if (this.controller.currentState === 'playing') this.controller.pause()
    else {
      this.hasPlayed = true
      void this.controller.play()
    }
  }

  private onScrub(): void {
    const value = Number(this.scrubber.value) / 1000
    const window = this.controller.playbackWindow
    this.controller.seekTo(window.startSec + value)
  }

  private bindDivider(): void {
    const apply = (clientX: number): void => {
      const rect = this.stageHost.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      this.compareRatio = ratio
      this.overlay.setCompare(ratio)
      this.divider.style.left = `${(ratio * 100).toFixed(2)}%`
      this.divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)))
    }
    const onMove = (event: PointerEvent): void => {
      if (!this.divider.hasPointerCapture(event.pointerId)) return
      apply(event.clientX)
    }
    this.divider.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.controller.pause()
      this.divider.setPointerCapture(event.pointerId)
      apply(event.clientX)
    })
    this.divider.addEventListener('pointermove', onMove)
    this.divider.addEventListener('pointerup', (event) => {
      if (this.divider.hasPointerCapture(event.pointerId)) this.divider.releasePointerCapture(event.pointerId)
    })
    this.divider.addEventListener('pointercancel', () => undefined)
    this.divider.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.02
      if (event.key === 'ArrowLeft') this.compareRatio = Math.max(0, this.compareRatio - step)
      else if (event.key === 'ArrowRight') this.compareRatio = Math.min(1, this.compareRatio + step)
      else if (event.key === 'Home') this.compareRatio = 0
      else if (event.key === 'End') this.compareRatio = 1
      else return
      event.preventDefault()
      this.controller.pause()
      this.overlay.setCompare(this.compareRatio)
      this.divider.style.left = `${(this.compareRatio * 100).toFixed(2)}%`
      this.divider.setAttribute('aria-valuenow', String(Math.round(this.compareRatio * 100)))
    })
  }

  private bindGlobalKeys(): void {
    this.root.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === ' ' && event.target === this.panel) {
        event.preventDefault()
        this.togglePlay()
      }
    })
  }

  // ------------------------------------------------------------------ runtime

  private onTime(timeSec: number): void {
    const window = this.controller.playbackWindow
    const clamped = Math.min(Math.max(timeSec, window.startSec), this.controller.lastFrameTime)
    if (Math.abs(Number(this.scrubber.value) / 1000 - (clamped - window.startSec)) > 0.01) {
      this.scrubber.value = String(Math.round((clamped - window.startSec) * 1000))
    }
    this.timeLabel.textContent = `${formatTime(clamped - window.startSec)} / ${formatTime(window.endSec - window.startSec)}`

    if (!this.scenario) {
      this.overlay.update({ timeSec: clamped, targets: [], trails: new Map(), regions: [], activeEvents: [], freshEvents: [], phase: 'waiting' }, this.displayMode === 'analysis')
      return
    }
    const frame = deriveFrame(this.scenario, clamped)
    this.overlay.update(frame, this.displayMode !== 'raw')
    this.updateChain(frame)
    this.updateSummary(frame.phase)
    this.syncEvents(frame)
  }

  private syncEvents(frame: ReturnType<typeof deriveFrame>): void {
    for (const event of frame.activeEvents) {
      if (this.shownEventIds.has(event.id)) continue
      this.shownEventIds.add(event.id)
      this.overlay.showEventToast(event, (eventId) => this.openEvent(eventId))
      this.announce(`${event.title}，时间 ${formatTime(event.timeSec)}`)
      this.renderResultBar()
    }
    const currentIds = new Set(frame.activeEvents.map((event) => event.id))
    for (const id of Array.from(this.shownEventIds)) {
      if (!currentIds.has(id)) this.shownEventIds.delete(id)
    }
  }

  private openEvent(_eventId: string): void {
    this.controller.pause()
    this.resultExpanded = true
    this.renderResultBar()
  }

  private updateSummary(phase: ReturnType<typeof deriveFrame>['phase']): void {
    if (!this.scenario) {
      this.summaryHost.hidden = true
      return
    }
    const nodes = this.scenario.document.chain.nodes
    const hasRule = nodes.some((node) => node.type === 'rule')
    const hasMatch = nodes.some((node) => node.type === 'semantic-match' || node.type === 'image-match')
    const labels: string[] = hasRule
      ? ['感知', '判断', '输出']
      : hasMatch
        ? ['输入', '识别', '结果']
        : ['输入', '识别', '结果']
    const activeIndex = phase === 'waiting' ? 0 : phase === 'observing' ? 1 : phase === 'deciding' ? 1 : 2
    this.summaryHost.hidden = false
    this.summaryHost.textContent = ''
    labels.forEach((label, index) => {
      const chip = h('span', `stage-summary__item${index <= activeIndex ? ' stage-summary__item--done' : ''}`, label)
      this.summaryHost.append(chip)
      if (index < labels.length - 1) this.summaryHost.append(h('span', 'stage-summary__arrow', '→'))
    })
  }

  private announce(message: string): void {
    this.liveRegion.textContent = message
  }

  private setStatus(message: string, state: StageState | 'pending'): void {
    this.statusLine.textContent = message
    this.statusLine.dataset.state = state
    if (message) this.stageHost.classList.add('stage--busy')
    else this.stageHost.classList.remove('stage--busy')
  }

  // ------------------------------------------------------------------- wiring

  destroy(): void {
    this.abort?.abort()
    this.resizeObserver?.disconnect()
    this.controller.destroy()
    this.overlay.destroy()
  }
}
