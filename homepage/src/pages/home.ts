import type { PublicAppConfig, Providers } from '../contracts/domain'
import type { StaticBundle } from '../providers/static-providers'
import { CapabilityStage } from './capability-stage'
import { Hero } from './hero'
import { Navigation } from './navigation'
import { StaticSections } from './static-sections'

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildFooter(config: PublicAppConfig, brand: string): HTMLElement {
  const footer = h('footer', 'site-footer')
  footer.id = 'site-footer'
  const inner = h('div', 'site-footer__inner')
  inner.append(h('p', 'brand brand--footer', brand))
  inner.append(h('p', 'site-footer__note', '页面内容为功能演示，分析结果与标注用于说明分析流程。'))
  const links = h('nav', 'site-footer__links')
  links.setAttribute('aria-label', '页脚导航')
  const top = h('a', 'site-nav__link', '返回顶部')
  top.href = '#hero'
  const demo = h('a', 'site-nav__link', '预约演示')
  demo.href = new URL('./demo/', document.baseURI).href
  const home = h('a', 'site-nav__link', '首页')
  home.href = new URL('./', document.baseURI).href
  links.append(home, demo, top)
  inner.append(links)
  footer.append(inner)
  void config
  return footer
}

export interface MountedHome {
  destroy: () => void
}

export async function mountHome(
  app: HTMLElement,
  config: PublicAppConfig,
  providers: Providers,
  bundle: StaticBundle,
  page: import('../contracts/domain').PageContent,
): Promise<MountedHome> {
  const navigation = new Navigation({
    brand: page.brand,
    items: bundle.labels.navigation,
    ctaLabel: bundle.labels.sections.cta?.button ?? '预约演示',
    ctaHref: bundle.labels.sections.cta?.href ?? 'demo/',
  })
  app.append(navigation.element)

  const main = app.querySelector('main#home')
  if (!main) throw new Error('首页缺少 main#home 挂载点')

  const hero = new Hero({ page, ctaLabel: page.hero.primaryCta.label, mediaStatus: bundle.labels.heroMediaStatus })
  main.append(hero.element)

  const stageHost = h('div', 'stage-host')
  const sections = new StaticSections({
    labels: bundle.labels,
    providers,
    posters: {
      industry: new URL('media/posters/industry.jpg', config.basePath).href,
      language: new URL('media/posters/language.jpg', config.basePath).href,
      image: new URL('media/posters/image-search.jpg', config.basePath).href,
    },
  })
  main.append(stageHost, sections.smallTargets, sections.applications, sections.integration, sections.cta)

  const stage = new CapabilityStage(stageHost, { config, providers, bundle, page })
  await stage.start()

  app.append(buildFooter(config, page.brand))

  return {
    destroy: () => {
      stage.destroy()
    },
  }
}
