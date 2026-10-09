import type { PageContent } from '../contracts/domain'

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface HeroOptions {
  page: PageContent
  ctaLabel: string
  mediaStatus: string
}

/**
 * The confirmed banner art is still missing. The mount, the copy and the media
 * slot are real: dropping one image file into public/media/hero/ finishes it
 * without touching layout, and the status line stays honest until then.
 */
export class Hero {
  readonly element: HTMLElement

  constructor(options: HeroOptions) {
    const { page } = options
    this.element = h('section', 'section hero')
    this.element.id = 'hero'

    const inner = h('div', 'hero__inner')
    const copy = h('div', 'hero__copy')
    const title = h('h1', 'hero__title')
    for (const line of page.hero.title) {
      const span = h('span', 'hero__line', line)
      title.append(span)
    }
    copy.append(title)
    copy.append(h('p', 'hero__subtitle', page.hero.subtitle))

    const actions = h('div', 'hero__actions')
    const primary = h('a', 'btn btn--primary', options.ctaLabel)
    primary.href = new URL(page.hero.primaryCta.href, document.baseURI).href
    const secondary = h('a', 'btn', '预约演示')
    secondary.href = new URL('./demo/', document.baseURI).href
    actions.append(primary, secondary)
    copy.append(actions)

    const media = h('div', 'hero__media')
    const figure = h('figure', 'hero__figure')
    const image = h('img', 'hero__image')
    image.alt = '已确认的首页主视觉：城市水面、门形高楼与无人机（素材待补）'
    image.width = 1440
    image.height = 810
    image.decoding = 'async'
    figure.append(image)
    const badge = h('figcaption', 'hero__badge', '场景示意')
    figure.append(badge)
    const note = h('p', 'hero__note')
    note.append(h('strong', '', '主视觉素材待补：'))
    note.append(
      document.createTextNode(
        '已确认的独立干净背景图尚未提供，暂不铺入其它场景或业务视频。补图时只需替换 public/media/hero/ 下的同名文件。',
      ),
    )
    figure.append(note)
    media.append(figure)
    media.dataset.status = options.mediaStatus

    inner.append(copy, media)
    this.element.append(inner)
  }
}
