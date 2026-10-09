// T3 (H17): media error fallback on the homepage
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const TAG = process.env.TAG ?? 'dev'
const MODE = process.env.MODE ?? 'abort' // abort | 404
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console:' + m.text().slice(0, 160)) })

if (MODE === 'abort') await page.route('**/media/*.web.mp4', (r) => r.abort('failed'))
else await page.route('**/media/*.web.mp4', (r) => r.fulfill({ status: 404, body: 'not found', contentType: 'text/plain' }))

console.log(`### T3 media-error fallback [${TAG}] mode=${MODE}`)
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 8000 })
await page.waitForTimeout(1800)

const tabs = await page.locator('.task-tabs [role="tab"]').all()
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].textContent()).trim()
  await tabs[i].click()
  await page.waitForTimeout(1500)
  const snap = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0
    const v = q('.stage__video')
    const cover = q('.stage__cover')
    const status = q('.stage__status')
    const btns = [...document.querySelectorAll('.stage button, .stage-controls button, .panel button')]
    return {
      bodyChars: document.body.innerText.replace(/\s+/g, ' ').trim().length,
      hero: !!q('.hero') || !!q('#hero'),
      footer: !!q('footer'),
      chainNodes: document.querySelectorAll('.chain__node').length,
      resultBarText: q('.result-bar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90) ?? null,
      posterAttr: v?.getAttribute('poster') ?? null,
      videoVisible: vis(v),
      videoErrorCode: v?.error?.code ?? null,
      videoReadyState: v?.readyState ?? null,
      coverVisible: vis(cover),
      coverText: cover?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      coverHidden: cover?.hidden ?? null,
      statusText: status?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      statusState: status?.getAttribute('data-state') ?? null,
      retryButtons: btns.map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /重试|重新|retry|reload/i.test(t)),
      allStageButtons: btns.map((b) => ({ t: b.textContent.replace(/\s+/g, ' ').trim(), ctl: b.dataset.control ?? null, dis: b.disabled })),
      spinner: [...document.querySelectorAll('[class*="spin"],[class*="loader"],[class*="loading"]')].map((e) => e.className),
    }
  })
  console.log(`\n--- tab ${i} ${label}`)
  console.log('  bodyChars=%d hero=%s footer=%s chainNodes=%d', snap.bodyChars, snap.hero, snap.footer, snap.chainNodes)
  console.log('  video: visible=%s error=%s readyState=%s poster=%j', snap.videoVisible, snap.videoErrorCode, snap.videoReadyState, snap.posterAttr)
  console.log('  cover: visible=%s hidden=%s text=%j', snap.coverVisible, snap.coverHidden, snap.coverText)
  console.log('  status: %j  [data-state=%s]', snap.statusText, snap.statusState)
  console.log('  RETRY affordances:', snap.retryButtons.length ? snap.retryButtons : '*** NONE ***')
  console.log('  stage buttons:', JSON.stringify(snap.allStageButtons))
  console.log('  spinner-ish els:', JSON.stringify(snap.spinner))
  console.log('  resultBar:', JSON.stringify(snap.resultBarText))
  await page.screenshot({ path: path.join(OUT, `t3-${TAG}-${MODE}-tab${i}.png`), fullPage: false })
}

// --- recovery: unroute, then look for a retry control
await page.unroute('**/media/*.web.mp4')
const retryLoc = page.locator('button', { hasText: /重试|重新加载|retry/i })
console.log('\nretry controls found after unroute:', await retryLoc.count())
const cover = page.locator('.stage__cover')
console.log('cover visible after unroute:', await cover.isVisible().catch(() => false))
let recovered = 'NOT-TESTED'
if (await retryLoc.count() > 0) {
  await retryLoc.first().click()
  await page.waitForTimeout(2500)
  recovered = await page.evaluate(() => ({
    err: document.querySelector('.stage__video')?.error?.code ?? null,
    rs: document.querySelector('.stage__video')?.readyState ?? null,
    status: document.querySelector('.stage__status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }))
  console.log('after clicking retry:', JSON.stringify(recovered))
} else {
  // diagnostic: does the cover (播放演示画面) affordance recover it?
  console.log('no retry control -> probing the cover button instead')
  if (await cover.isVisible().catch(() => false)) {
    await cover.click()
    await page.waitForTimeout(2500)
    const r = await page.evaluate(() => ({
      err: document.querySelector('.stage__video')?.error?.code ?? null,
      rs: document.querySelector('.stage__video')?.readyState ?? null,
      status: document.querySelector('.stage__status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      t: document.querySelector('.stage__video')?.currentTime ?? null,
    }))
    recovered = r
    console.log('after clicking cover (播放演示画面):', JSON.stringify(r))
  } else recovered = 'no affordance visible at all'
}
console.log('recovery result:', JSON.stringify(recovered))
await page.screenshot({ path: path.join(OUT, `t3-${TAG}-${MODE}-recovery.png`) })
console.log('page errors:', pageErrors.length ? pageErrors : 'none')
await browser.close()