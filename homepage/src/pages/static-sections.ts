import type { InterfaceLabels } from '../contracts/app-content'
import type { Providers } from '../contracts/domain'

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface StaticSectionOptions {
  labels: InterfaceLabels
  providers: Providers
  posters: { industry: string; language: string; image: string }
}

const APPLICATION_COPY: Record<string, { title: string; text: string }> = {
  交通巡查: {
    title: '关注指定区域的车辆活动',
    text: '关联连续画面，形成活动线索与相关影像。',
  },
  城市管理: {
    title: '关注城市活动目标的持续变化',
    text: '在同一段画面里跟踪同一目标，判断它与关注区域的关系。',
  },
  水务巡查: {
    title: '关注水面与岸线周边的目标',
    text: '以任务配置目标类型与判断条件，输出可核对的画面证据。',
  },
  工地安全: {
    title: '关注作业面上的进入行为',
    text: '把画面、区域与事件关联，形成可回看的片段线索。',
  },
}

/** Everything below the stage that is copy plus real stills from the demo clips. */
export class StaticSections {
  readonly smallTargets: HTMLElement
  readonly applications: HTMLElement
  readonly integration: HTMLElement
  readonly cta: HTMLElement

  constructor(options: StaticSectionOptions) {
    const { labels, posters } = options
    const sections = labels.sections as Record<
      string,
      {
        title?: string
        cta?: string
        categories?: string[]
        summary?: string
        link?: { title?: string; button?: string; href?: string }
      }
    >

    // --- small targets -----------------------------------------------------
    this.smallTargets = h('section', 'section section--small-targets')
    this.smallTargets.id = 'small-targets'
    const smallHead = h('div', 'section__head')
    smallHead.append(h('h2', 'section__title', sections.smallTargets?.title ?? '航拍小目标，保留更多识别细节'))
    smallHead.append(h('p', 'section__lead', '对原图分块分析，再把结果合并回同一画面。'))
    this.smallTargets.append(smallHead)
    const strip = h('div', 'still-strip')
    const stages = [
      { label: '原始影像', image: posters.industry },
      { label: '分块检测', image: posters.image },
      { label: '结果合并', image: posters.language },
    ]
    for (const stage of stages) {
      const figure = h('figure', 'still')
      const image = h('img', 'still__image')
      image.src = stage.image
      image.alt = `${stage.label}示意画面（取自演示视频真实帧）`
      image.width = 420
      image.height = 236
      image.loading = 'lazy'
      image.decoding = 'async'
      figure.append(image, h('figcaption', 'still__caption', stage.label))
      strip.append(figure)
    }
    this.smallTargets.append(strip)
    const smallCta = h('a', 'link', sections.smallTargets?.cta ?? '查看分析流程')
    smallCta.href = '#capabilities'
    this.smallTargets.append(smallCta)

    // --- applications ------------------------------------------------------
    this.applications = h('section', 'section section--applications')
    this.applications.id = 'applications'
    const appHead = h('div', 'section__head')
    appHead.append(h('h2', 'section__title', sections.applications?.title ?? '面向实际巡查任务'))
    const categories = sections.applications?.categories ?? ['交通巡查', '城市管理', '水务巡查', '工地安全']
    const tabs = h('div', 'category-tabs')
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', '巡查场景')
    const panel = h('div', 'category-panel')
    panel.id = 'category-panel'
    panel.setAttribute('role', 'tabpanel')

    const show = (name: string, index: number): void => {
      const copy = APPLICATION_COPY[name] ?? { title: name, text: '' }
      panel.textContent = ''
      const figure = h('figure', 'category-panel__figure')
      const image = h('img', 'category-panel__image')
      image.src = [posters.industry, posters.image, posters.language, posters.industry][index % 4] ?? posters.industry
      image.alt = `${name}场景示意（取自演示视频真实帧）`
      image.width = 720
      image.height = 405
      image.loading = 'lazy'
      figure.append(image, h('figcaption', 'category-panel__badge', '场景示意'))
      const text = h('div', 'category-panel__text')
      text.append(h('h3', '', copy.title), h('p', '', copy.text))
      panel.append(figure, text)
      tabs.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        const active = button.dataset.category === name
        button.setAttribute('aria-selected', String(active))
        button.tabIndex = active ? 0 : -1
      })
      panel.setAttribute('aria-labelledby', `category-tab-${index}`)
    }

    categories.forEach((name, index) => {
      const button = h('button', 'category-tab', name)
      button.type = 'button'
      button.id = `category-tab-${index}`
      button.dataset.category = name
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', String(index === 0))
      button.setAttribute('aria-controls', 'category-panel')
      button.tabIndex = index === 0 ? 0 : -1
      button.addEventListener('click', () => show(name, index))
      tabs.append(button)
    })
    show(categories[0] ?? '交通巡查', 0)
    this.applications.append(appHead, tabs, panel)

    // --- integration -------------------------------------------------------
    this.integration = h('section', 'section section--integration')
    this.integration.id = 'integration'
    const intHead = h('div', 'section__head')
    intHead.append(h('h2', 'section__title', sections.integration?.title ?? '融入现有业务系统'))
    intHead.append(h('p', 'section__lead', sections.integration?.summary ?? '私有化部署 · API 集成'))
    this.integration.append(intHead)

    const flow = h('ol', 'flow')
    for (const [index, step] of ['影像输入', '分析流程', '业务系统'].entries()) {
      const item = h('li', 'flow__item')
      item.append(h('span', 'flow__index', String(index + 1)), h('span', '', step))
      flow.append(item)
    }
    this.integration.append(flow)

    const details = h('details', 'disclosure')
    const summary = h('summary', 'btn btn--ghost', '了解接入方式')
    details.append(summary)
    const body = h('div', 'disclosure__body')
    body.append(
      h(
        'p',
        '',
        '产品提供授权、部署接入、模型适配与更新维护四类能力。接入方式、接口路径与权限范围属于交付内容，公开页面只说明能力范围，不展示接口细节。',
      ),
    )
    details.append(body)
    this.integration.append(details)

    // --- cta ---------------------------------------------------------------
    this.cta = h('section', 'section section--cta')
    this.cta.id = 'book-demo'
    const ctaInner = h('div', 'cta')
    ctaInner.append(h('h2', 'cta__title', sections.cta?.title ?? '预约产品演示'))
    ctaInner.append(h('p', 'cta__text', '结合业务场景，了解识别能力与部署方式。'))
    const ctaButton = h('a', 'btn btn--primary', sections.cta?.link?.button ?? '预约演示')
    ctaButton.href = new URL(sections.cta?.link?.href ?? 'demo/', document.baseURI).href
    ctaInner.append(ctaButton)
    this.cta.append(ctaInner)
  }
}
