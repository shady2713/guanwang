/**
 * Paints the analysis layer of the video stage.
 *
 * The layer is plain SVG placed on the video content rectangle; the video file
 * itself is never modified. Compare mode re-paints the very same geometry into a
 * clipped copy so both halves always describe one single video element.
 */
import type { Point01 } from '../contracts/domain'
import type { StageFrame } from '../domain/analysis-state'
import { type Viewport, computeViewport } from './viewport-mapper'

const SVG_NS = 'http://www.w3.org/2000/svg'

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name)
}

function polygonPath(points: Point01[]): string {
  if (points.length < 3) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x * 100).toFixed(3)} ${(point.y * 100).toFixed(3)}`).join(' ') + ' Z'
}

function trailPath(points: Point01[]): string {
  if (points.length < 2) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x * 100).toFixed(3)} ${(point.y * 100).toFixed(3)}`).join(' ')
}

/** All geometry is authored in percent of the encoded frame so one viewBox
 *  (0 0 100 100) serves every rendition size. */
function cornerBox(x: number, y: number, width: number, height: number, path: SVGPathElement): void {
  const armX = Math.min(width, 1.6)
  const armY = Math.min(height, 2.2)
  path.setAttribute(
    'd',
    [
      `M ${x} ${y + armY} L ${x} ${y} L ${x + armX} ${y}`,
      `M ${x + width - armX} ${y} L ${x + width} ${y} L ${x + width} ${y + armY}`,
      `M ${x + width} ${y + height - armY} L ${x + width} ${y + height} L ${x + width - armX} ${y + height}`,
      `M ${x + armX} ${y + height} L ${x} ${y + height} L ${x} ${y + height - armY}`,
    ].join(' '),
  )
}

interface OverlayGroups {
  roi: SVGGElement
  trail: SVGGElement
  boxes: SVGGElement
}

export class StageOverlay {
  readonly element: HTMLDivElement
  private full: SVGSVGElement
  private clipped: SVGSVGElement
  private fullGroups: OverlayGroups
  private clipGroups: OverlayGroups
  private host: HTMLElement
  private encodedWidth: number
  private encodedHeight: number
  private lastFrameKey = ''
  private toastTimer = 0

  constructor(host: HTMLElement, encodedWidth: number, encodedHeight: number) {
    this.host = host
    this.encodedWidth = encodedWidth
    this.encodedHeight = encodedHeight
    this.element = document.createElement('div')
    this.element.className = 'stage__overlay'

    this.full = el('svg')
    this.clipped = el('svg')
    this.full.classList.add('stage__svg')
    this.clipped.classList.add('stage__svg', 'stage__svg--clipped')
    this.full.setAttribute('aria-hidden', 'true')
    this.clipped.setAttribute('aria-hidden', 'true')

    this.fullGroups = this.makeGroups(this.full)
    this.clipGroups = this.makeGroups(this.clipped)
    this.element.append(this.full, this.clipped)
    host.append(this.element)

    this.setEncodedSize(encodedWidth, encodedHeight)
    this.toastTimer = 0
  }

  private makeGroups(root: SVGSVGElement): OverlayGroups {
    const roi = el('g')
    roi.setAttribute('class', 'ov-roi')
    const trail = el('g')
    trail.setAttribute('class', 'ov-trail')
    const boxes = el('g')
    boxes.setAttribute('class', 'ov-boxes')
    root.append(roi, trail, boxes)
    return { roi, trail, boxes }
  }

  setEncodedSize(width: number, height: number): void {
    this.encodedWidth = width
    this.encodedHeight = height
    for (const svg of [this.full, this.clipped]) {
      svg.setAttribute('viewBox', '0 0 100 100')
      svg.setAttribute('preserveAspectRatio', 'none')
    }
    this.lastFrameKey = ''
  }

  get viewport(): Viewport {
    return computeViewport(this.encodedWidth, this.encodedHeight, this.host.clientWidth, this.host.clientHeight)
  }

  /** Places both SVG copies on the video content rectangle. */
  syncLayout(): void {
    const viewport = this.viewport
    for (const svg of [this.full, this.clipped]) {
      svg.style.left = `${viewport.offsetX}px`
      svg.style.top = `${viewport.offsetY}px`
      svg.style.width = `${viewport.contentWidth}px`
      svg.style.height = `${viewport.contentHeight}px`
    }
  }

  /**
   * Compare mode keeps one video: the analysis layer is simply revealed on one
   * side of a draggable edge, the raw pixels underneath stay untouched.
   */
  setCompare(ratio: number | null): void {
    const element = this.element
    element.classList.toggle('stage__overlay--compare', ratio !== null)
    this.clipped.style.clipPath = ratio === null ? 'none' : `inset(0 ${((1 - ratio) * 100).toFixed(2)}% 0 0)`
  }

  /** Repaints only when something actually changed; called on every frame tick. */
  update(frame: StageFrame, visible: boolean): void {
    const key = `${frame.timeSec.toFixed(3)}|${frame.targets
      .map((t) => `${t.trackId}:${t.box.x.toFixed(4)},${t.box.y.toFixed(4)},${t.box.width.toFixed(4)}`)
      .join(';')}|${frame.regions.map((r) => r.phase + r.vertices.length).join(';')}|${visible}`
    if (key === this.lastFrameKey) return
    this.lastFrameKey = key
    this.element.classList.toggle('stage__overlay--hidden', !visible || frame.targets.length === 0 && frame.regions.length === 0)
    this.paint(this.fullGroups, frame)
    this.paint(this.clipGroups, frame)
  }

  private paint(groups: OverlayGroups, frame: StageFrame): void {
    // Regions
    groups.roi.textContent = ''
    for (const region of frame.regions) {
      if (region.vertices.length < 3) continue
      const path = el('path')
      path.setAttribute('d', polygonPath(region.vertices))
      path.setAttribute('class', `ov-region ov-region--${region.phase}`)
      path.setAttribute('vector-effect', 'non-scaling-stroke')
      groups.roi.append(path)
    }

    // Trails
    groups.trail.textContent = ''
    for (const [trackId, points] of frame.trails) {
      if (points.length < 2) continue
      const path = el('path')
      path.setAttribute('d', trailPath(points))
      path.setAttribute('class', 'ov-trail-line')
      path.setAttribute('vector-effect', 'non-scaling-stroke')
      path.dataset.trackId = trackId
      groups.trail.append(path)
    }

    // Target boxes
    groups.boxes.textContent = ''
    for (const target of frame.targets) {
      const group = el('g')
      group.setAttribute('class', `ov-box${target.anchor ? ' ov-box--anchored' : ''}`)
      const x = target.box.x * 100
      const y = target.box.y * 100
      const width = target.box.width * 100
      const height = target.box.height * 100

      const path = el('path')
      path.setAttribute('class', 'ov-box-corners')
      cornerBox(x, y, width, height, path)
      path.setAttribute('vector-effect', 'non-scaling-stroke')

      const hit = el('rect')
      hit.setAttribute('x', String(x))
      hit.setAttribute('y', String(y))
      hit.setAttribute('width', String(Math.max(width, 0.9)))
      hit.setAttribute('height', String(Math.max(height, 0.9)))
      hit.setAttribute('class', 'ov-box-hit')
      hit.dataset.trackId = target.trackId

      group.append(path, hit)

      if (target.anchor) {
        const cross = el('path')
        const ax = target.anchor.x * 100
        const ay = target.anchor.y * 100
        const r = 0.7
        cross.setAttribute('d', `M ${ax - r} ${ay} L ${ax + r} ${ay} M ${ax} ${ay - r} L ${ax} ${ay + r}`)
        cross.setAttribute('class', 'ov-anchor')
        cross.setAttribute('vector-effect', 'non-scaling-stroke')
        group.append(cross)
      }
      groups.boxes.append(group)
    }
  }

  /** Compact, tappable event note. Never a full-screen panel. */
  showEventToast(event: { id: string; title: string }, onOpen: (eventId: string) => void): void {
    this.clearToast()
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'stage-toast'
    button.dataset.eventId = event.id
    button.textContent = event.title
    button.addEventListener('click', () => onOpen(event.id))
    this.element.append(button)
    this.toastTimer = window.setTimeout(() => this.clearToast(), 5200)
  }

  clearToast(): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer)
    this.toastTimer = 0
    for (const node of Array.from(this.element.querySelectorAll('.stage-toast'))) node.remove()
  }

  handleOverlayClick(event: MouseEvent): string | null {
    const target = event.target as Element | null
    const hit = target?.closest?.('.ov-box-hit') as SVGElement | null
    return hit?.dataset.trackId ?? null
  }

  destroy(): void {
    this.clearToast()
    this.element.remove()
  }
}
