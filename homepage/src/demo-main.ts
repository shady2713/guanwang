import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'

import { createAppConfig } from './config/app-config'
import { StaticContentBundle, createProviders } from './providers/static-providers'

/**
 * Standalone booking page (/demo/).
 *
 * The form has no action and the button is type="button", so a no-JS visitor can
 * never turn the fields into a GET query string, and nothing is stored locally.
 */
async function boot(): Promise<void> {
  const config = createAppConfig('../')
  const bundleProvider = new StaticContentBundle(config)
  const context = { requestId: 'demo', signal: new AbortController().signal }
  const bundle = await bundleProvider.load(context)
  const providers = createProviders(config, bundleProvider, bundle.labels.leadNotice)

  const root = document.querySelector<HTMLElement>('#demo-root')
  if (!root) throw new Error('缺少 #demo-root 挂载点')

  // The measure and gutters live on .demo; #demo-root is only the mount point.
  const page = document.createElement('div')
  page.className = 'demo'
  root.append(page)

  const back = document.createElement('a')
  back.className = 'link'
  back.href = new URL('../', document.baseURI).href
  back.textContent = '返回首页'

  const title = document.createElement('h1')
  title.className = 'demo__title'
  title.textContent = '预约产品演示'

  const lead = document.createElement('p')
  lead.className = 'demo__lead'
  lead.textContent = '留下公司名称与联系方式，我们据此安排演示。'

  const notice = document.createElement('p')
  notice.className = 'notice'
  notice.setAttribute('role', 'status')
  notice.textContent = bundle.labels.leadNotice

  const form = document.createElement('form')
  form.className = 'form'
  form.noValidate = true
  form.addEventListener('submit', (event) => event.preventDefault())

  const fields: Array<{ id: string; label: string; type: 'text'; autocomplete: AutoFill }> = [
    { id: 'company', label: '公司名称', type: 'text', autocomplete: 'organization' },
    { id: 'contact', label: '联系方式', type: 'text', autocomplete: 'email' },
  ]
  for (const field of fields) {
    const wrapper = document.createElement('div')
    wrapper.className = 'field'
    const label = document.createElement('label')
    label.className = 'field__label'
    label.htmlFor = field.id
    label.textContent = field.label
    const input = document.createElement('input')
    input.className = 'field__input'
    input.id = field.id
    input.type = field.type
    input.autocomplete = field.autocomplete
    // No name attribute: the values are never serialized into a URL.
    wrapper.append(label, input)
    form.append(wrapper)
  }

  const submit = document.createElement('button')
  submit.className = 'btn btn--primary btn--block'
  submit.type = 'button'
  submit.textContent = '提交预约'
  submit.addEventListener('click', async () => {
    submit.disabled = true
    const result = await providers.lead.submit(
      {
        companyName: (document.querySelector<HTMLInputElement>('#company')?.value ?? '').trim(),
        contact: (document.querySelector<HTMLInputElement>('#contact')?.value ?? '').trim(),
        context: { source: 'homepage' },
      },
      { requestId: 'demo-submit', signal: new AbortController().signal },
    )
    notice.textContent = result.status === 'received' ? `已收到，编号 ${result.receiptId}` : result.message
    notice.dataset.state = result.status
    submit.disabled = false
  })
  form.append(submit)

  if (!config.flags.leadSubmission) {
    // Static build: the control states the limit instead of pretending to work.
    submit.disabled = true
    submit.textContent = '当前不可提交'
    submit.setAttribute('aria-disabled', 'true')
  }

  const status = document.createElement('p')
  status.className = 'demo__hint'
  status.textContent = '当前为静态演示版本，页面不会发送或保存你填写的内容。'

  root.append(back, title, lead, notice, form, status)
}

boot().catch((error: unknown) => {
  console.error(error)
  const root = document.querySelector('#demo-root')
  if (!root) return
  const message = document.createElement('p')
  message.className = 'fatal'
  message.textContent = '页面数据未能加载，请稍后重试。'
  root.append(message)
})
