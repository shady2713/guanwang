import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1360, height: 800 } })
const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`.slice(0, 300)))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`.slice(0, 300)))
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url()}`)
})
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1000)
await page.evaluate(async () => {
  const v = document.querySelector('.stage__video')
  v.pause()
  v.currentTime = 2.36
  await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
})
await page.waitForTimeout(500)
const state = await page.evaluate(() => {
  const svg = document.querySelector('.stage__svg')
  const clipped = document.querySelector('.stage__svg--clipped')
  return {
    svgFound: !!svg,
    svgBox: svg ? JSON.stringify(svg.getBoundingClientRect()) : null,
    svgAttr: svg ? { viewBox: svg.getAttribute('viewBox'), cls: svg.getAttribute('class'), style: svg.getAttribute('style') } : null,
    children: svg ? svg.innerHTML.slice(0, 400) : null,
    childCount: svg ? svg.querySelectorAll('*').length : -1,
    clippedCount: clipped ? clipped.querySelectorAll('*').length : -1,
    groups: [...document.querySelectorAll('.stage__svg > g')].map((g) => ({ cls: g.getAttribute('class'), n: g.children.length })),
    videoRect: JSON.stringify(document.querySelector('.stage__video').getBoundingClientRect()),
  }
})
console.log(JSON.stringify(state, null, 1))
console.log('--- logs ---')
console.log(logs.join('\n'))
await browser.close()
