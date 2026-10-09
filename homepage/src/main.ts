import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/stage.css'

import { createAppConfig } from './config/app-config'
import { StaticContentBundle, StaticContentProvider, createProviders } from './providers/static-providers'
import { mountHome } from './pages/home'

function showFatal(message: string): void {
  const app = document.querySelector('#app')
  if (!app) return
  const box = document.createElement('div')
  box.className = 'fatal'
  const title = document.createElement('h1')
  title.textContent = '页面数据未能加载'
  const text = document.createElement('p')
  text.textContent = message
  const hint = document.createElement('p')
  hint.className = 'fatal__hint'
  hint.textContent = '请确认静态数据目录（data/）随站点一起发布，然后刷新页面。'
  box.append(title, text, hint)
  app.append(box)
}

async function boot(): Promise<void> {
  const config = createAppConfig('./')
  const bundleProvider = new StaticContentBundle(config)
  const contentProvider = new StaticContentProvider(config)
  const context = { requestId: 'boot', signal: new AbortController().signal }

  const [bundle, page] = await Promise.all([bundleProvider.load(context), contentProvider.getHome(context)])

  const providers = createProviders(config, bundleProvider, bundle.labels.leadNotice)
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) throw new Error('缺少 #app 挂载点')
  await mountHome(app, config, providers, bundle, page)
}

boot().catch((error: unknown) => {
  console.error(error)
  showFatal(error instanceof Error ? error.message : '未知错误')
})
