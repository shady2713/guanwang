// T6: subdirectory base path acceptance — site served from /aimaster/
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:4180/aimaster'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage()
const bad = []
const reqs = []
const errs = []
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`) })
page.on('request', (r) => reqs.push(r.url()))
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 160)) })

console.log(`### T6 subdirectory base [${BASE}]`)
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 10000 })
await page.waitForTimeout(2500)
const home = await page.evaluate(() => {
  const v = document.querySelector('.stage__video')
  return {
    hero: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? null,
    footer: !!document.querySelector('footer'),
    chainNodes: document.querySelectorAll('.chain__node').length,
    base: document.querySelector('base')?.href ?? null,
    poster: v?.getAttribute('poster'), src: v?.getAttribute('src'),
    readyState: v?.readyState,
    assetUrls: [...document.querySelectorAll('script[src],link[href]')].map((e) => e.getAttribute('src') ?? e.getAttribute('href')),
    bodyChars: document.body.innerText.replace(/\s+/g, ' ').trim().length,
  }
})
console.log('home: hero=%j footer=%s chainNodes=%d bodyChars=%d readyState=%s', home.hero, home.footer, home.chainNodes, home.bodyChars, home.readyState)
console.log('home: poster=%j', home.poster)
console.log('home: script/link urls:', JSON.stringify(home.assetUrls))
console.log('non-aimaster absolute urls:', reqs.filter((u) => !u.includes('/aimaster/')).join('\n  ') || 'NONE (all relative to /aimaster/)')

const tabs = await page.locator('.task-tabs [role="tab"]').all()
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].textContent()).trim()
  await tabs[i].click()
  await page.waitForTimeout(2000)
  const s = await page.evaluate(() => {
    const v = document.querySelector('.stage__video')
    const range = document.querySelector('.stage-controls input[type=range]')
    const r = range ? { min: range.min, max: range.max, value: range.value } : null
    return { src: v?.getAttribute('src'), readyState: v?.readyState, t: +(v?.currentTime ?? 0).toFixed(2), err: v?.error?.code ?? null,
      boxes: document.querySelectorAll('.ov-box').length, rois: document.querySelectorAll('.ov-region').length,
      result: document.querySelector('.result-bar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 70),
      scrubber: r }
  })
  console.log(`tab ${i} ${label}: src=%j rs=%s err=%s t=%s boxes=%d rois=%d scrubber=%j`, s.src, s.readyState, s.err, s.t, s.boxes, s.rois, s.scrubber)
  console.log('   result:', JSON.stringify(s.result))
  // seek to the middle of the window and confirm the frame paints
  await page.evaluate(async () => {
    const v = document.querySelector('.stage__video')
    const r = document.querySelector('.stage-controls input[type=range]')
    const mid = (Number(r.min) + (Number(r.max) - Number(r.min)) * 0.5) / 1000
    v.pause(); v.currentTime = mid
    await new Promise((res) => v.addEventListener('seeked', res, { once: true }))
  })
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => ({ t: +document.querySelector('.stage__video').currentTime.toFixed(2), boxes: document.querySelectorAll('.ov-box').length, chain: document.querySelector('.chain__detail')?.textContent?.replace(/\s+/g,' ').trim().slice(0,80) }))
  console.log('   after seek: t=%s boxes=%d chain=%j', after.t, after.boxes, after.chain)
  await page.locator('.stage').screenshot({ path: path.join(OUT, `t6-subdir-tab${i}.png`) })
}
await page.screenshot({ path: path.join(OUT, 't6-subdir-home.png'), fullPage: false })

// demo page under the subdirectory
await page.goto(`${BASE}/demo/`, { waitUntil: 'load' })
await page.waitForSelector('#company', { timeout: 10000 })
const demo = await page.evaluate(() => ({
  url: location.href,
  inputs: [...document.querySelectorAll('input')].map((i) => i.id),
  btn: document.querySelector('.form button')?.textContent,
  disabled: document.querySelector('.form button')?.disabled,
  back: document.querySelector('a')?.href,
  assets: [...document.querySelectorAll('script[src],link[href]')].map((e) => e.getAttribute('src') ?? e.getAttribute('href')),
  dataFetched: performance.getEntriesByType('resource').filter((e) => e.name.includes('/data/')).map((e) => e.name),
  title: document.title,
}))
console.log('demo:', JSON.stringify(demo, null, 1))
await page.locator('a', { hasText: '返回首页' }).click()
await page.waitForTimeout(1500)
console.log('demo back -> url=%j stage=%s', await page.evaluate(() => location.href), await page.evaluate(() => !!document.querySelector('.stage__video')))
await page.screenshot({ path: path.join(OUT, 't6-subdir-demo.png') })

console.log('404 / error responses:', bad.length ? bad : 'NONE')
console.log('page errors:', errs.length ? errs : 'NONE')
await browser.close()