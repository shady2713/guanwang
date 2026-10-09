import type { NavItem } from '../contracts/app-content'

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface NavigationOptions {
  brand: string
  items: NavItem[]
  ctaLabel: string
  ctaHref: string
}

export class Navigation {
  readonly element: HTMLElement
  private menuButton: HTMLButtonElement
  private panel: HTMLDivElement
  private scrolled = false

  constructor(options: NavigationOptions) {
    this.element = h('header', 'site-header')
    this.element.id = 'site-header'

    const inner = h('div', 'site-header__inner')
    const brand = h('a', 'brand', options.brand)
    brand.href = new URL('./', document.baseURI).href
    brand.setAttribute('aria-label', `${options.brand} 首页`)

    const nav = h('nav', 'site-nav')
    nav.setAttribute('aria-label', '主导航')
    for (const item of options.items) {
      const link = h('a', 'site-nav__link', item.label)
      link.href = new URL(item.href, document.baseURI).href
      if (item.href.startsWith('#')) {
        link.addEventListener('click', (event) => {
          const target = document.querySelector(item.href)
          if (!target) return
          event.preventDefault()
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
      nav.append(link)
    }

    const cta = h('a', 'btn btn--primary site-header__cta', options.ctaLabel)
    cta.href = new URL(options.ctaHref, document.baseURI).href

    this.menuButton = h('button', 'site-header__menu')
    this.menuButton.type = 'button'
    this.menuButton.setAttribute('aria-expanded', 'false')
    this.menuButton.setAttribute('aria-controls', 'site-menu')
    this.menuButton.setAttribute('aria-label', '打开菜单')
    this.menuButton.innerHTML = '<span aria-hidden="true"></span>'

    this.panel = h('div', 'site-menu')
    this.panel.id = 'site-menu'
    this.panel.hidden = true
    for (const item of options.items) {
      const link = h('a', 'site-menu__link', item.label)
      link.href = new URL(item.href, document.baseURI).href
      this.panel.append(link)
    }
    const panelCta = h('a', 'btn btn--primary site-menu__cta', options.ctaLabel)
    panelCta.href = new URL(options.ctaHref, document.baseURI).href
    this.panel.append(panelCta)

    this.menuButton.addEventListener('click', () => this.toggleMenu())
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.panel.hidden) this.closeMenu()
    })

    inner.append(brand, nav, cta, this.menuButton)
    this.element.append(inner, this.panel)

    const onScroll = (): void => {
      const next = window.scrollY > 24
      if (next === this.scrolled) return
      this.scrolled = next
      this.element.classList.toggle('site-header--compact', next)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  private toggleMenu(): void {
    if (this.panel.hidden) this.openMenu()
    else this.closeMenu()
  }

  private openMenu(): void {
    this.panel.hidden = false
    this.menuButton.setAttribute('aria-expanded', 'true')
    this.menuButton.setAttribute('aria-label', '关闭菜单')
    this.element.classList.add('site-header--menu-open')
  }

  private closeMenu(): void {
    this.panel.hidden = true
    this.menuButton.setAttribute('aria-expanded', 'false')
    this.menuButton.setAttribute('aria-label', '打开菜单')
    this.element.classList.remove('site-header--menu-open')
    this.menuButton.focus()
  }
}
