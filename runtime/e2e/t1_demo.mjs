// T1 (H18/H21) + T2 (H21b): /demo/ standalone acceptance
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const TAG = process.env.TAG ?? 'dev'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } })
const page = await ctx.newPage()

const pageErrors = []
const requests = []
const badResponses = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 200)) })
page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`))
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`) })

console.log(`### T1 against ${BASE}/demo/  [${TAG}]`)
await page.goto(`${BASE}/demo/`, { waitUntil: 'load' })
await page.waitForSelector('#company', { timeout: 8000 })
await page.waitForTimeout(400)

// --- structure
const struct = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].map((i) => ({
    id: i.id, type: i.type, name: i.getAttribute('name'), label: document.querySelector(`label[for="${i.id}"]`)?.textContent ?? null,
  }))
  const btn = document.querySelector('.form button')
  const form = document.querySelector('form')
  return {
    title: document.title,
    inputs,
    inputCount: inputs.length,
    forms: document.querySelectorAll('form').length,
    btnText: btn?.textContent ?? null,
    btnDisabled: btn?.disabled ?? null,
    btnAriaDisabled: btn?.getAttribute('aria-disabled') ?? null,
    btnType: btn?.getAttribute('type') ?? null,
    btnInForm: !!btn && !!form && form.contains(btn),
    formAction: form?.getAttribute('action') ?? null,
    formMethod: form?.getAttribute('method') ?? null,
    backLinks: [...document.querySelectorAll('a')].map((a) => ({ text: a.textContent?.trim(), href: a.href })),
    bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
    statusLine: document.querySelector('.notice')?.textContent?.trim() ?? null,
    hint: document.querySelector('.demo__hint')?.textContent?.trim() ?? null,
  }
})
console.log('title:', struct.title)
console.log('inputs:', JSON.stringify(struct.inputs))
console.log('forms on page:', struct.forms)
console.log('submit: text=%j disabled=%s aria-disabled=%j type=%j inForm=%j form.action=%j form.method=%j',
  struct.btnText, struct.btnDisabled, struct.btnAriaDisabled, struct.btnType, struct.btnInForm, struct.formAction, struct.formMethod)
console.log('links:', JSON.stringify(struct.backLinks))
console.log('notice:', JSON.stringify(struct.statusLine))
console.log('hint:', JSON.stringify(struct.hint))
console.log('body:', struct.bodyText.slice(0, 300))
console.log('badResponses:', badResponses.length ? badResponses : 'none')

// --- click the submit (JS-dispatched, since a real user cannot press a disabled button)
const marker = requests.length
const clickResult = await page.evaluate(() => {
  const btn = document.querySelector('.form button')
  let fired = false
  btn.addEventListener('click', () => { fired = true }, { once: true })
  let threw = null
  try { btn.click() } catch (e) { threw = String(e) }
  // also try the form's own submit path, which no-JS/Enter could reach
  let formThrew = null
  try { document.querySelector('form').requestSubmit() } catch (e) { formThrew = String(e) }
  return { fired, threw, formThrew }
})
await page.waitForTimeout(700)
const clickRequests = requests.slice(marker).filter((u) => !u.match(/favicon|\.(png|jpg|css)$/))
const afterClick = await page.evaluate(() => ({
  bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
  btnText: document.querySelector('.form button')?.textContent ?? null,
  btnDisabled: document.querySelector('.form button')?.disabled ?? null,
  url: location.href,
}))
console.log('click: handlerFired=%s threw=%j requestSubmitThrew=%j', clickResult.fired, clickResult.threw, clickResult.formThrew)
console.log('click: network requests after click =', clickRequests.length ? clickRequests : 'NONE')
console.log('click: url unchanged =', afterClick.url === `${BASE}/demo/`, afterClick.url)
console.log('click: btn text/disabled after =', afterClick.btnText, afterClick.btnDisabled)
console.log('click: body contains 已收到/成功/提交成功 ?', /已收到|成功|提交成功|success|submitted/i.test(afterClick.bodyText))
console.log('click: body tail:', afterClick.bodyText.slice(0, 300))

// --- persistence: typing then reload
await page.fill('#company', '测试公司ABC')
await page.fill('#contact', 'test@example.com')
const storage = await page.evaluate(() => ({
  ls: Object.entries(localStorage), ss: Object.entries(sessionStorage),
  cookies: document.cookie, url: location.href,
}))
console.log('typed: localStorage=%j sessionStorage=%j cookie=%j', storage.ls, storage.ss, storage.cookies)
console.log('typed: no query string in url =', !storage.url.includes('?'), storage.url)
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('#company', { timeout: 8000 })
await page.waitForTimeout(300)
const afterReload = await page.evaluate(() => ({
  company: document.querySelector('#company')?.value ?? null,
  contact: document.querySelector('#contact')?.value ?? null,
  ls: Object.keys(localStorage).length, ss: Object.keys(sessionStorage).length,
}))
console.log('after reload: company=%j contact=%j localStorageKeys=%d sessionStorageKeys=%d',
  afterReload.company, afterReload.contact, afterReload.ls, afterReload.ss)

await page.screenshot({ path: path.join(OUT, `t1-demo-${TAG}.png`), fullPage: true })

// --- 返回首页 link
const back = page.locator('a', { hasText: '返回首页' }).first()
console.log('back link count:', await page.locator('a', { hasText: '返回首页' }).count())
await back.click()
await page.waitForTimeout(1200)
const homeAfter = await page.evaluate(() => ({
  url: location.href,
  hasStage: !!document.querySelector('.stage__video'),
  hero: document.querySelector('.hero, .section--hero, h1')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null,
}))
console.log('back click -> url=%j stage=%s hero=%j', homeAfter.url, homeAfter.hasStage, homeAfter.hero)

// --- T2: direct reload of /demo/ again + homepage link to /demo/
await page.goto(`${BASE}/demo/`, { waitUntil: 'load' })
await page.waitForSelector('#company', { timeout: 8000 })
console.log('T2 direct reload of /demo/: OK, title=%j, submit=%j', await page.title(), await page.locator('.form button').textContent())

const demoLinks = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /demo/i.test(a.getAttribute('href') ?? '')).map((a) => ({ text: a.textContent?.trim(), href: a.href })))
console.log('T2 homepage -> /demo/ links:', JSON.stringify(demoLinks))
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForTimeout(800)
const footerLinks = await page.evaluate(() => [...document.querySelectorAll('footer a, .footer a, a')].filter((a) => /demo/i.test(a.getAttribute('href') ?? '')).map((a) => ({ text: a.textContent?.replace(/\s+/g,' ').trim(), href: a.getAttribute('href'), abs: a.href })))
console.log('T2 footer/nav demo links:', JSON.stringify(footerLinks))
badResponses.length = 0
requests.length = 0
if (footerLinks.length) {
  await page.locator(`a[href*="demo"]`).first().click()
  await page.waitForTimeout(1200)
  const landed = await page.evaluate(() => ({ url: location.href, root: !!document.querySelector('#demo-root'), btn: document.querySelector('.form button')?.textContent ?? null }))
  console.log('T2 click demo link -> url=%j #demo-root=%s btn=%j', landed.url, landed.root, landed.btn)
} else {
  console.log('T2 NO link to /demo/ found on homepage')
}
console.log('T2 bad responses on nav:', badResponses.length ? badResponses : 'none')
console.log('T2 page errors:', pageErrors.length ? pageErrors : 'none')
console.log('T2 all requests during homepage load:', requests.filter(u=>!u.includes('favicon')))

await browser.close()